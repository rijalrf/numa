// Diagram struktur aplikasi (tree) — generate via AI + read.
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { getUserPlan } from '../lib/billing.js';
import { isStageLocked } from '../lib/stage.js';
import { generateTreeFromPrd } from '../lib/ai/chat.js';
import { startAiJob, hasActiveJob } from '../lib/ai/job.js';

export const treeRouter = Router();

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
    where: { id: req.params.id, userId: req.userId },
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
    await startAiJob(projectId, 'tree_generate', async () => {
      const nodes = await generateTreeFromPrd(projectId);
      await prisma.project.update({ where: { id: projectId }, data: { wizardStep: 'board' } });
      return { ok: true, count: nodes.length };
    });
    res.json({ ok: true, status: 'generating' });
  } catch (err) {
    res.status(502).json({ error: 'AI gagal menghasilkan struktur tree.', detail: (err as Error).message });
  }
});

treeRouter.get('/api/projects/:id/tree', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const nodes = await prisma.treeNode.findMany({
    where: { projectId: project.id },
    orderBy: { order: 'asc' },
  });
  res.json({ nodes });
});
