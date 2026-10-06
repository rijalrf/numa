// Unlock tahap sebelumnya (mundur step wizard).
import { Router } from 'express';
import { projectWhere } from '../lib/access.js';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { STAGE_ORDER } from '../lib/stage.js';

export const wizardStepRouter = Router();

const WizardStepBody = z.object({
  step: z.enum(['chat', 'survey', 'techstack', 'prd', 'tree', 'board']),
});

wizardStepRouter.post('/api/projects/:id/wizard-step', requireUser, async (req: AuthedRequest, res) => {
  const parsed = WizardStepBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Step tidak valid', detail: parsed.error.flatten() });
  }

  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
    include: { chatSession: { select: { id: true } } },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const normalizedStep = (parsed.data.step as string) === 'brd' ? 'prd' : parsed.data.step;
  const currentRank = STAGE_ORDER[project.wizardStep ?? 'techstack'] ?? 1;
  const targetRank = STAGE_ORDER[normalizedStep] ?? 0;
  if (targetRank >= currentRank) {
    return res.status(400).json({ error: 'Hanya diizinkan berpindah mundur ke tahap sebelumnya.' });
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { wizardStep: normalizedStep },
  });

  res.json({
    ok: true,
    wizardStep: parsed.data.step,
    chatSessionId: project.chatSession?.id ?? null,
  });
});

