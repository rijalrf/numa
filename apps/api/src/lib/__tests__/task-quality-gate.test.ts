import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTaskQualityGate } from '../task-quality.js';
import { resolveStackContract } from '../ai/stack-contract.js';
import { ProductSpecSchema } from '../ai/product-spec.js';

const stack = { ...resolveStackContract([]), frontend: { framework: 'Next.js', version: null }, backend: { framework: 'Next.js', version: null } };

const t = (taskId: string, order: number, layer: string, over: Record<string, unknown> = {}) =>
  ({
    taskId,
    title: `Task ${taskId}`,
    layer,
    featureId: 'f',
    order,
    requirement_ids: [],
    depends_on: [],
    files_to_create: [],
    files_to_modify: [],
    files_readonly: [],
    forbidden: [],
    implementation_steps: [],
    acceptanceCriteria: ['Awal'],
    validation_commands: [],
    definition_of_done: [],
    out_of_scope: [],
    apiContracts: [],
    consumesApis: [],
    ...over,
  }) as any;

const prd = { markdown: '', requirementIndex: [], spec: ProductSpecSchema.parse({}) } as any;

test('gate: file ganda, endpoint tanpa backend, FRONTEND membuat endpoint, dan baseline desain tercatat', async () => {
  const generated = [
    t('TASK-001', 1, 'BOOTSTRAP', { files_to_create: ['src/app/providers.tsx'] }),
    t('TASK-002', 2, 'BACKEND', { apiContracts: [{ method: 'GET', path: '/api/appointments' }] }),
    t('TASK-003', 3, 'FRONTEND', { title: 'Fondasi UI', files_to_create: ['src/app/providers.tsx', 'src/lib/api-client.ts'] }),
    t('TASK-004', 4, 'FRONTEND', {
      title: 'Halaman janji temu',
      files_to_create: ['src/app/api/doctors/route.ts', 'src/app/(app)/appointments/page.tsx'],
      consumesApis: [{ method: 'GET', path: '/api/appointments' }, { method: 'GET', path: '/api/schedules' }],
    }),
  ];
  const gate = await runTaskQualityGate({ generated, prd, stack });
  const codes = gate.findings.map((f) => f.code);
  assert.ok(codes.includes('FILE_CREATE_DUPLICATE'));
  assert.ok(codes.includes('UI_API_NO_BACKEND'));
  assert.ok(codes.includes('FRONTEND_CREATES_API'));
  assert.ok(codes.includes('DESIGN_BASELINE_APPLIED'));
  assert.ok(!codes.includes('UI_FOUNDATION_MISSING'));

  const byId = new Map(gate.tasks.map((x) => [x.taskId, x]));
  assert.deepEqual(byId.get('TASK-003')!.files_to_create, ['src/app/providers.tsx', 'src/lib/api-client.ts']);
  assert.deepEqual(byId.get('TASK-001')!.files_to_create, []);
  assert.ok(byId.get('TASK-001')!.files_to_modify.includes('src/app/providers.tsx'));
  assert.ok(byId.get('TASK-004')!.depends_on.includes('TASK-003'));
});

test('gate siklus: baseline fondasi dan pemeriksaan endpoint lintas spec dilewati, file yang sudah ada menjadi modifikasi', async () => {
  const generated = [t('TASK-100', 100, 'FRONTEND', { title: 'Halaman laporan', files_to_create: ['src/lib/api-client.ts', 'src/app/(app)/laporan/page.tsx'], consumesApis: [{ method: 'GET', path: '/api/reports' }] })];
  const gate = await runTaskQualityGate({ generated, prd, stack, cycle: true, existingFiles: ['src/lib/api-client.ts'] });
  const codes = gate.findings.map((f) => f.code);
  assert.ok(!codes.includes('UI_FOUNDATION_MISSING'));
  assert.ok(!codes.includes('UI_API_NO_BACKEND'));
  assert.deepEqual(gate.tasks[0].files_to_create, ['src/app/(app)/laporan/page.tsx']);
  assert.deepEqual(gate.tasks[0].files_to_modify, ['src/lib/api-client.ts']);
  assert.deepEqual(gate.tasks[0].depends_on, []);
});
