// Verifikasi session user (cookie Better Auth) untuk endpoint user.
import type { Request, Response, NextFunction } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../lib/auth.js';

declare global {
  namespace Express {
    interface Request {
      userId: string;
      userEmail?: string;
    }
  }
}

export type AuthedRequest = Request;

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  // Idempotent: guard global dan route boleh sama-sama memanggilnya.
  if (req.userId) return next();
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session?.user) {
      return res.status(401).json({ error: 'Tidak terautentikasi. Silakan login.' });
    }
    req.userId = session.user.id;
    req.userEmail = session.user.email;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session tidak valid.' });
  }
}
