// Simple PAT validation without requiring project scope.
// Used for endpoints like /api/agent/scopes that return all accessible projects.
import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';

export async function requireAgentSimple(req: Request, res: Response, next: NextFunction) {
  const auth = req.header('authorization') ?? '';
  const match = auth.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({ error: 'Header Authorization: Bearer <token> wajib.' });
  }

  const token = match[1].trim();
  if (!token.startsWith('numa_')) {
    return res.status(401).json({ error: 'Format token tidak valid.' });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  // Get token with all scopes (no projectId required)
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

  // Update last_used_at (fire-and-forget)
  prisma.agentToken
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  next();
}
