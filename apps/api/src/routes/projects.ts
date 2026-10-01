// Project endpoints (user side): list, create, detail.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { checkProjectLimit } from '../lib/billing.js';
import { furthestStage } from '../lib/stage.js';

export const projectsRouter = Router();

const CreateProjectBody = z.object({
  name: z.string().min(1).max(120),
  idea: z.string().min(10).max(4000),
});

projectsRouter.get('/api/projects', requireUser, async (req: AuthedRequest, res) => {
  const projects = await prisma.project.findMany({
    where: { userId: req.userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      idea: true,
      status: true,
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

  const project = await prisma.project.create({
    data: { userId: req.userId, name: parsed.data.name, idea: parsed.data.idea, status: 'ACTIVE' },
  });
  res.status(201).json({ project });
});

projectsRouter.get('/api/projects/:id', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { stacks: true, prd: true, roadmap: { include: { features: { include: { tasks: true } } } } },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });
  res.json({ project });
});
