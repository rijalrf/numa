// Hanya admin platform (env PLATFORM_ADMIN_EMAILS). Dipasang setelah requireUser.
// Bukan admin dibalas 404 agar keberadaan endpoint tidak terlihat.
import type { Request, Response, NextFunction } from 'express';
import { isPlatformAdmin } from '../lib/platform-admin.js';
import { recordAudit } from '../lib/audit.js';

export async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isPlatformAdmin(req.userEmail)) {
    return res.status(404).json({ error: 'Tidak ditemukan.' });
  }
  await recordAudit({
    action: 'admin.usage.access',
    actorUserId: req.userId,
    metadata: { path: req.originalUrl.split('?')[0] },
    req,
  });
  next();
}
