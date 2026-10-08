// Step 3: roadmap dari PRD (asinkron / fire-and-forget dengan polling status).
import { Router } from 'express';
import { projectWhere } from '../lib/access.js';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { readPrdContent } from '../lib/ai/prd.js';
import { resolveStackContract } from '../lib/ai/stack-contract.js';
import { saveRoadmap } from '../lib/roadmap-store.js';
import { generateRoadmapFromPRD } from '../lib/ai/roadmap.js';
import { enqueueAiJob, hasActiveJob, registerJobHandler, NonRetryableJobError, rejectJobLimit } from '../lib/ai/job.js';

export const roadmapRouter = Router();

registerJobHandler('roadmap_generate', async ({ projectId }) => {
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { prd: true, stacks: true } });
  if (!project?.prd) throw new NonRetryableJobError('PRD belum ada. Generate PRD dulu.');
  const data = await generateRoadmapFromPRD(readPrdContent(project.prd.content), {
    projectId,
    stack: project.stacks.length > 0 ? resolveStackContract(project.stacks) : undefined,
  });
  await saveRoadmap(projectId, data);
  return { ok: true };
});

roadmapRouter.post('/api/projects/:id/roadmap/generate', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
    include: { prd: true },
  });
  if (!project?.prd) return res.status(400).json({ error: 'PRD belum ada. Generate PRD dulu.' });

  if (await hasActiveJob(project.id, 'roadmap_generate')) {
    return res.status(409).json({ error: 'Perancangan roadmap sedang berlangsung. Mohon tunggu sejenak.' });
  }

  const projectId = project.id;
  try {
    await enqueueAiJob({ projectId, type: 'roadmap_generate', userId: req.userId });
    res.json({ ok: true, status: 'generating' });
  } catch (err) {
    if (rejectJobLimit(res, err)) return;
    res.status(502).json({ error: 'AI gagal menghasilkan roadmap.', detail: (err as Error).message });
  }
});

roadmapRouter.get('/api/projects/:id/roadmap', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
    include: {
      roadmap: {
        orderBy: { order: 'asc' },
        include: {
          features: {
            include: { dependencies: { include: { dependsOn: true } }, tasks: true },
          },
        },
      },
    },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });
  res.json({ phases: project.roadmap });
});
