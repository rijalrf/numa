import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAndNormalizeDAG } from '../dag-validator.js';

function task(taskId: string, order: number, depends_on: string[] = []) {
  return { taskId, order, depends_on, title: taskId, layer: 'BACKEND' } as any;
}

test('DAG: urutan topologis menaruh prasyarat sebelum dependen dan menata ulang order', () => {
  const res = validateAndNormalizeDAG([task('B', 1, ['A']), task('A', 2), task('C', 3, ['B'])]);
  assert.deepEqual(res.tasks.map((t) => t.taskId), ['A', 'B', 'C']);
  assert.deepEqual(res.tasks.map((t) => t.order), [1, 2, 3]);
  assert.equal(res.healed, false);
});

test('DAG: self-dependency dan dependensi tidak dikenal dibuang', () => {
  const res = validateAndNormalizeDAG([task('A', 1, ['A', 'ghost']), task('B', 2, ['A'])]);
  assert.equal(res.healed, true);
  assert.deepEqual(res.tasks.find((t) => t.taskId === 'A')!.depends_on, []);
  assert.ok(res.warnings.some((w) => w.includes('ghost')));
});

test('DAG: siklus diputus sehingga semua task tetap ada dan tidak ada siklus tersisa', () => {
  const res = validateAndNormalizeDAG([task('A', 1, ['B']), task('B', 2, ['A']), task('C', 3, ['B'])]);
  assert.equal(res.healed, true);
  assert.equal(res.tasks.length, 3);
  const pos = new Map(res.tasks.map((t, i) => [t.taskId, i]));
  for (const t of res.tasks) for (const d of t.depends_on) assert.ok(pos.get(d)! < pos.get(t.taskId)!);
});

test('DAG: taskId kosong diberi ID cadangan', () => {
  const res = validateAndNormalizeDAG([task('', 1), task('B', 2)]);
  assert.match(res.tasks[0].taskId, /^TASK-\d{3}$/);
});
