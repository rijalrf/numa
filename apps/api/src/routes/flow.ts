// Alur bisnis (flow): generate via AI + read. Hanya backend; UI-nya sudah dihapus dan seluruh fitur ini
// akan dibuang setelah journey di PRD terbukti menggantikannya (lihat docs/JOURNEY_MIGRATION_PLAN.md).
import { Router } from 'express';
import { projectWhere } from '../lib/access.js';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { getUserPlan } from '../lib/billing.js';
import { isStageLocked } from '../lib/stage.js';
import { generateFlowFromPrd } from '../lib/ai/chat.js';
import { enqueueAiJob, hasActiveJob, registerJobHandler, rejectJobLimit } from '../lib/ai/job.js';

export const flowRouter = Router();

registerJobHandler('flow_generate', async ({ projectId }) => {
  const flow = await generateFlowFromPrd(projectId);
  return { ok: true, count: flow.stepCount };
});

flowRouter.post('/api/projects/:id/flow/generate', requireUser, async (req: AuthedRequest, res) => {
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

  if (isStageLocked(project.wizardStep, 'board')) {
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

flowRouter.get('/api/projects/:id/flow', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({ where: projectWhere(req.userId, req.params.id) });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const flow = await prisma.businessFlow.findUnique({ where: { projectId: project.id } });
  res.json({
    flow: flow ? flow.content : null,
    version: flow?.version ?? null,
    updatedAt: flow?.updatedAt ?? null,
  });
});
