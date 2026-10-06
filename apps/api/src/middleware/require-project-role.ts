// Guard peran per metode HTTP untuk seluruh /api/projects/:id/*.
// GET/HEAD cukup viewer; metode mutasi minimal member; DELETE minimal admin.
// Project yang tidak ditemukan/tak dapat diakses diteruskan agar route mengembalikan 404 yang konsisten.
import type { Request, Response, NextFunction } from 'express';
import { getProjectRole, hasRole, type Role } from '../lib/access.js';

export function requiredRoleForMethod(method: string): Role {
  const m = method.toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return 'viewer';
  if (m === 'DELETE') return 'admin';
  return 'member';
}

export async function requireProjectRole(req: Request, res: Response, next: NextFunction) {
  try {
    const projectId = req.params.id;
    if (!projectId || !req.userId) return next();
    const role = await getProjectRole(req.userId, projectId);
    if (role === null) return next();
    const required = requiredRoleForMethod(req.method);
    if (!hasRole(role, required)) {
      return res.status(403).json({
        error: 'Peran Anda tidak memiliki izin untuk aksi ini.',
        code: 'insufficient_role',
        role,
        required,
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}
