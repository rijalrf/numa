// Agent Token (PAT) — user generates Universal token untuk akses multiple projects.
import { LIST_LIMIT } from '../lib/config.js';
import { CreateTokenBodySchema } from '../lib/request-schemas.js';
import { Router } from 'express';
import { recordAudit } from '../lib/audit.js';
import { projectWhere } from '../lib/access.js';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';

export const agentTokensRouter = Router();

const DEFAULT_TOKEN_TTL_DAYS = 90;
const MAX_TOKEN_TTL_DAYS = 365;

/** Masa berlaku token dalam hari: default 90, dibatasi 1..365. */
function resolveExpiry(body: unknown): Date {
  const raw = Number((body as { expiresInDays?: unknown } | undefined)?.expiresInDays);
  const days = Number.isFinite(raw) && raw >= 1 ? Math.min(Math.floor(raw), MAX_TOKEN_TTL_DAYS) : DEFAULT_TOKEN_TTL_DAYS;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

agentTokensRouter.post('/api/agent-tokens', requireUser, async (req: AuthedRequest, res) => {
  const name = CreateTokenBodySchema.parse(req.body ?? {}).name || 'Token CLI';
  const token = 'numa_' + crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const tokenRecord = await prisma.agentToken.create({
    data: {
      userId: req.userId,
      name,
      tokenHash,
      allProjects: true,
      expiresAt: resolveExpiry(req.body),
    },
  });

  await recordAudit({
    action: 'token.create',
    actorUserId: req.userId,
    targetType: 'AgentToken',
    targetId: tokenRecord.id,
    metadata: { name: tokenRecord.name, allProjects: true, expiresAt: tokenRecord.expiresAt },
    req,
  });
  res.status(201).json({
    id: tokenRecord.id,
    name: tokenRecord.name,
    token, // tampilkan 1x
    createdAt: tokenRecord.createdAt,
    expiresAt: tokenRecord.expiresAt,
  });
});

agentTokensRouter.post('/api/projects/:id/agent-tokens', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const token = 'numa_' + crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const tokenRecord = await prisma.agentToken.create({
    data: {
      userId: req.userId,
      name: CreateTokenBodySchema.parse(req.body ?? {}).name || 'Token CLI',
      tokenHash,
      expiresAt: resolveExpiry(req.body),
      agentTokenScopes: {
        create: { projectId: project.id },
      },
    },
  });

  await recordAudit({
    action: 'token.create',
    actorUserId: req.userId,
    projectId: project.id,
    orgId: project.orgId,
    targetType: 'AgentToken',
    targetId: tokenRecord.id,
    metadata: { name: tokenRecord.name, allProjects: false, expiresAt: tokenRecord.expiresAt },
    req,
  });
  res.status(201).json({
    id: tokenRecord.id,
    name: tokenRecord.name,
    projectId: project.id,
    token, // tampilkan 1x
    createdAt: tokenRecord.createdAt,
    expiresAt: tokenRecord.expiresAt,
  });
});

agentTokensRouter.get('/api/projects/:id/agent-tokens', requireUser, async (req: AuthedRequest, res) => {
  const tokens = await prisma.agentToken.findMany({
    where: {
      userId: req.userId,
      agentTokenScopes: {
        some: { projectId: req.params.id },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: LIST_LIMIT,
    select: {
      id: true,
      name: true,
      lastUsedAt: true,
      isRevoked: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  res.json({ tokens });
});

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

// List SEMUA token milik user lintas project — dipakai halaman profil.
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
