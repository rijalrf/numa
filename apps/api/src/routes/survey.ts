// Survey wizard: pertanyaan adaptif per putaran, generate async, submit jawaban.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { getUserPlan, PLANS } from '../lib/billing.js';
import { generateSurveyRound, generateSurveySummary } from '../lib/survey.js';
import { startAiJob, getLatestJob, hasActiveJob } from '../lib/ai/job.js';

export const surveyRouter = Router();

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
    where: { id: req.params.id, userId: req.userId },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const { plan } = await getUserPlan(req.userId);
  const totalRounds = PLANS[plan]?.surveyRounds ?? 1;

  let existingQuestions = await prisma.discoveryQuestion.findMany({
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
    generationStatus = job?.status === 'running' ? 'generating' : (job?.status ?? 'idle');
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
    where: { id: req.params.id, userId: req.userId },
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
  const idea = project.idea;

  try {
    await startAiJob(projectId, 'survey_round', async () => {
      const generated = await generateSurveyRound({
        idea,
        priorAnswers: [],
        round: 1,
        totalRounds,
        projectId,
      });

      await prisma.$transaction(
        generated.map((q, i) =>
          prisma.discoveryQuestion.create({
            data: {
              projectId,
              round: 1,
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
      return { round: 1 };
    });

    res.json({ ok: true, status: 'generating' });
  } catch (err) {
    console.error('[survey] Gagal memulai generate round 1:', err);
    res.status(502).json({ error: 'Gagal menyusun pertanyaan survey tahap 1.' });
  }
});

surveyRouter.post('/api/projects/:id/survey/submit', requireUser, async (req: AuthedRequest, res) => {
  const parsed = SurveySubmitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data jawaban survey tidak valid.' });

  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
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

    // Ambil seluruh jawaban hingga round saat ini untuk konteks adaptif
    const allAnsweredQuestions = await prisma.discoveryQuestion.findMany({
      where: { projectId: project.id, round: { lte: currentRound } },
      include: { answers: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: [{ round: 'asc' }, { order: 'asc' }],
    });
    const priorAnswers = allAnsweredQuestions
      .filter((q) => q.answers.length > 0 && q.answers[0].answer)
      .map((q) => ({ question: q.question, answer: q.answers[0].answer }));

    if (await hasActiveJob(project.id, 'survey_round')) {
      return res.json({ done: false, nextRound, totalRounds, status: 'generating' });
    }

    const projectId = project.id;
    const idea = project.idea;
    try {
      await startAiJob(projectId, 'survey_round', async () => {
        const nextGenerated = await generateSurveyRound({
          idea,
          priorAnswers,
          round: nextRound,
          totalRounds,
          projectId,
        });

        await prisma.$transaction(
          nextGenerated.map((nq, i) =>
            prisma.discoveryQuestion.create({
              data: {
                projectId,
                round: nextRound,
                order: i + 1,
                question: nq.label,
                context: nq.id,
                kind: nq.kind,
                options: nq.options,
                required: nq.required,
                suggestion: nq.suggestion,
                suggestionReason: nq.suggestionReason,
              },
            })
          )
        );
        return { nextRound };
      });

      return res.json({ done: false, nextRound, totalRounds, status: 'generating' });
    } catch (err) {
      console.error(`[survey] Gagal memulai generate pertanyaan round ${nextRound}:`, err);
      return res.status(502).json({ error: `Gagal menyusun pertanyaan tahap ${nextRound}.` });
    }
  }

  // 3. Putaran terakhir telah selesai -> Susun Ringkasan Produk Terstruktur (async)
  const allFinalQuestions = await prisma.discoveryQuestion.findMany({
    where: { projectId: project.id },
    include: { answers: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: [{ round: 'asc' }, { order: 'asc' }],
  });
  const allAnswers = allFinalQuestions
    .filter((q) => q.answers.length > 0 && q.answers[0].answer)
    .map((q) => ({ question: q.question, answer: q.answers[0].answer }));

  if (await hasActiveJob(project.id, 'survey_summary')) {
    return res.json({ done: true, totalRounds, status: 'generating' });
  }

  const projectId = project.id;
  const idea = project.idea;
  try {
    await startAiJob(projectId, 'survey_summary', async () => {
      const summary = await generateSurveySummary({
        idea,
        answers: allAnswers,
        projectId,
      });

      await prisma.project.update({
        where: { id: projectId },
        data: {
          name: summary.name,
          description: summary.summary,
        },
      });
      return summary;
    });

    return res.json({ done: true, totalRounds, status: 'generating' });
  } catch (err) {
    console.error('[survey] Gagal memulai generate survey summary:', err);
    return res.status(502).json({ error: 'Gagal menyusun ringkasan produk.', detail: (err as Error).message });
  }
});

surveyRouter.post('/api/projects/:id/survey/complete', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
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

