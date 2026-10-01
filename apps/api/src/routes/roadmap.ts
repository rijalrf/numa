// Step 3: roadmap dari PRD (asinkron / fire-and-forget dengan polling status).
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { PrdSchema } from '../lib/ai/prd.js';
import { generateRoadmapFromPRD } from '../lib/ai/roadmap.js';
import { startAiJob, hasActiveJob } from '../lib/ai/job.js';

export const roadmapRouter = Router();

roadmapRouter.post('/api/projects/:id/roadmap/generate', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { prd: true },
  });
  if (!project?.prd) return res.status(400).json({ error: 'PRD belum ada. Generate PRD dulu.' });

  if (await hasActiveJob(project.id, 'roadmap_generate')) {
    return res.status(409).json({ error: 'Perancangan roadmap sedang berlangsung. Mohon tunggu sejenak.' });
  }

  const projectId = project.id;
  try {
    const prdContent = PrdSchema.parse(project.prd.content);
    await startAiJob(projectId, 'roadmap_generate', async () => {
      const data = await generateRoadmapFromPRD(prdContent, { projectId });

      // Tulis ulang roadmap secara atomik (cascade hapus features + deps).
      await prisma.$transaction(
        async (tx) => {
          await tx.roadmapPhase.deleteMany({ where: { projectId } });

          const phaseMap = new Map<string, string>(); // tmpId -> realId
          for (const p of data.phases) {
            const created = await tx.roadmapPhase.create({
              data: { projectId, order: p.order, title: p.title, description: p.description, layer: p.layer },
            });
            for (const f of p.features) {
              const fcreated = await tx.roadmapFeature.create({
                data: { phaseId: created.id, title: f.title, description: f.description },
              });
              phaseMap.set(f.id, fcreated.id);
            }
          }
          for (const p of data.phases) {
            for (const f of p.features) {
              if (f.dependsOn.length === 0) continue;
              const fromId = phaseMap.get(f.id);
              if (!fromId) continue;
              for (const dep of f.dependsOn) {
                const toId = phaseMap.get(dep);
                if (!toId) continue;
                await tx.roadmapDependency.create({ data: { featureId: fromId, dependsOnId: toId } });
              }
            }
          }
        },
        { timeout: 60000 }
      );
      return { ok: true };
    });
    res.json({ ok: true, status: 'generating' });
  } catch (err) {
    res.status(502).json({ error: 'AI gagal menghasilkan roadmap.', detail: (err as Error).message });
  }
});

roadmapRouter.get('/api/projects/:id/roadmap', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
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
