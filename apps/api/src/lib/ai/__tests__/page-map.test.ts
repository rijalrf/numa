import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProductSpecSchema, checkSpecConsistency } from '../product-spec.js';
import { findPageApiMissing, listPagePaths, mergePages, renderDesignDirection, renderPageMap, selectRelevantPages } from '../page-map.js';
import { endpointKey, normalizeEndpointPath } from '../endpoint-path.js';

const spec = ProductSpecSchema.parse({
  personas: [{ name: 'Pasien' }, { name: 'Dokter' }],
  endpoints: [{ method: 'POST', path: '/api/auth/login' }, { method: 'GET', path: '/api/appointments' }],
  pages: [
    { path: '/login', title: 'Masuk', access: 'public', endpoints: [{ method: 'post', path: '/api/auth/login' }], requirementIds: ['FR-001'] },
    { path: '/patient/appointments', title: 'Janji Temu', access: 'auth', roles: ['Pasien'], homeFor: ['Pasien'], endpoints: [{ method: 'GET', path: '/api/appointments' }, { method: 'DELETE', path: '/api/appointments/:id' }], requirementIds: ['FR-002'] },
    { path: '/doctor/consultations', title: 'Konsultasi', access: 'auth', roles: ['Dokter'] },
  ],
});

test('spec lama tanpa pages dan design tetap valid', () => {
  const old = ProductSpecSchema.parse({ entities: [], endpoints: [] });
  assert.deepEqual(old.pages, []);
  assert.equal(old.design, undefined);
});

test('SpecPageSchema menormalkan access dan method endpoint', () => {
  assert.equal(spec.pages[0].access, 'public');
  assert.equal(spec.pages[0].endpoints[0].method, 'POST');
  assert.equal(ProductSpecSchema.parse({ pages: [{ path: '/x', access: 'aneh' }] }).pages[0].access, 'auth');
});

test('SpecDesignSchema: nilai tidak dikenal jatuh ke default', () => {
  const d = ProductSpecSchema.parse({ design: { tone: 'tenang', density: 'padat sekali', radius: 'bulat' } }).design!;
  assert.equal(d.density, 'comfortable');
  assert.equal(d.radius, 'medium');
  assert.deepEqual(d.avoid, []);
  assert.match(renderDesignDirection(d), /Nuansa: tenang/);
});

test('findPageApiMissing: hanya endpoint halaman yang tidak ada di spec, dengan normalisasi parameter', () => {
  const missing = findPageApiMissing(spec);
  assert.deepEqual(missing, [{ method: 'DELETE', path: '/api/appointments/:id', page: '/patient/appointments' }]);
  assert.deepEqual(findPageApiMissing(ProductSpecSchema.parse({})), []);
  assert.equal(endpointKey('get', '/api/x/[id]'), endpointKey('GET', '/api/x/:id'));
  assert.equal(normalizeEndpointPath('/api/x/{id}/'), '/api/x/:param');
});

test('checkSpecConsistency: peran tanpa halaman awal ditandai, path ganda ditandai', () => {
  const warnings = checkSpecConsistency(spec).join('\n');
  assert.match(warnings, /Peran "Dokter" belum punya halaman awal/);
  assert.doesNotMatch(warnings, /Peran "Pasien" belum/);
  const dup = ProductSpecSchema.parse({ pages: [{ path: '/a' }, { path: '/A/' }] });
  assert.match(checkSpecConsistency(dup).join('\n'), /terdaftar ganda/);
});

test('renderPageMap, selectRelevantPages, listPagePaths, mergePages', () => {
  const text = renderPageMap(spec.pages);
  assert.match(text, /\/login "Masuk" \[publik/);
  assert.match(text, /halaman awal setelah login untuk: Pasien/);
  assert.deepEqual(selectRelevantPages(spec.pages, ['FR-002'], '').map((p) => p.path), ['/patient/appointments']);
  assert.deepEqual(selectRelevantPages(spec.pages, [], 'ubah /doctor/consultations').map((p) => p.path), ['/doctor/consultations']);
  assert.equal(listPagePaths(spec.pages).length, 3);
  const merged = mergePages(spec.pages, ProductSpecSchema.parse({ pages: [{ path: '/LOGIN/' }, { path: '/admin/reports' }] }).pages);
  assert.deepEqual(merged.map((p) => p.path).slice(3), ['/admin/reports']);
});
