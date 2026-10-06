// Download PRD/BRD sebagai .md dan export.zip paket dokumen proyek.
import { Router } from 'express';
import { projectWhere } from '../lib/access.js';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { getUserPlan } from '../lib/billing.js';
import { buildPrdMarkdown, buildTasksMarkdown } from '../lib/markdown-export.js';
import { buildZip } from '../lib/zip.js';

export const exportRouter = Router();

exportRouter.get(['/api/projects/:id/prd/download', '/api/projects/:id/brd/download'], requireUser, async (req: AuthedRequest, res) => {
  const { plan } = await getUserPlan(req.userId);
  if (plan === 'free') {
    return res.status(403).json({ error: 'Fitur ekspor dokumen hanya tersedia untuk paket Starter dan Pro. Silakan upgrade paket.' });
  }

  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
    include: { prd: true },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });
  if (!project.prd) {
    return res.status(400).json({ error: 'PRD belum ada. Generate PRD dulu.' });
  }

  const md = buildPrdMarkdown(project, project.prd);
  const safeName = project.name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');

  res.setHeader('Content-Type', 'text/markdown');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}_PRD.md"`);
  res.send(md);
});

// ============================================================
// User endpoint: download paket lengkap (.zip) -> PRD.md, TASKS.md
// ============================================================
exportRouter.get('/api/projects/:id/export.zip', requireUser, async (req: AuthedRequest, res) => {
  const { plan } = await getUserPlan(req.userId);
  if (plan !== 'pro') {
    return res.status(403).json({ error: 'Ekspor paket lengkap (.zip) hanya tersedia untuk paket Pro. Silakan upgrade paket.' });
  }

  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
    include: {
      prd: true,
      tasks: {
        orderBy: { order: 'asc' },
      },
    },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const prdMd = project.prd ? buildPrdMarkdown(project, project.prd) : '# PRD Belum Dibuat\n';
  const tasksMd = buildTasksMarkdown(project, project.tasks);

  const zipBuffer = buildZip([
    { name: 'PRD.md', content: prdMd },
    { name: 'TASKS.md', content: tasksMd },
  ]);

  const safeName = project.name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  const filename = `${safeName}_paket.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', String(zipBuffer.length));
  res.send(zipBuffer);
});
