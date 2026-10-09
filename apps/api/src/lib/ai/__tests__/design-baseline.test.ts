import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDesignBaseline, isFoundationTask } from '../design-baseline.js';
import { SpecDesignSchema } from '../product-spec.js';

const t = (taskId: string, order: number, layer: string, title: string, over: Record<string, unknown> = {}) =>
  ({ taskId, title, layer, order, featureId: 'f', depends_on: [], acceptanceCriteria: ['Awal'], definition_of_done: [], ...over }) as any;
const design = SpecDesignSchema.parse({ tone: 'klinis, tenang', palette: { primary: '#0f766e', neutral: '#f8fafc', rationale: 'tepercaya' }, typography: { heading: 'Poppins', body: 'Inter' } });

test('isFoundationTask: berdasarkan judul atau featureId, hanya layer FRONTEND', () => {
  assert.equal(isFoundationTask({ layer: 'FRONTEND', title: 'Fondasi UI', featureId: 'f' }), true);
  assert.equal(isFoundationTask({ layer: 'FRONTEND', title: 'Halaman', featureId: 'ui-foundation' }), true);
  assert.equal(isFoundationTask({ layer: 'BACKEND', title: 'Fondasi UI', featureId: 'f' }), false);
  assert.equal(isFoundationTask({ layer: 'FRONTEND', title: 'Halaman login', featureId: 'f1' }), false);
});

test('kriteria fondasi masuk ke task Fondasi UI; task halaman mendapat kriteria komponen dan depends_on', () => {
  const { tasks, findings } = applyDesignBaseline(
    [t('TASK-010', 10, 'FRONTEND', 'Fondasi UI: layout dan komponen'), t('TASK-011', 11, 'FRONTEND', 'Halaman login'), t('TASK-001', 1, 'BACKEND', 'API')],
    { design },
  );
  const [foundation, page, backend] = tasks;
  assert.match(foundation.acceptanceCriteria.join('\n'), /token desain/);
  assert.match(foundation.acceptanceCriteria.join('\n'), /Poppins dan Inter/);
  assert.match(foundation.acceptanceCriteria.join('\n'), /#0f766e/);
  assert.match(page.acceptanceCriteria.join('\n'), /komponen internal/);
  assert.deepEqual(page.depends_on, ['TASK-010']);
  assert.deepEqual(foundation.depends_on, []);
  assert.match(page.definition_of_done.join('\n'), /390 px dan 1280 px/);
  assert.equal(backend.acceptanceCriteria.length, 1);
  assert.deepEqual(findings.map((f) => f.code), ['DESIGN_BASELINE_APPLIED']);
});

test('UI_FOUNDATION_MISSING: kriteria fondasi ditempel ke task FRONTEND paling awal', () => {
  const { tasks, findings } = applyDesignBaseline([t('TASK-020', 20, 'FRONTEND', 'Halaman B'), t('TASK-010', 10, 'FRONTEND', 'Halaman A')]);
  assert.match(tasks[1].acceptanceCriteria.join('\n'), /pustaka komponen internal/);
  assert.deepEqual(tasks[0].depends_on, ['TASK-010']);
  assert.ok(findings.some((f) => f.code === 'UI_FOUNDATION_MISSING' && f.severity === 'warning'));
});

test('siklus perubahan: tanpa baseline fondasi, tanpa depends_on, kriteria komponen tetap ada', () => {
  const { tasks, findings } = applyDesignBaseline([t('TASK-100', 100, 'FRONTEND', 'Halaman laporan')], { cycle: true });
  assert.match(tasks[0].acceptanceCriteria.join('\n'), /komponen internal/);
  assert.doesNotMatch(tasks[0].acceptanceCriteria.join('\n'), /pustaka komponen internal \(components\/ui atau padanannya\) memuat minimal/);
  assert.deepEqual(tasks[0].depends_on, []);
  assert.ok(!findings.some((f) => f.code === 'UI_FOUNDATION_MISSING'));
});

test('tidak menggandakan kriteria dan tanpa task FRONTEND tidak ada perubahan', () => {
  const once = applyDesignBaseline([t('TASK-1', 1, 'FRONTEND', 'Fondasi UI')]).tasks;
  const twice = applyDesignBaseline(once).tasks;
  assert.deepEqual(twice[0].acceptanceCriteria, once[0].acceptanceCriteria);
  const none = applyDesignBaseline([t('TASK-2', 1, 'BACKEND', 'API')]);
  assert.equal(none.touched, 0);
  assert.equal(none.findings.length, 0);
});
