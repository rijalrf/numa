import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySecurityBaseline } from '../security-baseline.js';

function task(layer: string, over: Record<string, unknown> = {}) {
  return { taskId: 'T', title: 'Task', layer, acceptanceCriteria: ['Kriteria awal'], apiContracts: [], consumesApis: [], ...over } as any;
}
const sec = (t: any) => t.acceptanceCriteria.filter((c: string) => c.startsWith('Keamanan:'));

test('BOOTSTRAP mendapat kriteria .gitignore/.env', () => {
  const { tasks, touched } = applySecurityBaseline([task('BOOTSTRAP')]);
  assert.equal(touched, 1);
  assert.equal(sec(tasks[0]).length, 1);
  assert.match(sec(tasks[0])[0], /\.gitignore/);
});

test('BACKEND mutasi mendapat validasi, auth, integritas relasi, dan rate limit sesuai endpoint', () => {
  const t = task('BACKEND', {
    apiContracts: [
      { method: 'POST', path: '/api/auth/login' },
      { method: 'DELETE', path: '/api/items/:id' },
    ],
  });
  const crit = sec(applySecurityBaseline([t]).tasks[0]).join('\n');
  assert.match(crit, /tanpa nilai default/);
  assert.match(crit, /divalidasi dengan skema/);
  assert.match(crit, /HTTP 409/);
  assert.match(crit, /IDOR/);
  assert.match(crit, /rate limiting/);
});

test('endpoint publik (authRequired=false di spec) tidak mendapat kriteria autentikasi', () => {
  const t = task('BACKEND', { apiContracts: [{ method: 'GET', path: '/api/items' }] });
  const spec = [{ method: 'GET', path: '/api/items', description: '', authRequired: false, requirementIds: [] }];
  assert.doesNotMatch(sec(applySecurityBaseline([t], spec).tasks[0]).join('\n'), /IDOR/);
  assert.match(sec(applySecurityBaseline([t], []).tasks[0]).join('\n'), /IDOR/); // tanpa spec: dianggap terproteksi
});

test('jalur publik umum (health) dianggap tidak butuh auth tanpa spec', () => {
  const t = task('BACKEND', { apiContracts: [{ method: 'GET', path: '/health' }] });
  assert.doesNotMatch(sec(applySecurityBaseline([t]).tasks[0]).join('\n'), /IDOR/);
});

test('DATABASE hanya dapat kriteria password bila menyangkut password', () => {
  assert.equal(sec(applySecurityBaseline([task('DATABASE')]).tasks[0]).length, 0);
  const withPassword = task('DATABASE', { title: 'Skema tabel User dengan password' });
  assert.equal(sec(applySecurityBaseline([withPassword]).tasks[0]).length, 1);
});

test('kriteria tidak digandakan bila dijalankan dua kali, task tanpa tambahan tidak dihitung', () => {
  const once = applySecurityBaseline([task('BOOTSTRAP'), task('INTEGRATION')]);
  assert.equal(once.touched, 1);
  const twice = applySecurityBaseline(once.tasks);
  assert.equal(twice.touched, 0);
  assert.equal(sec(twice.tasks[0]).length, 1);
});
