import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFlowContract, enumerateFlowPaths } from '../flow-contract';
import { BusinessFlowSchema } from '../schemas';

const flow = BusinessFlowSchema.parse({
  processName: 'Alur Pemesanan',
  lanes: [
    { id: 'lc', name: 'Pelanggan', kind: 'human' },
    { id: 'ls', name: 'Sistem', kind: 'system' },
  ],
  steps: [
    { id: 's1', label: 'Mulai', type: 'start', laneId: 'lc' },
    { id: 's2', label: 'Isi form', type: 'process', laneId: 'lc' },
    { id: 's3', label: 'Data valid?', type: 'decision', laneId: 'ls' },
    { id: 's4', label: 'Simpan pesanan', type: 'process', laneId: 'ls', requirementIds: ['FR-002'] },
    { id: 's5', label: 'Kirim notifikasi', type: 'process', laneId: 'ls', requirementIds: ['FR-009'] },
    { id: 's6', label: 'Selesai', type: 'end', laneId: 'lc' },
  ],
  edges: [
    { from: 's1', to: 's2' },
    { from: 's2', to: 's3' },
    { from: 's3', to: 's4', label: 'Ya' },
    { from: 's3', to: 's2', label: 'Tidak' },
    { from: 's4', to: 's5' },
    { from: 's5', to: 's6' },
  ],
});

function task(partial: Record<string, unknown>): any {
  return {
    taskId: 'TASK-001',
    title: 'Task',
    layer: 'BACKEND',
    order: 1,
    requirement_ids: [],
    depends_on: [],
    acceptanceCriteria: ['ok'],
    ...partial,
  };
}

test('enumerateFlowPaths memotong siklus dan menghasilkan jalur sampai end', () => {
  const paths = enumerateFlowPaths(flow);
  assert.equal(paths.length, 1);
  assert.deepEqual(paths[0].stepIds, ['s1', 's2', 's3', 's4', 's5', 's6']);
  assert.ok(paths[0].labels.includes('[Ya]'));
  assert.deepEqual(paths[0].requirementIds.sort(), ['FR-002', 'FR-009']);
});

test('applyFlowContract menyuntik skenario ke task INTEGRATION bertitle test', () => {
  const tasks = [
    task({ taskId: 'TASK-001', layer: 'BACKEND', requirement_ids: ['FR-002'] }),
    task({ taskId: 'TASK-002', layer: 'INTEGRATION', title: 'Wire API' }),
    task({ taskId: 'TASK-003', layer: 'INTEGRATION', title: 'Test Automation & Journey' }),
  ];
  const out = applyFlowContract(flow, tasks);
  const target = out.tasks.find((t) => t.taskId === 'TASK-003')!;
  assert.ok(target.acceptanceCriteria.some((c) => c.includes('Skenario E2E S1')));
  assert.ok(target.requirement_ids.includes('FR-009'));
  assert.equal(out.tasks.find((t) => t.taskId === 'TASK-002')!.acceptanceCriteria.length, 1);
});

test('applyFlowContract melaporkan step sistem yang requirement-nya belum tercakup', () => {
  const out = applyFlowContract(flow, [
    task({ requirement_ids: ['FR-002'] }),
    task({ taskId: 'TASK-002', layer: 'INTEGRATION', title: 'Journey test' }),
  ]);
  const uncovered = out.findings.filter((f) => f.code === 'FLOW_STEP_UNCOVERED');
  assert.equal(uncovered.length, 1);
  assert.ok(uncovered[0].message.includes('FR-009'));
});

test('applyFlowContract memberi error bila tidak ada task INTEGRATION', () => {
  const out = applyFlowContract(flow, [task({ requirement_ids: ['FR-002', 'FR-009'] })]);
  assert.ok(out.findings.some((f) => f.code === 'FLOW_NO_INTEGRATION_TASK' && f.severity === 'error'));
});
