// Survey wizard: pertanyaan adaptif per putaran, generate async, submit jawaban.
import { logger, serializeError } from '../lib/logger.js';
import { Router } from 'express';
import { projectWhere } from '../lib/access.js';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { getUserPlan, PLANS } from '../lib/billing.js';
import { generateSurveyRound, generateSurveySummary } from '../lib/survey.js';
import { enqueueAiJob, getLatestJob, hasActiveJob, registerJobHandler, toClientStatus, NonRetryableJobError, rejectJobLimit } from '../lib/ai/job.js';

export const surveyRouter = Router();

type SurveyRoundPayload = { round: number; totalRounds: number };

// Jawaban terbaru per pertanyaan, dipakai sebagai konteks adaptif dan ringkasan.
async function collectAnswers(projectId: string, roundBelow?: number) {
  const questions = await prisma.discoveryQuestion.findMany({
    where: { projectId, ...(roundBelow ? { round: { lt: roundBelow } } : {}) },
    include: { answers: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: [{ round: 'asc' }, { order: 'asc' }],
  });
  return questions
    .filter((q) => q.answers.length > 0 && q.answers[0].answer)
    .map((q) => ({ question: q.question, answer: q.answers[0].answer }));
}

registerJobHandler<SurveyRoundPayload>('survey_round', async ({ projectId, payload }) => {
  const round = payload?.round ?? 1;
  const totalRounds = payload?.totalRounds ?? 1;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { idea: true } });
  if (!project) throw new NonRetryableJobError('Project tidak ditemukan.');

  // Idempoten: percobaan ulang tidak menggandakan pertanyaan yang sudah tersimpan.
  if ((await prisma.discoveryQuestion.count({ where: { projectId, round } })) > 0) return { round };

  const generated = await generateSurveyRound({
    idea: project.idea,
    priorAnswers: round > 1 ? await collectAnswers(projectId, round) : [],
    round,
    totalRounds,
    projectId,
  });

  await prisma.$transaction(
    generated.map((q, i) =>
      prisma.discoveryQuestion.create({
        data: {
          projectId,
          round,
          order: i + 1,
          question: q.label,
          context: q.id,
          kind: q.kind,
          options: q.options,
          required: q.required,
          suggestion: q.suggestion,
          suggestionReason: q.suggestionReason,
        },
      })
    )
  );
  return { round };
});

registerJobHandler('survey_summary', async ({ projectId }) => {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { idea: true } });
  if (!project) throw new NonRetryableJobError('Project tidak ditemukan.');

  const summary = await generateSurveySummary({
    idea: project.idea,
    answers: await collectAnswers(projectId),
    projectId,
  });
  await prisma.project.update({
    where: { id: projectId },
    data: { name: summary.name, description: summary.summary },
  });
  return summary;
});


const SurveySubmitSchema = z.object({
  round: z.number().int().min(1),
  answers: z.array(
    z.object({
      questionId: z.string(),
      value: z.union([z.string(), z.array(z.string())]),
    })
  ).min(1),
});

surveyRouter.get('/api/projects/:id/survey', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const { plan } = await getUserPlan(req.userId);
  const totalRounds = PLANS[plan]?.surveyRounds ?? 1;

  const existingQuestions = await prisma.discoveryQuestion.findMany({
    where: { projectId: project.id },
    include: { answers: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: [{ round: 'asc' }, { order: 'asc' }],
  });

  // GET murni read (idempoten). Generate pertanyaan dilakukan lewat POST /survey/generate
  // atau otomatis oleh POST /survey/submit, sebagai job async.
  let generationStatus = 'idle';
  let generationError = null;
  if (existingQuestions.length === 0) {
    const job = await getLatestJob(project.id, 'survey_round');
    generationStatus = toClientStatus(job?.status);
    generationError = job?.error ?? null;
  }

  // Cari round aktif saat ini (round terkecil yang pertanyaannya belum lengkap dijawab)
  const roundNumbers = Array.from(new Set(existingQuestions.map((q) => q.round))).sort((a, b) => a - b);
  let activeRound = roundNumbers[0] || 1;

  for (const r of roundNumbers) {
    const roundQuestions = existingQuestions.filter((q) => q.round === r);
    const allAnswered = roundQuestions.every((q) => q.answers.length > 0 && q.answers[0].answer);
    if (!allAnswered) {
      activeRound = r;
      break;
    }
    activeRound = r;
  }

  // Cek apakah seluruh putaran sudah tuntas
  const maxExistingRound = Math.max(...roundNumbers, 1);
  const maxRoundQuestions = existingQuestions.filter((q) => q.round === maxExistingRound);
  const maxRoundAnswered = maxRoundQuestions.length > 0 && maxRoundQuestions.every((q) => q.answers.length > 0 && q.answers[0].answer);
  const isComplete = (maxExistingRound >= totalRounds && maxRoundAnswered) || (project.description && project.description !== project.idea && project.wizardStep !== 'survey');

  res.json({
    projectId: project.id,
    projectName: project.name,
    idea: project.idea,
    round: activeRound,
    totalRounds,
    isComplete: Boolean(isComplete),
    summary: project.description,
    wizardStep: project.wizardStep,
    plan,
    generationStatus,
    generationError,
    questions: existingQuestions.map((q) => ({
      id: q.id,
      round: q.round,
      order: q.order,
      label: q.question,
      context: q.context,
      kind: q.kind,
      options: q.options,
      required: q.required,
      suggestion: q.suggestion,
      suggestionReason: q.suggestionReason,
      answer: q.answers[0]?.answer || '',
      value: q.answers[0]?.value ?? null,
    })),
  });
});

surveyRouter.post('/api/projects/:id/survey/generate', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const existingCount = await prisma.discoveryQuestion.count({ where: { projectId: project.id } });
  if (existingCount > 0) {
    return res.json({ ok: true, status: 'done' });
  }

  if (await hasActiveJob(project.id, 'survey_round')) {
    return res.json({ ok: true, status: 'generating' });
  }

  const { plan } = await getUserPlan(req.userId);
  const totalRounds = PLANS[plan]?.surveyRounds ?? 1;
  const projectId = project.id;

  try {
    await enqueueAiJob({ projectId, type: 'survey_round', userId: req.userId, payload: { round: 1, totalRounds } });

    res.json({ ok: true, status: 'generating' });
  } catch (err) {
    logger.error('Gagal memulai generate survey round 1', { scope: 'survey', error: serializeError(err) });
    if (rejectJobLimit(res, err)) return;
    res.status(502).json({ error: 'Gagal menyusun pertanyaan survey tahap 1.' });
  }
});

surveyRouter.post('/api/projects/:id/survey/submit', requireUser, async (req: AuthedRequest, res) => {
  const parsed = SurveySubmitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data jawaban survey tidak valid.' });

  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const { plan } = await getUserPlan(req.userId);
  const totalRounds = PLANS[plan]?.surveyRounds ?? 1;
  const currentRound = parsed.data.round;

  // 1. Simpan/update jawaban setiap pertanyaan
  for (const item of parsed.data.answers) {
    const strAnswer = Array.isArray(item.value) ? item.value.join(', ') : String(item.value);
    const existing = await prisma.discoveryAnswer.findFirst({
      where: { questionId: item.questionId },
    });
    if (existing) {
      await prisma.discoveryAnswer.update({
        where: { id: existing.id },
        data: { answer: strAnswer, value: item.value as any },
      });
    } else {
      await prisma.discoveryAnswer.create({
        data: {
          questionId: item.questionId,
          answer: strAnswer,
          value: item.value as any,
        },
      });
    }
  }

  // 2. Jika masih ada putaran berikutnya: generate pertanyaan round berikutnya secara async
  if (currentRound < totalRounds) {
    const nextRound = currentRound + 1;

    // Bersihkan pertanyaan round berikutnya jika user mundur dan submit ulang (regenerate)
    const futureQuestions = await prisma.discoveryQuestion.findMany({
      where: { projectId: project.id, round: { gte: nextRound } },
      select: { id: true },
    });
    if (futureQuestions.length > 0) {
      const qIds = futureQuestions.map((q) => q.id);
      await prisma.discoveryAnswer.deleteMany({ where: { questionId: { in: qIds } } });
      await prisma.discoveryQuestion.deleteMany({ where: { id: { in: qIds } } });
    }

    if (await hasActiveJob(project.id, 'survey_round')) {
      return res.json({ done: false, nextRound, totalRounds, status: 'generating' });
    }

    const projectId = project.id;
    try {
      await enqueueAiJob({ projectId, type: 'survey_round', userId: req.userId, payload: { round: nextRound, totalRounds } });

      return res.json({ done: false, nextRound, totalRounds, status: 'generating' });
    } catch (err) {
      logger.error('Gagal memulai generate pertanyaan survey', { scope: 'survey', round: nextRound, error: serializeError(err) });
      if (rejectJobLimit(res, err)) return;
      return res.status(502).json({ error: `Gagal menyusun pertanyaan tahap ${nextRound}.` });
    }
  }

  // 3. Putaran terakhir telah selesai -> Susun Ringkasan Produk Terstruktur (async)
  if (await hasActiveJob(project.id, 'survey_summary')) {
    return res.json({ done: true, totalRounds, status: 'generating' });
  }

  const projectId = project.id;
  try {
    await enqueueAiJob({ projectId, type: 'survey_summary', userId: req.userId });

    return res.json({ done: true, totalRounds, status: 'generating' });
  } catch (err) {
    logger.error('Gagal memulai generate survey summary', { scope: 'survey', error: serializeError(err) });
    if (rejectJobLimit(res, err)) return;
    return res.status(502).json({ error: 'Gagal menyusun ringkasan produk.', detail: (err as Error).message });
  }
});

surveyRouter.post('/api/projects/:id/survey/complete', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const { plan } = await getUserPlan(req.userId);
  if (plan === 'free') {
    return res.status(403).json({
      error: 'Paket Free hanya dapat mengakses hingga survey kebutuhan. Silakan upgrade paket untuk melanjutkan ke pemilihan teknologi dan PRD.',
      code: 'plan_upgrade_required',
      plan,
      upgradeUrl: '/pricing',
    });
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { wizardStep: 'techstack' },
  });

  res.json({ ok: true, wizardStep: 'techstack' });
});

