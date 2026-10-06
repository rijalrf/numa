// Project endpoints (user side): list, create, detail.
import { LIST_LIMIT } from '../lib/config.js';
import { Router } from 'express';
import { recordAudit } from '../lib/audit.js';
import { projectWhere, getOrgRole, getProjectRole, hasRole } from '../lib/access.js';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { checkProjectLimit } from '../lib/billing.js';
import { furthestStage } from '../lib/stage.js';

export const projectsRouter = Router();

const CreateProjectBody = z.object({
  name: z.string().min(1).max(120),
  idea: z.string().min(10).max(4000),
  orgId: z.string().min(1).optional(),
});

projectsRouter.get('/api/projects', requireUser, async (req: AuthedRequest, res) => {
  const projects = await prisma.project.findMany({
    where: projectWhere(req.userId),
    orderBy: { updatedAt: 'desc' },
    take: LIST_LIMIT,
    select: {
      id: true,
      name: true,
      idea: true,
      status: true,
      orgId: true,
      wizardStep: true,
      createdAt: true,
      updatedAt: true,
      prd: { select: { id: true } },
      _count: { select: { stacks: true, treeNodes: true, tasks: true } },
    },
  });
  res.json({
    projects: projects.map((p) => {
      const stage = furthestStage(p);
      const { prd, _count, ...rest } = p;
      return { ...rest, stage };
    }),
  });
});

projectsRouter.post('/api/projects', requireUser, async (req: AuthedRequest, res) => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Data tidak valid', detail: parsed.error.flatten() });
  }

  const limitCheck = await checkProjectLimit(req.userId);
  if (!limitCheck.allowed) {
    return res.status(403).json({
      error: `Batas jumlah proyek telah tercapai (maksimal ${limitCheck.quotaMax} proyek aktif untuk paket ${limitCheck.plan}). Silakan upgrade paket untuk membuat proyek baru.`,
      code: 'project_limit_reached',
      plan: limitCheck.plan,
      currentCount: limitCheck.currentCount,
      quotaMax: limitCheck.quotaMax,
      upgradeUrl: '/pricing',
    });
  }

  if (parsed.data.orgId) {
    const orgRole = await getOrgRole(req.userId, parsed.data.orgId);
    if (!hasRole(orgRole, 'member')) {
      return res.status(403).json({ error: 'Anda tidak punya izin membuat project di organisasi ini.', code: 'insufficient_role' });
    }
  }

  const project = await prisma.project.create({
    data: { userId: req.userId, orgId: parsed.data.orgId ?? null, name: parsed.data.name, idea: parsed.data.idea, status: 'ACTIVE' },
  });
  await recordAudit({
    action: 'project.create',
    actorUserId: req.userId,
    projectId: project.id,
    orgId: project.orgId,
    targetType: 'Project',
    targetId: project.id,
    req,
  });
  res.status(201).json({ project });
});

projectsRouter.get('/api/projects/:id', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
    include: { stacks: true, prd: true, roadmap: { include: { features: { include: { tasks: true } } } } },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });
  res.json({ project });
});

// Riwayat versi artefak (PRD, business flow). `content` tidak disertakan di daftar; ambil lewat detail.
projectsRouter.get('/api/projects/:id/artifact-versions', requireUser, async (req: AuthedRequest, res) => {
  if (!(await getProjectRole(req.userId, req.params.id))) return res.status(404).json({ error: 'Project tidak ditemukan.' });
  const kind = req.query.kind === 'business_flow' ? 'business_flow' : req.query.kind === 'prd' ? 'prd' : undefined;
  const versions = await prisma.artifactVersion.findMany({
    where: { projectId: req.params.id, ...(kind ? { kind } : {}) },
    select: { id: true, kind: true, version: true, reason: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ versions });
});

projectsRouter.get('/api/projects/:id/artifact-versions/:versionId', requireUser, async (req: AuthedRequest, res) => {
  if (!(await getProjectRole(req.userId, req.params.id))) return res.status(404).json({ error: 'Project tidak ditemukan.' });
  const row = await prisma.artifactVersion.findFirst({ where: { id: req.params.versionId, projectId: req.params.id } });
  if (!row) return res.status(404).json({ error: 'Versi tidak ditemukan.' });
  res.json({ version: row });
});
