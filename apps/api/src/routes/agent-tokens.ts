// Sesi CLI (PAT hasil login browser): daftar dan pencabutan. Token hanya dibuat lewat login CLI (routes/cli-auth.ts).
import { LIST_LIMIT } from '../lib/config.js';
import { Router } from 'express';
import { recordAudit } from '../lib/audit.js';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';

export const agentTokensRouter = Router();

agentTokensRouter.delete('/api/agent-tokens/:tokenId', requireUser, async (req: AuthedRequest, res) => {
  const token = await prisma.agentToken.findFirst({
    where: { id: req.params.tokenId, userId: req.userId },
    include: { agentTokenScopes: true },
  });
  if (!token) return res.status(404).json({ error: 'Token tidak ditemukan.' });

  await prisma.agentToken.update({
    where: { id: token.id },
    data: { isRevoked: true }
  });
  await recordAudit({
    action: 'token.revoke',
    actorUserId: req.userId,
    targetType: 'AgentToken',
    targetId: token.id,
    metadata: { name: token.name },
    req,
  });
  res.json({ ok: true });
});

// Daftar sesi CLI milik user — dipakai halaman profil.
agentTokensRouter.get('/api/agent-tokens', requireUser, async (req: AuthedRequest, res) => {
  const tokens = await prisma.agentToken.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    take: LIST_LIMIT,
    select: {
      id: true,
      name: true,
      lastUsedAt: true,
      isRevoked: true,
      expiresAt: true,
      allProjects: true,
      createdAt: true,
      agentTokenScopes: {
        select: { project: { select: { id: true, name: true } } },
      },
    },
  });

  res.json({
    tokens: tokens.map((t) => ({
      id: t.id,
      name: t.name,
      lastUsedAt: t.lastUsedAt,
      isRevoked: t.isRevoked,
      expiresAt: t.expiresAt,
      allProjects: t.allProjects,
      createdAt: t.createdAt,
      projects: t.agentTokenScopes.map((s) => s.project),
    })),
  });
});
