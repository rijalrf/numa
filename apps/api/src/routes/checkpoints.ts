// Checkpoint (approval layer transition).
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';

export const checkpointsRouter = Router();

checkpointsRouter.get('/api/projects/:id/checkpoints', requireUser, async (req: AuthedRequest, res) => {
  const items = await prisma.checkpoint.findMany({
    where: { projectId: req.params.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ checkpoints: items });
});

checkpointsRouter.post('/api/checkpoints/:id/approve', requireUser, async (req: AuthedRequest, res) => {
  const cp = await prisma.checkpoint.findUnique({ where: { id: req.params.id }, include: { project: true } });
  if (!cp) return res.status(404).json({ error: 'Checkpoint tidak ditemukan.' });
  if (cp.project.userId !== req.userId) return res.status(403).json({ error: 'Bukan project Anda.' });
  const updated = await prisma.checkpoint.update({
    where: { id: cp.id },
    data: { status: 'APPROVED', resolvedAt: new Date() },
  });
  res.json({ ok: true, checkpoint: updated });
});

