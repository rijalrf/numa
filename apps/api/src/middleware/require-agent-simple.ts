// Validasi PAT tanpa wajib project. Dipakai /api/agent/scopes yang mengembalikan project yang boleh diakses.
import type { Request, Response, NextFunction } from 'express';
import { authenticateToken, type AuthedTokenRecord } from '../lib/agent-auth.js';

declare global {
  namespace Express {
    interface Request {
      agentToken?: AuthedTokenRecord;
    }
  }
}

export async function requireAgentSimple(req: Request, res: Response, next: NextFunction) {
  const { record, failure } = await authenticateToken(req.header('authorization'));
  if (!record) return res.status(failure!.status).json({ error: failure!.error });
  req.agentToken = record;
  next();
}
