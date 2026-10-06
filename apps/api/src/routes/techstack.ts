// Tech stack: rekomendasi AI dan pemilihan manual (Golden Pack).
import { TechStackBodySchema } from '../lib/request-schemas.js';
import { Router } from 'express';
import { projectWhere } from '../lib/access.js';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { isStageLocked } from '../lib/stage.js';
import { recommendTechStack } from '../lib/ai/chat.js';
import { parseStackEntry } from '../lib/ai/stack-contract.js';
import { validateGoldenSelection } from '../lib/ai/golden-stack.js';
import { enqueueAiJob, hasActiveJob, registerJobHandler, rejectJobLimit } from '../lib/ai/job.js';

export const techstackRouter = Router();

registerJobHandler('techstack_recommend', async ({ projectId }) => recommendTechStack(projectId));

techstackRouter.post('/api/projects/:id/techstack/recommend', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({ where: projectWhere(req.userId, req.params.id) });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  if (isStageLocked(project.wizardStep, 'techstack')) {
    return res.status(403).json({ error: 'Tahap tech stack telah selesai dan terkunci (Read-Only).' });
  }

  if (await hasActiveJob(project.id, 'techstack_recommend')) {
    return res.json({ ok: true, status: 'generating' });
  }

  const projectId = project.id;
  try {
    await enqueueAiJob({ projectId, type: 'techstack_recommend', userId: req.userId });
    res.json({ ok: true, status: 'generating' });
  } catch (err) {
    if (rejectJobLimit(res, err)) return;
    res.status(502).json({ error: 'AI gagal merekomendasikan tech stack.', detail: (err as Error).message });
  }
});

techstackRouter.put('/api/projects/:id/techstack', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({ where: projectWhere(req.userId, req.params.id) });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  if (isStageLocked(project.wizardStep, 'techstack')) {
    return res.status(403).json({ error: 'Tahap tech stack telah selesai dan terkunci (Read-Only).' });
  }

  const { techStack: stacks } = TechStackBodySchema.parse(req.body ?? {});
  const check = validateGoldenSelection(stacks);
  if (!check.ok) {
    return res.status(400).json({ error: check.error });
  }

  await prisma.stack.deleteMany({ where: { projectId: project.id } });
  await Promise.all(
    stacks.map((s: string) => {
      const parsed = parseStackEntry(s);
      return prisma.stack.create({
        data: {
          projectId: project.id,
          category: parsed.category,
          name: parsed.name,
          version: parsed.version,
        },
      });
    })
  );

  await prisma.project.update({ where: { id: project.id }, data: { wizardStep: 'prd' } });
  res.json({ ok: true });
});
