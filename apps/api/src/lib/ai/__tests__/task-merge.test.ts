import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeOtherPhases, mapWithConcurrency, mergePhaseTasks, phasePrefix, type PhaseResult } from '../task-merge.js';

function task(taskId: string, order: number, featureId: string, depends_on: string[] = [], layer = 'BACKEND') {
  return { taskId, order, featureId, depends_on, title: taskId, layer, acceptanceCriteria: ['ok'] } as any;
}

const phases: PhaseResult[] = [
  {
    phase: { order: 2, layer: 'BACKEND', features: [{ id: 'f2', dependsOn: ['f1'] }] },
    tasks: [task('P2-002', 2, 'f2', ['P2-001']), task('P2-001', 1, 'f2')],
  },
  {
    phase: { order: 1, layer: 'DATABASE', features: [{ id: 'f1', dependsOn: [] }] },
    tasks: [task('P1-001', 1, 'f1', [], 'DATABASE'), task('P1-002', 2, 'f1', ['P1-001'], 'DATABASE')],
  },
  {
    phase: { order: 3, layer: 'FRONTEND', features: [{ id: 'f3', dependsOn: ['f2'] }] },
    tasks: [task('P3-001', 1, 'f3', ['f2'], 'FRONTEND')],
  },
];

test('merge: nomor global mengikuti urutan fase lalu urutan task', () => {
  const merged = mergePhaseTasks(phases);
  assert.deepEqual(merged.map((t) => t.taskId), ['TASK-001', 'TASK-002', 'TASK-003', 'TASK-004', 'TASK-005']);
  assert.deepEqual(merged.map((t) => t.order), [1, 2, 3, 4, 5]);
  assert.deepEqual(merged.map((t) => t.layer), ['DATABASE', 'DATABASE', 'BACKEND', 'BACKEND', 'FRONTEND']);
});

test('merge: depends_on lokal dipetakan ke taskId global', () => {
  const merged = mergePhaseTasks(phases);
  const byId = new Map(merged.map((t) => [t.taskId, t]));
  assert.deepEqual(byId.get('TASK-002')!.depends_on, ['TASK-001']); // P1-002 -> P1-001
  assert.deepEqual(byId.get('TASK-004')!.depends_on, ['TASK-003']); // P2-002 -> P2-001
});

test('merge: depends_on ke featureId fase lain menjadi task terakhir fitur itu', () => {
  const merged = mergePhaseTasks(phases);
  assert.deepEqual(merged.find((t) => t.taskId === 'TASK-005')!.depends_on, ['TASK-004']); // f2 -> task terakhir f2
});

test('merge: task pertama fitur otomatis bergantung pada fitur prasyarat roadmap bila AI lupa', () => {
  const merged = mergePhaseTasks(phases);
  // f2 dependsOn f1 di roadmap; P2-001 tidak menyebut f1 -> ditambahkan task terakhir f1 (TASK-002)
  assert.deepEqual(merged.find((t) => t.taskId === 'TASK-003')!.depends_on, ['TASK-002']);
  // task kedua f2 tidak ikut ditambah dependensi lintas fitur
  assert.deepEqual(merged.find((t) => t.taskId === 'TASK-004')!.depends_on, ['TASK-003']);
});

test('merge: dependensi lintas fitur tidak digandakan bila AI sudah menyebutkannya', () => {
  const withDep: PhaseResult[] = [
    phases[1],
    { phase: phases[0].phase, tasks: [task('P2-001', 1, 'f2', ['f1']), task('P2-002', 2, 'f2', ['P2-001'])] },
  ];
  const merged = mergePhaseTasks(withDep);
  assert.deepEqual(merged.find((t) => t.taskId === 'TASK-003')!.depends_on, ['TASK-002']);
});

test('merge: ID tak dikenal dipertahankan agar validasi DAG yang menolaknya, self-dependency dibuang', () => {
  const merged = mergePhaseTasks([
    { phase: { order: 1, layer: 'BACKEND', features: [{ id: 'f1', dependsOn: [] }] }, tasks: [task('P1-001', 1, 'f1', ['P1-001', 'ghost'])] },
  ]);
  assert.deepEqual(merged[0].depends_on, ['ghost']);
});

test('prefix dan ringkasan fase lain', () => {
  assert.equal(phasePrefix(3), 'P3');
  const text = describeOtherPhases(
    [
      { order: 1, title: 'Fondasi', layer: 'BOOTSTRAP', features: [{ id: 'f1', title: 'Init' }] },
      { order: 2, title: 'API', layer: 'BACKEND', features: [{ id: 'f2', title: 'Produk' }, { id: 'f3', title: 'Order' }] },
    ],
    2,
  );
  assert.equal(text, '- Fase 1 [BOOTSTRAP] Fondasi: Init (featureId: f1)');
});

test('mapWithConcurrency: batas konkurensi dipatuhi, urutan hasil terjaga, kegagalan terisolasi', async () => {
  let active = 0;
  let peak = 0;
  const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (n) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 10));
    active--;
    if (n === 4) throw new Error('gagal');
    return n * 10;
  });
  assert.equal(peak, 2);
  assert.deepEqual(results.map((r) => (r.status === 'fulfilled' ? r.value : 'x')), [10, 20, 30, 'x', 50, 60]);
});
