// Autentikasi PAT agent terpusat: dipakai requireAgent, requireAgentSimple, dan /api/agent/scopes.
// Aturan akses project:
// - Token universal (allProjects=true) boleh mengakses semua project yang dapat dikerjakan pemiliknya
//   (project milik pemilik token).
// - Token berscope hanya boleh mengakses project di AgentTokenScope. Bila semua scope hilang (mis. project dihapus),
//   token tidak punya akses sama sekali, bukan menjadi universal.
import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { projectWhere } from './access.js';

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export type AgentAuthFailure = { status: 401; error: string };

/** `db` bisa diganti untuk test; default memakai klien Prisma aplikasi. */
export async function authenticateToken(authHeader: string | undefined, db: Pick<typeof prisma, 'agentToken'> = prisma) {
  const match = (authHeader ?? '').match(/^Bearer\s+(.+)$/i);
  if (!match) return { failure: { status: 401, error: 'Header Authorization: Bearer <token> wajib.' } as AgentAuthFailure };

  const token = match[1].trim();
  if (!token.startsWith('numa_')) return { failure: { status: 401, error: 'Format token tidak valid.' } as AgentAuthFailure };

  const record = await db.agentToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true, agentTokenScopes: { include: { project: true } } },
  });
  if (!record || record.isRevoked) {
    return { failure: { status: 401, error: 'Token tidak dikenali atau sudah dicabut.' } as AgentAuthFailure };
  }
  if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) {
    return { failure: { status: 401, error: 'Token sudah kedaluwarsa. Buat token baru di halaman profil.' } as AgentAuthFailure };
  }

  db.agentToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { record };
}

export type AuthedTokenRecord = NonNullable<Awaited<ReturnType<typeof authenticateToken>>['record']>;

/** Project yang boleh diakses token ini: milik pemilik token. */
export async function listAccessibleProjects(record: AuthedTokenRecord): Promise<Array<{ id: string; name: string }>> {
  const scopedIds = record.agentTokenScopes.map((s) => s.projectId);
  if (!record.allProjects && scopedIds.length === 0) return [];
  return prisma.project.findMany({
    where: { ...projectWhere(record.userId), ...(record.allProjects ? {} : { id: { in: scopedIds } }) },
    select: { id: true, name: true },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function resolveProjectAccess(record: AuthedTokenRecord, projectId: string) {
  const scopedIds = record.agentTokenScopes.map((s) => s.projectId);
  if (!record.allProjects && !scopedIds.includes(projectId)) return null;
  return prisma.project.findFirst({ where: projectWhere(record.userId, projectId), select: { id: true, name: true } });
}
