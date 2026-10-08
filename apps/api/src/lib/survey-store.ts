// Penyimpanan survey: jumlah putaran terkunci, jawaban atomik, dan pertanyaan idempoten.
import { prisma } from './prisma.js';
import { HttpError } from './http-error.js';
import { getUserPlan, PLANS } from './billing.js';
import type { SurveyQuestionItem } from './survey.js';

/**
 * Jumlah putaran survey sebuah project. Dikunci di Project.surveyTotalRounds saat survey dimulai
 * (lock=true) sehingga upgrade/downgrade paket di tengah survey tidak mengubah jumlah putaran.
 * Project lama tanpa kunci mengikuti paket terkini; lock=true menguncinya pada saat itu.
 */
export async function resolveTotalRounds(
  project: { id: string; surveyTotalRounds: number | null },
  userId: string,
  opts: { lock?: boolean } = {},
): Promise<number> {
  if (project.surveyTotalRounds != null) return project.surveyTotalRounds;
  const { plan } = await getUserPlan(userId);
  const total = PLANS[plan]?.surveyRounds ?? 1;
  if (opts.lock) {
    // updateMany dengan syarat null: bila dua request berlomba, hanya yang pertama menulis.
    await prisma.project.updateMany({ where: { id: project.id, surveyTotalRounds: null }, data: { surveyTotalRounds: total } });
    const locked = await prisma.project.findUnique({ where: { id: project.id }, select: { surveyTotalRounds: true } });
    return locked?.surveyTotalRounds ?? total;
  }
  return total;
}

export type RoundAnswerInput = { questionId: string; value: string | string[] };

/**
 * Simpan jawaban satu putaran secara atomik: semua tersimpan atau tidak sama sekali.
 * Setiap questionId harus milik project dan putaran tersebut; selebihnya ditolak (400).
 * Upsert bertumpu pada unique (questionId), jadi submit bersamaan tidak menggandakan jawaban.
 */
export async function saveRoundAnswers(projectId: string, round: number, answers: RoundAnswerInput[]): Promise<void> {
  const ids = [...new Set(answers.map((a) => a.questionId))];
  const owned = await prisma.discoveryQuestion.count({ where: { id: { in: ids }, projectId, round } });
  if (owned !== ids.length) {
    throw new HttpError(400, 'Jawaban memuat pertanyaan yang bukan milik putaran ini.', 'invalid_question');
  }
  await prisma.$transaction(
    answers.map((item) => {
      const text = Array.isArray(item.value) ? item.value.join(', ') : String(item.value);
      return prisma.discoveryAnswer.upsert({
        where: { questionId: item.questionId },
        create: { questionId: item.questionId, answer: text, value: item.value },
        update: { answer: text, value: item.value },
      });
    }),
  );
}

/**
 * Simpan pertanyaan satu putaran (dan opsional ganti nama project) dalam satu transaksi.
 * skipDuplicates + unique (projectId, round, order) membuat dua job paralel tidak menggandakan pertanyaan.
 */
export async function saveRoundQuestions(
  projectId: string,
  round: number,
  questions: SurveyQuestionItem[],
  rename?: string,
): Promise<void> {
  await prisma.$transaction([
    ...(rename ? [prisma.project.update({ where: { id: projectId }, data: { name: rename } })] : []),
    prisma.discoveryQuestion.createMany({
      skipDuplicates: true,
      data: questions.map((q, i) => ({
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
      })),
    }),
  ]);
}
