// Verifikasi PAT (Personal Access Token) untuk endpoint agent (CLI).
// Isolasi project ditegakkan per request via header X-Project-ID atau query ?projectId.
// Scope token benar-benar membatasi akses (lihat lib/agent-auth.ts).
import type { Request, Response, NextFunction } from 'express';
import { authenticateToken, resolveProjectAccess } from '../lib/agent-auth.js';

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

export async function requireAgent(req: Request, res: Response, next: NextFunction) {
  const { record, failure } = await authenticateToken(req.header('authorization'));
  if (!record) return res.status(failure!.status).json({ error: failure!.error });

  const projectId = (req.headers['x-project-id'] as string | undefined) ?? (req.query.projectId as string | undefined);
  if (!projectId) {
    return res.status(400).json({ error: 'Project ID required. Send X-Project-ID header or ?projectId query param.' });
  }

  const project = await resolveProjectAccess(record, projectId);
  if (!project) {
    return res.status(403).json({ error: `Token ini tidak punya akses ke project ${projectId}` });
  }

  (req as AgentRequest).agent = {
    tokenId: record.id,
    userId: record.user.id,
    projectId: project.id,
    projectName: project.name,
  };
  next();
}
