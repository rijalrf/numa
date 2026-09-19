// Verifikasi Universal PAT (Personal Access Token) untuk endpoint agent (CLI).
// Token bisa access multiple projects via agentTokenScopes relation.
// Isolasi project ditegakkan per request via X-Project-ID header atau ?projectId query param.
import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';

declare global {
  namespace Express {
    interface Request {
      agent: {
        tokenId: string;
        userId: string;
        projectId: string;
        projectName: string;
      };
    }
  }
}

export type AgentRequest = Request;

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function requireAgent(req: Request, res: Response, next: NextFunction) {
  const auth = req.header('authorization') ?? '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: 'Header Authorization: Bearer <token> wajib.' });
  }
  const token = match[1].trim();
  if (!token.startsWith('numa_')) {
    return res.status(401).json({ error: 'Format token tidak valid.' });
  }

  const tokenHash = hashToken(token);

  // Get token with all scopes
  const record = await prisma.agentToken.findUnique({
    where: { tokenHash },
    include: {
      user: true,
      agentTokenScopes: { include: { project: true } },
    },
  });

  if (!record || record.isRevoked) {
    return res.status(401).json({ error: 'Token tidak dikenali atau sudah dicabut.' });
  }

  // Get target project from header or query param
  const projectIdFromHeader = req.headers['x-project-id'] as string | undefined;
  const projectIdFromQuery = req.query.projectId as string | undefined;
  const projectId = projectIdFromHeader ?? projectIdFromQuery;

  if (!projectId) {
    return res.status(400).json({ error: 'Project ID required. Send X-Project-ID header or ?projectId query param.' });
  }

  // Validate token has access to this project (user owner OR explicit scope)
  const ownedProject = await prisma.project.findFirst({
    where: { id: projectId, userId: record.userId },
    select: { id: true, name: true },
  });

  const scopedRecord = !ownedProject
    ? record.agentTokenScopes?.find((scope) => scope.projectId === projectId)
    : null;

  const targetProject = ownedProject || (scopedRecord ? scopedRecord.project : null);

  if (!targetProject) {
    return res.status(403).json({ error: `Token ini tidak punya akses ke project ${projectId}` });
  }

  // Update last_used_at (fire-and-forget; tidak boleh menggagalkan request).
  prisma.agentToken
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  (req as AgentRequest).agent = {
    tokenId: record.id,
    userId: record.user.id,
    projectId: targetProject.id,
    projectName: targetProject.name,
  };
  next();
}
