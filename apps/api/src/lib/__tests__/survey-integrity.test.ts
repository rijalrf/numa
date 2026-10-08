// Tes integritas survey terhadap database nyata: request bersamaan tidak boleh menggandakan job,
// pertanyaan, atau jawaban. Dilewati otomatis bila database tidak terjangkau atau belum ada user.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { prisma as PrismaClient } from '../prisma.js';

let prisma: typeof PrismaClient;
let ready = false;
let projectId = '';
let userId = '';
let mod: {
  enqueueAiJobOnce: typeof import('../ai/job.js').enqueueAiJobOnce;
  saveRoundQuestions: typeof import('../survey-store.js').saveRoundQuestions;
  saveRoundAnswers: typeof import('../survey-store.js').saveRoundAnswers;
  resolveTotalRounds: typeof import('../survey-store.js').resolveTotalRounds;
};

const questions = [1, 2, 3].map((n) => ({
  id: `q${n}`,
  label: `Pertanyaan ${n}?`,
  kind: 'radio' as const,
  options: ['A', 'B', 'C'],
  required: true,
  suggestion: 'A',
  suggestionReason: 'Karena A.',
}));

before(async () => {
  try {
    ({ prisma } = await import('../prisma.js'));
    const job = await import('../ai/job.js');
    // Hentikan worker agar enqueue tidak mengklaim job nyata di antrean database ini.
    await job.stopJobWorker();
    const user = await prisma.user.findFirst({ select: { id: true } });
    if (!user) return;
    userId = user.id;
    const project = await prisma.project.create({
      data: { userId, name: 'tes-integritas-survey', idea: 'tes', wizardStep: 'survey' },
    });
    projectId = project.id;
    mod = {
      enqueueAiJobOnce: job.enqueueAiJobOnce,
      ...(await import('../survey-store.js')),
    };
    ready = true;
  } catch (err) {
    ready = false;
    console.warn('Tes integritas survey dilewati:', (err as Error).message.split('\n').pop());
  }
});

after(async () => {
  if (projectId) await prisma.project.delete({ where: { id: projectId } }).catch(() => undefined);
  await prisma?.$disconnect().catch(() => undefined);
});

test('delapan enqueue survey_round bersamaan hanya membuat satu job', async (t) => {
  if (!ready) return t.skip('database tidak terjangkau atau tidak ada user');
  const results = await Promise.all(
    Array.from({ length: 8 }, () => mod.enqueueAiJobOnce({ projectId, type: 'survey_round', payload: { round: 1, totalRounds: 1 } })),
  );
  assert.equal(results.filter((r) => r.created).length, 1);
  assert.equal(new Set(results.map((r) => r.job.id)).size, 1);
  assert.equal(await prisma.aiJob.count({ where: { projectId, type: 'survey_round' } }), 1);
});

test('job survey_summary tidak terhalang job survey_round, dan selesai membuka slot baru', async (t) => {
  if (!ready) return t.skip('database tidak terjangkau atau tidak ada user');
  const summary = await mod.enqueueAiJobOnce({ projectId, type: 'survey_summary' });
  assert.equal(summary.created, true);

  await prisma.aiJob.updateMany({ where: { projectId, type: 'survey_round' }, data: { status: 'done' } });
  const next = await mod.enqueueAiJobOnce({ projectId, type: 'survey_round', payload: { round: 2, totalRounds: 2 } });
  assert.equal(next.created, true);
});

test('lima penyimpanan pertanyaan bersamaan menyisakan tepat tiga pertanyaan', async (t) => {
  if (!ready) return t.skip('database tidak terjangkau atau tidak ada user');
  await Promise.all(Array.from({ length: 5 }, () => mod.saveRoundQuestions(projectId, 1, questions)));
  const saved = await prisma.discoveryQuestion.findMany({ where: { projectId, round: 1 }, orderBy: { order: 'asc' } });
  assert.deepEqual(saved.map((q) => q.order), [1, 2, 3]);
});

test('submit jawaban bersamaan tidak menggandakan jawaban', async (t) => {
  if (!ready) return t.skip('database tidak terjangkau atau tidak ada user');
  const [q] = await prisma.discoveryQuestion.findMany({ where: { projectId, round: 1 }, orderBy: { order: 'asc' } });
  await Promise.all(
    Array.from({ length: 5 }, (_, i) => mod.saveRoundAnswers(projectId, 1, [{ questionId: q.id, value: `jawaban-${i}` }])),
  );
  assert.equal(await prisma.discoveryAnswer.count({ where: { questionId: q.id } }), 1);
});

test('submit jawaban atomik: pertanyaan asing menggagalkan seluruh submit', async (t) => {
  if (!ready) return t.skip('database tidak terjangkau atau tidak ada user');
  const [, q2, q3] = await prisma.discoveryQuestion.findMany({ where: { projectId, round: 1 }, orderBy: { order: 'asc' } });
  await assert.rejects(
    mod.saveRoundAnswers(projectId, 1, [
      { questionId: q2.id, value: 'B' },
      { questionId: 'bukan-milik-project', value: 'C' },
    ]),
    { code: 'invalid_question' },
  );
  assert.equal(await prisma.discoveryAnswer.count({ where: { questionId: { in: [q2.id, q3.id] } } }), 0);

  // Pertanyaan dari putaran lain juga ditolak.
  await assert.rejects(mod.saveRoundAnswers(projectId, 2, [{ questionId: q2.id, value: 'B' }]), { code: 'invalid_question' });
});

test('jumlah putaran terkunci saat survey dimulai dan tidak ikut perubahan paket', async (t) => {
  if (!ready) return t.skip('database tidak terjangkau atau tidak ada user');
  const fresh = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  assert.equal(fresh.surveyTotalRounds, null);

  const locked = await mod.resolveTotalRounds(fresh, userId, { lock: true });
  const stored = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  assert.equal(stored.surveyTotalRounds, locked);

  // Nilai terkunci dipakai walau paket (dan hasil hitung paket) berbeda.
  await prisma.project.update({ where: { id: projectId }, data: { surveyTotalRounds: 3 } });
  const again = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  assert.equal(await mod.resolveTotalRounds(again, userId, { lock: true }), 3);
});
