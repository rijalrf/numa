import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClarifyAnswers,
  clarifyRoundCount,
  deriveChangeRequestState,
  type CycleJobInfo,
  type CyclesSnapshot,
  type ProjectCycleItem,
} from '../src/lib/cycle';

const idle: CycleJobInfo = { status: 'idle', error: null, cycleId: null };

function cycle(overrides: Partial<ProjectCycleItem> & { id: string }): ProjectCycleItem {
  return {
    number: 1,
    title: 'Judul',
    request: 'Tambah ekspor CSV',
    status: 'DRAFT',
    type: 'FEATURE',
    size: 'SMALL',
    impact: {},
    clarify: [],
    createdAt: '2026-10-09T00:00:00.000Z',
    taskCounts: { total: 0, done: 0 },
    ...overrides,
  };
}

function snapshot(cycles: ProjectCycleItem[], jobs: Partial<CyclesSnapshot['jobs']> = {}): CyclesSnapshot {
  return {
    cycles,
    openCycleId: cycles.find((c) => c.status === 'OPEN')?.id ?? null,
    draftCycleId: cycles.find((c) => c.status === 'DRAFT')?.id ?? null,
    initialTaskCounts: { total: 3, done: 3 },
    jobs: { analyze: idle, generate: idle, ...jobs },
  };
}

const analyzed = { summary: 'Menambah ekspor', clarity: 'CLEAR' as const };
const question = { id: 'q1', label: 'Format apa?', kind: 'radio' as const, options: ['CSV', 'XLSX'] };

test('tanpa draf dan tanpa siklus aktif: langkah input', () => {
  assert.equal(deriveChangeRequestState(snapshot([cycle({ id: 'c1', status: 'DONE' })])).phase, 'input');
  assert.equal(deriveChangeRequestState(snapshot([])).phase, 'input');
});

test('siklus OPEN tanpa draf: terblokir', () => {
  const state = deriveChangeRequestState(snapshot([cycle({ id: 'c1', status: 'OPEN' })]));
  assert.equal(state.phase, 'blocked');
  assert.equal(state.open?.id, 'c1');
});

test('draf dengan job analisis berjalan: sedang menganalisis', () => {
  const state = deriveChangeRequestState(
    snapshot([cycle({ id: 'd1' })], { analyze: { status: 'generating', error: null, cycleId: 'd1' } })
  );
  assert.equal(state.phase, 'analyzing');
});

test('job analisis milik siklus lain diabaikan', () => {
  const state = deriveChangeRequestState(
    snapshot([cycle({ id: 'd1' })], { analyze: { status: 'generating', error: null, cycleId: 'lama' } })
  );
  assert.equal(state.phase, 'not_analyzed');
});

test('draf belum dianalisis: gagal bila job analisisnya gagal, selain itu belum dianalisis', () => {
  const failed = deriveChangeRequestState(
    snapshot([cycle({ id: 'd1' })], { analyze: { status: 'failed', error: 'AI gagal', cycleId: 'd1' } })
  );
  assert.equal(failed.phase, 'analyze_failed');
  assert.equal(failed.jobError, 'AI gagal');
  assert.equal(deriveChangeRequestState(snapshot([cycle({ id: 'd1' })])).phase, 'not_analyzed');
});

test('permintaan kabur dengan pertanyaan: klarifikasi', () => {
  const state = deriveChangeRequestState(
    snapshot([cycle({ id: 'd1', impact: { ...analyzed, clarity: 'VAGUE', clarificationQuestions: [question] } })])
  );
  assert.equal(state.phase, 'clarify');
});

test('kabur tanpa pertanyaan tidak membuntukan alur: langsung ringkasan', () => {
  const state = deriveChangeRequestState(
    snapshot([cycle({ id: 'd1', impact: { ...analyzed, clarity: 'VAGUE', clarificationQuestions: [] } })])
  );
  assert.equal(state.phase, 'summary');
});

test('analisis jelas: ringkasan, dan generate gagal tampil sebagai pesan di ringkasan', () => {
  const clean = deriveChangeRequestState(snapshot([cycle({ id: 'd1', impact: analyzed })]));
  assert.equal(clean.phase, 'summary');
  assert.equal(clean.jobError, null);

  const failed = deriveChangeRequestState(
    snapshot([cycle({ id: 'd1', impact: analyzed })], { generate: { status: 'failed', error: 'Gagal merancang', cycleId: 'd1' } })
  );
  assert.equal(failed.phase, 'summary');
  assert.equal(failed.jobError, 'Gagal merancang');
});

test('job generate berjalan: merancang task, mengalahkan langkah lain', () => {
  const state = deriveChangeRequestState(
    snapshot([cycle({ id: 'd1', impact: analyzed })], { generate: { status: 'generating', error: null, cycleId: 'd1' } })
  );
  assert.equal(state.phase, 'generating');
});

test('draf sisa pemecahan saat siklus lain OPEN: terblokir walau draf sudah dianalisis', () => {
  const state = deriveChangeRequestState(
    snapshot([cycle({ id: 'a', status: 'OPEN', number: 1 }), cycle({ id: 'b', number: 2, impact: analyzed })])
  );
  assert.equal(state.phase, 'blocked');
  assert.equal(state.draft?.id, 'b');
  assert.equal(state.open?.id, 'a');
});

test('clarifyRoundCount: entri tanpa nomor dianggap putaran 1', () => {
  assert.equal(clarifyRoundCount(undefined), 0);
  assert.equal(clarifyRoundCount([]), 0);
  assert.equal(clarifyRoundCount([{ question: 'a', answer: 'b' }]), 1);
  assert.equal(clarifyRoundCount([{ question: 'a', answer: 'b', round: 1 }, { question: 'c', answer: 'd', round: 2 }]), 2);
});

test('buildClarifyAnswers: null bila ada pertanyaan belum dijawab, checkbox digabung', () => {
  const checkbox = { id: 'q2', label: 'Kolom?', kind: 'checkbox' as const, options: ['a', 'b'] };
  assert.equal(buildClarifyAnswers([question, checkbox], { q1: 'CSV' }), null);
  assert.equal(buildClarifyAnswers([question], { q1: '   ' }), null);
  assert.equal(buildClarifyAnswers([checkbox], { q2: [] }), null);
  assert.deepEqual(buildClarifyAnswers([question, checkbox], { q1: ' CSV ', q2: ['a', 'b'] }), [
    { questionId: 'q1', answer: 'CSV' },
    { questionId: 'q2', answer: 'a, b' },
  ]);
});
