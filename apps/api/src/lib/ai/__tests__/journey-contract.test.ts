import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyJourneyContract, buildJourneyScenarios, renderJourneyScenarios } from '../journey-contract';
import { ProductSpecSchema } from '../product-spec';

const spec = ProductSpecSchema.parse({
  journeys: [
    { name: 'Checkout berhasil', steps: ['Buka keranjang', 'Isi alamat', 'Bayar', 'Terima konfirmasi'], requirementIds: ['FR-002', 'FR-003'] },
    {
      name: 'Pembayaran ditolak',
      kind: 'failure',
      branchFrom: { journey: 'checkout berhasil', stepIndex: 3 },
      steps: ['Tampilkan pesan gagal', 'Tawarkan metode lain'],
      requirementIds: ['EC-001'],
    },
    { name: 'Cabang yatim', kind: 'failure', branchFrom: { journey: 'tidak ada', stepIndex: 1 }, steps: ['Gagal'], requirementIds: [] },
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

test('skema journey mengisi kind main dan branchFrom kosong secara default', () => {
  const parsed = ProductSpecSchema.parse({ journeys: [{ name: 'A', steps: ['x'], kind: null, branchFrom: null }] });
  assert.equal(parsed.journeys[0].kind, 'main');
  assert.equal(parsed.journeys[0].branchFrom, undefined);
});

test('buildJourneyScenarios menggabungkan langkah utama sampai titik cabang dengan langkah jalur gagal', () => {
  const { scenarios, findings } = buildJourneyScenarios(spec.journeys);
  assert.equal(scenarios.length, 3);
  const failure = scenarios.find((s) => s.name === 'Pembayaran ditolak')!;
  assert.deepEqual(failure.steps, ['Buka keranjang', 'Isi alamat', 'Bayar', 'Tampilkan pesan gagal', 'Tawarkan metode lain']);
  assert.deepEqual(failure.requirementIds.sort(), ['EC-001', 'FR-002', 'FR-003']);
  assert.ok(findings.some((f) => f.code === 'JOURNEY_BRANCH_INVALID'));
});

test('renderJourneyScenarios menandai jalur utama dan gagal', () => {
  const text = renderJourneyScenarios(buildJourneyScenarios(spec.journeys).scenarios);
  assert.match(text, /S1\. \[utama\] Checkout berhasil/);
  assert.match(text, /S2\. \[gagal\] Pembayaran ditolak/);
});

test('applyJourneyContract menyuntik skenario ke task INTEGRATION bertitle test dan menandai requirement tak tercakup', () => {
  const tasks = [
    task({ taskId: 'TASK-001', requirement_ids: ['FR-002'] }),
    task({ taskId: 'TASK-002', layer: 'INTEGRATION', title: 'Wire API' }),
    task({ taskId: 'TASK-003', layer: 'INTEGRATION', title: 'Test Automation & Journey' }),
  ];
  const out = applyJourneyContract(spec.journeys, tasks);
  const target = out.tasks.find((t) => t.taskId === 'TASK-003')!;
  assert.ok(target.acceptanceCriteria.some((c: string) => c.includes('Skenario E2E S1')));
  assert.ok(target.acceptanceCriteria.some((c: string) => c.includes('Skenario kegagalan S2')));
  assert.ok(target.requirement_ids.includes('FR-003'));
  const uncovered = out.findings.filter((f) => f.code === 'JOURNEY_REQ_UNCOVERED');
  assert.equal(uncovered.length, 1);
  assert.deepEqual(uncovered[0].refs, ['FR-003']);
  assert.equal(uncovered[0].severity, 'warning');
});

test('applyJourneyContract tanpa task INTEGRATION melaporkan error, tanpa journey hanya info', () => {
  const noIntegration = applyJourneyContract(spec.journeys, [task({})]);
  assert.ok(noIntegration.findings.some((f) => f.code === 'JOURNEY_NO_INTEGRATION_TASK' && f.severity === 'error'));
  const none = applyJourneyContract([], [task({})]);
  assert.deepEqual(none.findings.map((f) => f.code), ['JOURNEY_NONE']);
});
