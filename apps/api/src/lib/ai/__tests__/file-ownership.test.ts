import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enforceFileOwnership, findSimilarFileNames } from '../file-ownership.js';
import { resolveStackContract } from '../stack-contract.js';
import { resolveUiShellContract } from '../ui-shell-contract.js';

const t = (taskId: string, order: number, layer: string, create: string[], over: Record<string, unknown> = {}) =>
  ({ taskId, title: `Task ${taskId}`, layer, order, featureId: 'f', files_to_create: create, files_to_modify: [], depends_on: [], acceptanceCriteria: [], ...over }) as any;

test('file yang dibuat dua task: pembuat kedua menjadi modifikasi dengan depends_on ke pemilik', () => {
  const { tasks, findings } = enforceFileOwnership([
    t('TASK-001', 1, 'BACKEND', ['src/lib/validations/auth.ts']),
    t('TASK-002', 2, 'BACKEND', ['src/lib/validations/auth.ts', 'src/a.ts']),
  ]);
  assert.deepEqual(tasks[0].files_to_create, ['src/lib/validations/auth.ts']);
  assert.deepEqual(tasks[1].files_to_create, ['src/a.ts']);
  assert.deepEqual(tasks[1].files_to_modify, ['src/lib/validations/auth.ts']);
  assert.deepEqual(tasks[1].depends_on, ['TASK-001']);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, 'FILE_CREATE_DUPLICATE');
});

test('file bersama menurut kontrak dimiliki task berlayer pemilik, bukan pembuat pertama', () => {
  const contract = resolveUiShellContract({ ...resolveStackContract([]), frontend: { framework: 'Next.js', version: null } });
  const bootstrap = t('TASK-001', 1, 'BOOTSTRAP', ['src/app/providers.tsx']);
  const foundation = t('TASK-005', 5, 'FRONTEND', ['src/app/providers.tsx'], { title: 'Fondasi UI: layout dan komponen' });
  const { tasks } = enforceFileOwnership([bootstrap, foundation], { contract });
  assert.deepEqual(tasks[1].files_to_create, ['src/app/providers.tsx']);
  assert.deepEqual(tasks[0].files_to_create, []);
  assert.deepEqual(tasks[0].files_to_modify, ['src/app/providers.tsx']);
  assert.deepEqual(tasks[0].depends_on, ['TASK-005']);
});

test('file yang sudah ada dari task selesai: task siklus yang membuatnya menjadi modifikasi tanpa depends_on', () => {
  const { tasks, findings } = enforceFileOwnership([t('TASK-100', 100, 'BACKEND', ['src/a.ts', 'src/b.ts'])], { existingFiles: ['./src/a.ts'] });
  assert.deepEqual(tasks[0].files_to_create, ['src/b.ts']);
  assert.deepEqual(tasks[0].files_to_modify, ['src/a.ts']);
  assert.deepEqual(tasks[0].depends_on, []);
  assert.match(findings[0].message, /sudah selesai/);
});

test('tanpa duplikat, task tidak berubah', () => {
  const input = [t('TASK-001', 1, 'BACKEND', ['a.ts']), t('TASK-002', 2, 'BACKEND', ['b.ts'])];
  const { tasks, findings } = enforceFileOwnership(input);
  assert.deepEqual(tasks, input);
  assert.equal(findings.length, 0);
});

test('findSimilarFileNames: skema ganda dan komponen banner kembar ditandai, nama tak terkait tidak', () => {
  const found = findSimilarFileNames([
    t('A', 1, 'BACKEND', ['src/lib/validations/auth.ts', 'src/lib/validations/auth.schema.ts', 'src/lib/validations/doctor.ts']),
    t('B', 2, 'FRONTEND', ['src/components/ui/AlertBanner.tsx', 'src/components/ui/ErrorBanner.tsx', 'src/components/ui/Card.tsx']),
  ]);
  assert.equal(found.length, 2);
  assert.ok(found.every((f) => f.code === 'FILE_NAME_SIMILAR' && f.severity === 'info'));
});
