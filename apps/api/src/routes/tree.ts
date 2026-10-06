// Diagram struktur aplikasi (tree) — generate via AI + read.
import { logger, serializeError } from '../lib/logger.js';
import { Router } from 'express';
import { projectWhere } from '../lib/access.js';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { getUserPlan } from '../lib/billing.js';
import { isStageLocked } from '../lib/stage.js';
import { generateTreeFromPrd, generateFlowFromPrd } from '../lib/ai/chat.js';
import { enqueueAiJob, hasActiveJob, registerJobHandler, rejectJobLimit } from '../lib/ai/job.js';

export const treeRouter = Router();

registerJobHandler('tree_generate', async ({ projectId }) => {
  const nodes = await generateTreeFromPrd(projectId);
  let flowCount = 0;
  try {
    const flow = await generateFlowFromPrd(projectId);
    flowCount = flow.stepCount;
  } catch (flowErr) {
    // Flow gagal tidak menggagalkan tree: diagram alur bersifat pelengkap
    logger.error('Generate flow gagal', { scope: 'tree', error: serializeError(flowErr) });
  }
  await prisma.project.update({ where: { id: projectId }, data: { wizardStep: 'board' } });
  return { ok: true, count: nodes.length, flowCount };
});

registerJobHandler('flow_generate', async ({ projectId }) => {
  const flow = await generateFlowFromPrd(projectId);
  return { ok: true, count: flow.stepCount };
});

treeRouter.post('/api/projects/:id/tree/generate', requireUser, async (req: AuthedRequest, res) => {
  const { plan } = await getUserPlan(req.userId);
  if (plan === 'free') {
    return res.status(403).json({
      error: 'Paket Free hanya dapat mengakses hingga pembuatan PRD. Silakan upgrade paket untuk melihat diagram struktur dan mengeksekusi agen.',
      code: 'plan_upgrade_required',
      plan,
      upgradeUrl: '/pricing',
    });
  }

  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
    include: { prd: true },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });
  if (!project.prd) return res.status(400).json({ error: 'PRD belum ada. Generate PRD dulu.' });

  const existingTreeCount = await prisma.treeNode.count({ where: { projectId: project.id } });
  if (existingTreeCount > 0 && isStageLocked(project.wizardStep, 'tree')) {
    return res.status(403).json({ error: 'Diagram struktur telah selesai dan terkunci (Read-Only).' });
  }

  if (await hasActiveJob(project.id, 'tree_generate')) {
    return res.json({ ok: true, status: 'generating' });
  }

  const projectId = project.id;
  try {
    await enqueueAiJob({ projectId, type: 'tree_generate', userId: req.userId });
    res.json({ ok: true, status: 'generating' });
  } catch (err) {
    if (rejectJobLimit(res, err)) return;
    res.status(502).json({ error: 'AI gagal menghasilkan struktur tree.', detail: (err as Error).message });
  }
});

// Generate ulang hanya diagram alur proses, tanpa menyentuh node struktur tree.
treeRouter.post('/api/projects/:id/flow/generate', requireUser, async (req: AuthedRequest, res) => {
  const { plan } = await getUserPlan(req.userId);
  if (plan === 'free') {
    return res.status(403).json({
      error: 'Paket Free hanya dapat mengakses hingga pembuatan PRD. Silakan upgrade paket untuk melihat diagram alur proses.',
      code: 'plan_upgrade_required',
      plan,
      upgradeUrl: '/pricing',
    });
  }

  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
    include: { prd: true },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });
  if (!project.prd) return res.status(400).json({ error: 'PRD belum ada. Generate PRD dulu.' });

  const existingFlow = await prisma.businessFlow.findUnique({ where: { projectId: project.id } });
  if (existingFlow && isStageLocked(project.wizardStep, 'tree')) {
    return res.status(403).json({ error: 'Diagram alur proses telah selesai dan terkunci (Read-Only).' });
  }

  if (await hasActiveJob(project.id, 'flow_generate')) {
    return res.json({ ok: true, status: 'generating' });
  }

  const projectId = project.id;
  try {
    await enqueueAiJob({ projectId, type: 'flow_generate', userId: req.userId });
    res.json({ ok: true, status: 'generating' });
  } catch (err) {
    if (rejectJobLimit(res, err)) return;
    res.status(502).json({ error: 'AI gagal menghasilkan alur proses.', detail: (err as Error).message });
  }
});

treeRouter.get('/api/projects/:id/flow', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({ where: projectWhere(req.userId, req.params.id) });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const flow = await prisma.businessFlow.findUnique({ where: { projectId: project.id } });
  res.json({
    flow: flow ? flow.content : null,
    version: flow?.version ?? null,
    updatedAt: flow?.updatedAt ?? null,
  });
});

treeRouter.get('/api/projects/:id/tree', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({ where: projectWhere(req.userId, req.params.id) });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const nodes = await prisma.treeNode.findMany({
    where: { projectId: project.id },
    orderBy: { order: 'asc' },
  });
  res.json({ nodes });
});
