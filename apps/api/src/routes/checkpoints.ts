// Checkpoint (approval layer transition).
import { LIST_LIMIT } from '../lib/config.js';
import { Router } from 'express';
import { recordAudit } from '../lib/audit.js';
import { projectWhere, getProjectRole, hasRole } from '../lib/access.js';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';

export const checkpointsRouter = Router();

checkpointsRouter.get('/api/projects/:id/checkpoints', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
    select: { id: true },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const items = await prisma.checkpoint.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: 'desc' },
    take: LIST_LIMIT,
  });
  res.json({ checkpoints: items });
});

checkpointsRouter.post('/api/checkpoints/:id/approve', requireUser, async (req: AuthedRequest, res) => {
  const cp = await prisma.checkpoint.findUnique({ where: { id: req.params.id }, select: { id: true, projectId: true } });
  if (!cp) return res.status(404).json({ error: 'Checkpoint tidak ditemukan.' });
  const role = await getProjectRole(req.userId, cp.projectId);
  if (role === null) return res.status(404).json({ error: 'Checkpoint tidak ditemukan.' });
  // Persetujuan checkpoint adalah gerbang human-in-the-loop: minimal admin.
  if (!hasRole(role, 'admin')) {
    return res.status(403).json({ error: 'Hanya admin atau owner yang dapat menyetujui checkpoint.', code: 'insufficient_role' });
  }
  const updated = await prisma.checkpoint.update({
    where: { id: cp.id },
    data: { status: 'APPROVED', resolvedAt: new Date() },
  });
  await recordAudit({
    action: 'checkpoint.approve',
    actorUserId: req.userId,
    projectId: cp.projectId,
    targetType: 'Checkpoint',
    targetId: cp.id,
    metadata: { type: updated.type, layer: updated.layer },
    req,
  });
  res.json({ ok: true, checkpoint: updated });
});

