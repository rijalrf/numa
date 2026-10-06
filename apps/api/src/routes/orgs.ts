// Organisasi (tenant) dan keanggotaan: CRUD org, kelola anggota, pindahkan project ke org.
import { LIST_LIMIT } from '../lib/config.js';
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { getOrgRole, getProjectRole, hasRole, isRole, type Role } from '../lib/access.js';
import { recordAudit } from '../lib/audit.js';

export const orgsRouter = Router();

const OrgBody = z.object({ name: z.string().trim().min(2).max(80) });
const AddMemberBody = z.object({
  email: z.string().email(),
  role: z.enum(['viewer', 'member', 'admin', 'owner']).default('member'),
});
const UpdateMemberBody = z.object({ role: z.enum(['viewer', 'member', 'admin', 'owner']) });
const MoveProjectBody = z.object({ orgId: z.string().min(1).nullable() });

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'org'}-${crypto.randomBytes(3).toString('hex')}`;
}

const notFound = (res: any) => res.status(404).json({ error: 'Organisasi tidak ditemukan.' });
const forbidden = (res: any, message: string) =>
  res.status(403).json({ error: message, code: 'insufficient_role' });

orgsRouter.get('/api/orgs', requireUser, async (req: AuthedRequest, res) => {
  const memberships = await prisma.membership.findMany({
    where: { userId: req.userId },
    include: { org: { select: { id: true, name: true, slug: true, createdAt: true, _count: { select: { members: true, projects: true } } } } },
    orderBy: { createdAt: 'asc' },
    take: LIST_LIMIT,
  });
  res.json({
    orgs: memberships.map((m) => ({
      id: m.org.id,
      name: m.org.name,
      slug: m.org.slug,
      role: m.role,
      memberCount: m.org._count.members,
      projectCount: m.org._count.projects,
      createdAt: m.org.createdAt,
    })),
  });
});

orgsRouter.post('/api/orgs', requireUser, async (req: AuthedRequest, res) => {
  const parsed = OrgBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Nama organisasi tidak valid.', detail: parsed.error.flatten() });

  const org = await prisma.organization.create({
    data: {
      name: parsed.data.name,
      slug: slugify(parsed.data.name),
      members: { create: { userId: req.userId, role: 'owner' } },
    },
  });
  await recordAudit({ action: 'org.create', actorUserId: req.userId, orgId: org.id, targetType: 'Organization', targetId: org.id, metadata: { name: org.name }, req });
  res.status(201).json({ org: { ...org, role: 'owner' } });
});

orgsRouter.get('/api/orgs/:orgId', requireUser, async (req: AuthedRequest, res) => {
  const role = await getOrgRole(req.userId, req.params.orgId);
  if (!role) return notFound(res);
  const org = await prisma.organization.findUnique({
    where: { id: req.params.orgId },
    include: {
      members: { include: { user: { select: { id: true, email: true, name: true } } }, orderBy: { createdAt: 'asc' } },
      projects: { select: { id: true, name: true, status: true, updatedAt: true }, orderBy: { updatedAt: 'desc' } },
    },
  });
  if (!org) return notFound(res);
  res.json({
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      role,
      members: org.members.map((m) => ({ userId: m.userId, email: m.user.email, name: m.user.name, role: m.role, joinedAt: m.createdAt })),
      projects: org.projects,
    },
  });
});

orgsRouter.patch('/api/orgs/:orgId', requireUser, async (req: AuthedRequest, res) => {
  const role = await getOrgRole(req.userId, req.params.orgId);
  if (!role) return notFound(res);
  if (!hasRole(role, 'admin')) return forbidden(res, 'Hanya admin atau owner yang dapat mengubah organisasi.');
  const parsed = OrgBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Nama organisasi tidak valid.' });
  const org = await prisma.organization.update({ where: { id: req.params.orgId }, data: { name: parsed.data.name } });
  await recordAudit({ action: 'org.update', actorUserId: req.userId, orgId: org.id, targetType: 'Organization', targetId: org.id, metadata: { name: org.name }, req });
  res.json({ org });
});

orgsRouter.delete('/api/orgs/:orgId', requireUser, async (req: AuthedRequest, res) => {
  const role = await getOrgRole(req.userId, req.params.orgId);
  if (!role) return notFound(res);
  if (role !== 'owner') return forbidden(res, 'Hanya owner yang dapat menghapus organisasi.');
  // Project org tidak ikut terhapus: orgId menjadi null dan kembali menjadi milik pembuatnya.
  const doomed = await prisma.organization.findUnique({ where: { id: req.params.orgId }, select: { name: true } });
  await prisma.organization.delete({ where: { id: req.params.orgId } });
  await recordAudit({ action: 'org.delete', actorUserId: req.userId, orgId: req.params.orgId, targetType: 'Organization', targetId: req.params.orgId, metadata: { name: doomed?.name }, req });
  res.json({ ok: true });
});

/** True bila setelah perubahan masih ada minimal satu owner. */
async function ownerRemains(orgId: string, excludingUserId: string) {
  const count = await prisma.membership.count({ where: { orgId, role: 'owner', userId: { not: excludingUserId } } });
  return count > 0;
}

orgsRouter.post('/api/orgs/:orgId/members', requireUser, async (req: AuthedRequest, res) => {
  const role = await getOrgRole(req.userId, req.params.orgId);
  if (!role) return notFound(res);
  if (!hasRole(role, 'admin')) return forbidden(res, 'Hanya admin atau owner yang dapat menambah anggota.');
  const parsed = AddMemberBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data anggota tidak valid.', detail: parsed.error.flatten() });
  if (parsed.data.role === 'owner' && role !== 'owner') return forbidden(res, 'Hanya owner yang dapat menunjuk owner baru.');

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() }, select: { id: true, email: true, name: true } });
  if (!user) {
    return res.status(404).json({ error: 'Pengguna dengan email tersebut belum terdaftar di Numa.', code: 'user_not_found' });
  }
  const existing = await getOrgRole(user.id, req.params.orgId);
  if (existing) return res.status(409).json({ error: 'Pengguna sudah menjadi anggota organisasi.', code: 'already_member' });

  const membership = await prisma.membership.create({
    data: { orgId: req.params.orgId, userId: user.id, role: parsed.data.role },
  });
  await recordAudit({ action: 'org.member.add', actorUserId: req.userId, orgId: req.params.orgId, targetType: 'User', targetId: user.id, metadata: { role: membership.role }, req });
  res.status(201).json({ member: { userId: user.id, email: user.email, name: user.name, role: membership.role } });
});

orgsRouter.patch('/api/orgs/:orgId/members/:userId', requireUser, async (req: AuthedRequest, res) => {
  const actorRole = await getOrgRole(req.userId, req.params.orgId);
  if (!actorRole) return notFound(res);
  if (!hasRole(actorRole, 'admin')) return forbidden(res, 'Hanya admin atau owner yang dapat mengubah peran.');
  const parsed = UpdateMemberBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Peran tidak valid.' });

  const targetRole = await getOrgRole(req.params.userId, req.params.orgId);
  if (!targetRole) return res.status(404).json({ error: 'Anggota tidak ditemukan.' });

  const touchesOwner = targetRole === 'owner' || parsed.data.role === 'owner';
  if (touchesOwner && actorRole !== 'owner') return forbidden(res, 'Hanya owner yang dapat mengubah peran owner.');
  if (targetRole === 'owner' && parsed.data.role !== 'owner' && !(await ownerRemains(req.params.orgId, req.params.userId))) {
    return res.status(409).json({ error: 'Organisasi harus memiliki minimal satu owner.', code: 'last_owner' });
  }

  const updated = await prisma.membership.update({
    where: { orgId_userId: { orgId: req.params.orgId, userId: req.params.userId } },
    data: { role: parsed.data.role },
  });
  await recordAudit({ action: 'org.member.role_change', actorUserId: req.userId, orgId: req.params.orgId, targetType: 'User', targetId: updated.userId, metadata: { from: targetRole, to: updated.role }, req });
  res.json({ member: { userId: updated.userId, role: updated.role } });
});

orgsRouter.delete('/api/orgs/:orgId/members/:userId', requireUser, async (req: AuthedRequest, res) => {
  const actorRole = await getOrgRole(req.userId, req.params.orgId);
  if (!actorRole) return notFound(res);
  const isSelf = req.params.userId === req.userId;
  if (!isSelf && !hasRole(actorRole, 'admin')) return forbidden(res, 'Hanya admin atau owner yang dapat mengeluarkan anggota.');

  const targetRole = isSelf ? actorRole : await getOrgRole(req.params.userId, req.params.orgId);
  if (!targetRole) return res.status(404).json({ error: 'Anggota tidak ditemukan.' });
  if (targetRole === 'owner' && actorRole !== 'owner') return forbidden(res, 'Hanya owner yang dapat mengeluarkan owner.');
  if (targetRole === 'owner' && !(await ownerRemains(req.params.orgId, req.params.userId))) {
    return res.status(409).json({ error: 'Organisasi harus memiliki minimal satu owner.', code: 'last_owner' });
  }

  await prisma.membership.delete({
    where: { orgId_userId: { orgId: req.params.orgId, userId: req.params.userId } },
  });
  await recordAudit({ action: isSelf ? 'org.member.leave' : 'org.member.remove', actorUserId: req.userId, orgId: req.params.orgId, targetType: 'User', targetId: req.params.userId, metadata: { role: targetRole }, req });
  res.json({ ok: true });
});

// Pindahkan project ke organisasi (atau kembalikan ke pribadi dengan orgId null). Hanya pembuat project.
orgsRouter.put('/api/projects/:id/org', requireUser, async (req: AuthedRequest, res) => {
  const parsed = MoveProjectBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data tidak valid.' });

  const project = await prisma.project.findUnique({ where: { id: req.params.id }, select: { id: true, userId: true, orgId: true } });
  if (!project || project.userId !== req.userId) {
    return res.status(404).json({ error: 'Project tidak ditemukan.' });
  }
  if (parsed.data.orgId) {
    const orgRole: Role | null = await getOrgRole(req.userId, parsed.data.orgId);
    if (!isRole(orgRole) || !hasRole(orgRole, 'member')) {
      return forbidden(res, 'Anda tidak punya izin menambahkan project ke organisasi ini.');
    }
  }
  const updated = await prisma.project.update({ where: { id: project.id }, data: { orgId: parsed.data.orgId } });
  await recordAudit({ action: 'project.move', actorUserId: req.userId, orgId: updated.orgId ?? project.orgId, projectId: project.id, targetType: 'Project', targetId: project.id, metadata: { fromOrgId: project.orgId, toOrgId: updated.orgId }, req });
  res.json({ project: { id: updated.id, orgId: updated.orgId } });
});

const AuditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.string().datetime().optional(),
  action: z.string().max(80).optional(),
});

function auditPage(rows: { createdAt: Date }[], limit: number) {
  return rows.length === limit ? rows[rows.length - 1].createdAt.toISOString() : null;
}

// Audit log organisasi (admin ke atas), terbaru dulu, paginasi kursor lewat `before`.
orgsRouter.get('/api/orgs/:orgId/audit-logs', requireUser, async (req: AuthedRequest, res) => {
  const role = await getOrgRole(req.userId, req.params.orgId);
  if (!role) return notFound(res);
  if (!hasRole(role, 'admin')) return forbidden(res, 'Hanya admin atau owner yang dapat melihat audit log.');
  const q = AuditQuery.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: 'Parameter tidak valid.' });
  const logs = await prisma.auditLog.findMany({
    where: {
      orgId: req.params.orgId,
      ...(q.data.action ? { action: { startsWith: q.data.action } } : {}),
      ...(q.data.before ? { createdAt: { lt: new Date(q.data.before) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: q.data.limit,
  });
  res.json({ logs, nextBefore: auditPage(logs, q.data.limit) });
});

// Audit log project (admin ke atas). Guard GET global hanya memeriksa viewer, jadi peran dicek di sini.
orgsRouter.get('/api/projects/:id/audit-logs', requireUser, async (req: AuthedRequest, res) => {
  const role = await getProjectRole(req.userId, req.params.id);
  if (!role) return res.status(404).json({ error: 'Project tidak ditemukan.' });
  if (!hasRole(role, 'admin')) return forbidden(res, 'Hanya admin atau owner yang dapat melihat audit log.');
  const q = AuditQuery.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: 'Parameter tidak valid.' });
  const logs = await prisma.auditLog.findMany({
    where: {
      projectId: req.params.id,
      ...(q.data.action ? { action: { startsWith: q.data.action } } : {}),
      ...(q.data.before ? { createdAt: { lt: new Date(q.data.before) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: q.data.limit,
  });
  res.json({ logs, nextBefore: auditPage(logs, q.data.limit) });
});
