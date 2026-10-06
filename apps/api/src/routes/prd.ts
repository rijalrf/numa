// Step 2: generate PRD dari ide + tech stack + chat history (SSE streaming).
import { Router } from 'express';
import { snapshotArtifact } from '../lib/artifact-version.js';
import { projectWhere } from '../lib/access.js';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { getUserPlan } from '../lib/billing.js';
import { isStageLocked } from '../lib/stage.js';
import { generatePrdMarkdownStream } from '../lib/ai/prd.js';
import { extractProductSpec } from '../lib/ai/product-spec.js';
import { ensureProductSpec } from '../lib/prd-spec.js';

export const prdRouter = Router();

// Lock in-memory per project — mencegah generate PRD ganda
const projectPrdGenerationLocks = new Set<string>();


prdRouter.post(['/api/projects/:id/prd/generate', '/api/projects/:id/brd/generate'], requireUser, async (req: AuthedRequest, res) => {
  if (projectPrdGenerationLocks.has(req.params.id)) {
    return res.status(409).json({ error: 'Penyusunan PRD sedang berlangsung. Mohon tunggu sejenak.' });
  }
  projectPrdGenerationLocks.add(req.params.id);

  try {
    const project = await prisma.project.findFirst({
      where: projectWhere(req.userId, req.params.id),
      include: {
        stacks: true,
      },
    });
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

    const existing = await prisma.prd.findUnique({ where: { projectId: project.id } });
    if (existing && isStageLocked(project.wizardStep, 'prd')) {
      return res.status(403).json({ error: 'Dokumen PRD telah selesai dan terkunci (Read-Only).' });
    }

    const surveyQuestions = await prisma.discoveryQuestion.findMany({
      where: { projectId: project.id },
      include: { answers: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: [{ round: 'asc' }, { order: 'asc' }],
    });
    const surveyQA = surveyQuestions
      .filter((q) => q.answers.length > 0 && q.answers[0].answer)
      .map((q) => ({ question: q.question, answer: q.answers[0].answer }));

    const chatSession = await prisma.chatSession.findFirst({
      where: { projectId: project.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    const chatHistory = chatSession?.messages?.length
      ? chatSession.messages.map((m) => `${m.role}: ${m.content}`).join('\n')
      : undefined;

    const techStackList = project.stacks.length > 0
      ? project.stacks.map((s) => `${s.category}: ${s.name}${s.version ? ` (${s.version})` : ''}`)
      : undefined;

    // SSE response headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // Heartbeat: tahan koneksi tetap hidup walau model lama diam (anti idle timeout proxy)
    const heartbeat = setInterval(() => {
      res.write(': ping\n\n');
    }, 15000);

    try {
      const prd = await generatePrdMarkdownStream(
        {
          idea: project.idea,
          questions: surveyQA,
          projectId: project.id,
          techStack: techStackList,
          chatHistory,
        },
        (delta) => {
          res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        }
      );

      // Ekstraksi spec terstruktur. Gagal tidak membatalkan PRD; dicoba ulang otomatis saat generate task.
      res.write(`data: ${JSON.stringify({ phase: 'spec' })}\n\n`);
      let specWarning: string | undefined;
      let content = prd;
      try {
        const spec = await extractProductSpec({ markdown: prd.markdown, projectId: project.id });
        content = { ...prd, spec, dataModels: undefined, apiEndpoints: undefined };
      } catch (err) {
        specWarning = `Spec terstruktur belum terbentuk: ${(err as Error).message}`;
      }

      await snapshotArtifact(project.id, 'prd', 'prd_regenerate');
      const savedPrd = await prisma.prd.upsert({
        where: { projectId: project.id },
        create: { projectId: project.id, content: JSON.parse(JSON.stringify(content)), version: 1 },
        update: { content: JSON.parse(JSON.stringify(content)), version: { increment: 1 } },
      });
      await prisma.project.update({ where: { id: project.id }, data: { wizardStep: 'tree' } });

      res.write(`data: ${JSON.stringify({ done: true, prd: savedPrd, brd: savedPrd, specWarning })}\n\n`);
      res.end();
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: 'AI gagal menghasilkan PRD.', detail: (err as Error).message })}\n\n`);
      res.end();
    } finally {
      clearInterval(heartbeat);
    }
  } finally {
    projectPrdGenerationLocks.delete(req.params.id);
  }
});

prdRouter.get(['/api/projects/:id/prd', '/api/projects/:id/brd'], requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({ where: projectWhere(req.userId, req.params.id) });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });
  const prd = await prisma.prd.findUnique({ where: { projectId: project.id } });
  res.json({ prd, brd: prd });
});

// Ekstraksi ulang spec terstruktur (mis. setelah ekstraksi otomatis gagal, atau untuk PRD lama).
prdRouter.post('/api/projects/:id/prd/spec/extract', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({ where: projectWhere(req.userId, req.params.id), select: { id: true } });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const result = await ensureProductSpec(project.id);
  if (!result) return res.status(404).json({ error: 'PRD belum dibuat.' });
  if (result.error) return res.status(502).json({ error: 'AI gagal mengekstrak spec dari PRD.', detail: result.error });
  res.json({ ok: true, extracted: result.extracted, spec: result.prd.spec });
});
