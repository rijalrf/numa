import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findUiApiWithoutBackend, validateApiCoverage } from '../api-coverage-validator.js';

const task = (taskId: string, layer: string, over: Record<string, unknown> = {}) =>
  ({ taskId, title: `Task ${taskId}`, layer, apiContracts: [], consumesApis: [], acceptanceCriteria: [], ...over }) as any;

test('UI memanggil endpoint yang tidak ada di spec maupun backend: ditandai (semua method, termasuk GET)', () => {
  const tasks = [
    task('B1', 'BACKEND', { apiContracts: [{ method: 'GET', path: '/api/appointments' }] }),
    task('F1', 'FRONTEND', { consumesApis: [{ method: 'GET', path: '/api/appointments' }, { method: 'GET', path: '/api/schedules' }] }),
  ];
  const missing = findUiApiWithoutBackend(tasks, []);
  assert.deepEqual(missing.map((m) => `${m.method} ${m.path}`), ['GET /api/schedules']);
});

test('normalisasi parameter :id, [id], dan {id} dianggap sama', () => {
  const tasks = [
    task('B1', 'BACKEND', { apiContracts: [{ method: 'DELETE', path: '/api/items/:id' }] }),
    task('F1', 'FRONTEND', { consumesApis: [{ method: 'delete', path: '/api/items/[id]' }, { method: 'PUT', path: '/api/other/{id}' }] }),
  ];
  const specEndpoints = [{ method: 'PUT', path: '/api/other/:otherId' }];
  assert.deepEqual(findUiApiWithoutBackend(tasks, specEndpoints), []);
  const covered = validateApiCoverage(tasks, [{ method: 'DELETE', path: '/api/items/{id}' }]);
  assert.equal(covered.uncovered.length, 0);
});
