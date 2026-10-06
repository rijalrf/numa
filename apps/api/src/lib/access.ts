// Kontrol akses project: kepemilikan pribadi atau keanggotaan organisasi (RBAC).
import { prisma } from './prisma.js';

export const ROLES = ['viewer', 'member', 'admin', 'owner'] as const;
export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** True bila `actual` setara atau lebih tinggi dari `required`. */
export function hasRole(actual: Role | null, required: Role): boolean {
  return actual !== null && RANK[actual] >= RANK[required];
}

/**
 * Filter Prisma untuk project yang dapat diakses user: milik sendiri atau
 * project organisasi tempat user menjadi anggota. Pengecekan peran per aksi
 * dilakukan terpisah (lihat requireProjectRole).
 */
export function projectWhere(userId: string, projectId?: string) {
  return {
    ...(projectId ? { id: projectId } : {}),
    OR: [{ userId }, { org: { members: { some: { userId } } } }],
  };
}

/** Peran user pada project, atau null bila tidak punya akses / project tidak ada. */
export async function getProjectRole(userId: string, projectId: string): Promise<Role | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true, orgId: true },
  });
  if (!project) return null;
  if (project.userId === userId) return 'owner';
  if (!project.orgId) return null;
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: project.orgId, userId } },
    select: { role: true },
  });
  return membership && isRole(membership.role) ? membership.role : null;
}

export async function getOrgRole(userId: string, orgId: string): Promise<Role | null> {
  const membership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId, userId } },
    select: { role: true },
  });
  return membership && isRole(membership.role) ? membership.role : null;
}

/**
 * Project yang boleh dikerjakan agent atas nama user: milik sendiri atau project organisasi
 * dengan peran minimal member (agent menulis, jadi viewer tidak boleh).
 */
export function agentProjectWhere(userId: string, projectId?: string) {
  return {
    ...(projectId ? { id: projectId } : {}),
    OR: [
      { userId },
      { org: { members: { some: { userId, role: { in: ['member', 'admin', 'owner'] } } } } },
    ],
  };
}
