// Tahap PRD: generate lewat antrean job (teks tersusun terbaca lewat polling), spec terstruktur di background.
import { Router } from 'express';
import { projectWhere } from '../lib/access.js';
import { prisma } from '../lib/prisma.js';
import { logger, serializeError } from '../lib/logger.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { getUserPlan } from '../lib/billing.js';
import { isStageLocked } from '../lib/stage.js';
import { buildChatHistory, generatePrdMarkdownStream, readPrdContent } from '../lib/ai/prd.js';
import { extractProductSpec } from '../lib/ai/product-spec.js';
import { applyProductSpec, savePrd } from '../lib/prd-store.js';
import {
  enqueueAiJobOnce,
  getLatestJob,
  NonRetryableJobError,
  registerJobHandler,
  rejectJobLimit,
  reportJobProgress,
  toClientStatus,
} from '../lib/ai/job.js';

export const prdRouter = Router();

/** Jeda minimum antar penulisan teks sementara ke hasil job (polling klien 1,5 dtk). */
const PROGRESS_FLUSH_MS = 1500;

registerJobHandler('prd_generate', async ({ jobId, projectId, userId, assertActive }) => {
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { stacks: true } });
  if (!project) throw new NonRetryableJobError('Project tidak ditemukan.');

  const surveyQuestions = await prisma.discoveryQuestion.findMany({
    where: { projectId },
    include: { answers: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: [{ round: 'asc' }, { order: 'asc' }],
  });
  const surveyQA = surveyQuestions
    .filter((q) => q.answers.length > 0 && q.answers[0].answer)
    .map((q) => ({ question: q.question, answer: q.answers[0].answer }));

  const chatSession = await prisma.chatSession.findFirst({
    where: { projectId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  const chatHistory = buildChatHistory(chatSession?.messages ?? [], project.idea);

  const techStack = project.stacks.length > 0
    ? project.stacks.map((s) => `${s.category}: ${s.name}${s.version ? ` (${s.version})` : ''}`)
    : undefined;

  // Teks yang sudah tersusun ditulis berkala ke hasil job supaya halaman PRD bisa menampilkannya bertahap.
  let written = '';
  let lastFlush = 0;
  let pending: Promise<unknown> = Promise.resolve();
  const flush = (force: boolean) => {
    const now = Date.now();
    if (!force && now - lastFlush < PROGRESS_FLUSH_MS) return;
    lastFlush = now;
    const snapshot = written;
    pending = pending.then(() => reportJobProgress(jobId, { phase: 'writing', markdown: snapshot })).catch(() => undefined);
  };

  let prd;
  try {
    prd = await generatePrdMarkdownStream(
      { idea: project.idea, questions: surveyQA, projectId, techStack, chatHistory },
      (delta) => {
        assertActive();
        written += delta;
        flush(false);
      },
    );
  } catch (err) {
    // Kegagalan AI tidak diulang otomatis: mengulang berarti menulis ulang seluruh dokumen.
    throw new NonRetryableJobError((err as Error).message);
  }
  flush(true);
  await pending;
  assertActive();

  await savePrd(projectId, prd);

  // Spec terstruktur disusun di background; PRD sudah bisa dibaca user.
  try {
    await enqueueAiJobOnce({ projectId, type: 'prd_spec', userId, maxAttempts: 1 });
  } catch (err) {
    logger.warn('Gagal memasukkan job spec PRD ke antrean', { scope: 'prd', projectId, error: serializeError(err) });
  }
  return { phase: 'done' };
});

registerJobHandler('prd_spec', async ({ projectId, assertActive }) => {
  const row = await prisma.prd.findUnique({ where: { projectId } });
  if (!row) throw new NonRetryableJobError('PRD belum dibuat.');
  const doc = readPrdContent(row.content);
  if (doc.spec) return { applied: false, reason: 'sudah ada' };

  const spec = await extractProductSpec({ markdown: doc.markdown, projectId });
  assertActive();
  return { applied: await applyProductSpec(projectId, row.version, spec) };
});

prdRouter.post(['/api/projects/:id/prd/generate', '/api/projects/:id/brd/generate'], requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({ where: projectWhere(req.userId, req.params.id) });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const { plan } = await getUserPlan(req.userId);
  if (plan === 'free') {
    return res.status(403).json({
      error: 'Paket Free tidak dapat menghasilkan dokumen PRD. Silakan upgrade paket untuk melanjutkan.',
      code: 'plan_upgrade_required',
      plan,
      upgradeUrl: '/pricing',
    });
  }

  const existing = await prisma.prd.findUnique({ where: { projectId: project.id }, select: { id: true } });
  if (existing && isStageLocked(project.wizardStep, 'prd')) {
    return res.status(403).json({ error: 'Dokumen PRD telah selesai dan terkunci (Read-Only).' });
  }

  try {
    // Idempoten di level DB dan lintas instance: generate ganda hanya menghasilkan satu job.
    await enqueueAiJobOnce({ projectId: project.id, type: 'prd_generate', userId: req.userId });
    res.json({ ok: true, status: 'generating' });
  } catch (err) {
    logger.error('Gagal memulai generate PRD', { scope: 'prd', error: serializeError(err) });
    if (rejectJobLimit(res, err)) return;
    res.status(502).json({ error: 'Gagal memulai penyusunan PRD.' });
  }
});

prdRouter.get(['/api/projects/:id/prd', '/api/projects/:id/brd'], requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({ where: projectWhere(req.userId, req.params.id) });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });
  const prd = await prisma.prd.findUnique({ where: { projectId: project.id } });

  // Status spec terstruktur: 'done' bila sudah menempel di PRD; selain itu ikut job prd_spec terakhir.
  let specStatus = 'idle';
  let specError: string | null = null;
  if (prd) {
    if (readPrdContent(prd.content).spec) {
      specStatus = 'done';
    } else {
      const job = await getLatestJob(project.id, 'prd_spec');
      specStatus = job?.status === 'done' ? 'idle' : toClientStatus(job?.status);
      specError = job?.status === 'failed' ? job.error : null;
    }
  }
  res.json({ prd, brd: prd, specStatus, specError });
});

// Ekstraksi ulang spec terstruktur (mis. setelah ekstraksi otomatis gagal, atau untuk PRD lama). Berjalan sebagai job.
prdRouter.post('/api/projects/:id/prd/spec/extract', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({ where: projectWhere(req.userId, req.params.id), select: { id: true } });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });
  if (!(await prisma.prd.findUnique({ where: { projectId: project.id }, select: { id: true } }))) {
    return res.status(404).json({ error: 'PRD belum dibuat.' });
  }

  try {
    await enqueueAiJobOnce({ projectId: project.id, type: 'prd_spec', userId: req.userId, maxAttempts: 1 });
    res.json({ ok: true, status: 'generating' });
  } catch (err) {
    if (rejectJobLimit(res, err)) return;
    res.status(502).json({ error: 'Gagal memulai ekstraksi spec PRD.' });
  }
});
