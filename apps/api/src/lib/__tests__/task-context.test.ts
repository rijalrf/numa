import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRequirementContext,
  extractRequirementBlocks,
  selectEndpoints,
  selectEntities,
  selectProjectFiles,
  summarizeArchitecture,
} from '../task-context.js';
import { ARCHITECTURE_CONTRACTS } from '../ai/architecture-contract.js';

const PRD = `## 4. Functional Requirements
- **FR-001**: Pelanggan dapat membuat pesanan dengan minimal satu item.
  - Aktor: Pelanggan
  - Prioritas: MUST
- **FR-002**: Admin dapat menyetujui pesanan.

## 5. Aturan Produk
- **PR-001**: Total pesanan dihitung dari harga item saat checkout.

## 9. Edge Cases
- **EC-001**: Pesanan tanpa item (FR-001) ditolak dengan HTTP 422.
- **EC-002**: Admin menyetujui pesanan yang sudah dibatalkan (FR-002) ditolak.
`;

test('extractRequirementBlocks mengambil deskripsi penuh beserta sub-butir', () => {
  const blocks = extractRequirementBlocks(PRD);
  assert.match(blocks.get('FR-001') ?? '', /minimal satu item/);
  assert.match(blocks.get('FR-001') ?? '', /Aktor: Pelanggan/);
  assert.doesNotMatch(blocks.get('FR-001') ?? '', /menyetujui/);
  assert.match(blocks.get('PR-001') ?? '', /harga item saat checkout/);
});

test('extractRequirementBlocks tidak membuka blok dari baris yang hanya menyebut ID', () => {
  const blocks = extractRequirementBlocks('Lihat FR-009 untuk detail.\n- **FR-001**: Utama');
  assert.equal(blocks.has('FR-009'), false);
  assert.equal(blocks.has('FR-001'), true);
});

test('buildRequirementContext hanya memuat requirement, edge case, dan journey milik task', () => {
  const ctx = buildRequirementContext({
    ids: ['FR-001', 'PR-001'],
    markdown: PRD,
    requirementIndex: [{ id: 'FR-001', title: 'Buat pesanan' }],
    rules: [],
    journeys: [
      { name: 'Checkout', steps: ['Pilih item', 'Bayar'], requirementIds: ['FR-001'] },
      { name: 'Persetujuan', steps: ['Buka antrean'], requirementIds: ['FR-002'] },
    ],
  });
  assert.deepEqual(ctx.requirements.map((r) => r.id), ['FR-001', 'PR-001']);
  assert.deepEqual(ctx.edgeCases.map((e) => e.id), ['EC-001']);
  assert.deepEqual(ctx.journeys.map((j) => j.name), ['Checkout']);
});

test('buildRequirementContext jatuh ke aturan terstruktur lalu judul bila blok markdown tidak ada', () => {
  const ctx = buildRequirementContext({
    ids: ['PR-007', 'FR-005'],
    markdown: '',
    requirementIndex: [{ id: 'FR-005', title: 'Cari produk' }],
    rules: [{ id: 'PR-007', description: 'Stok tidak boleh negatif' }],
    journeys: [],
  });
  assert.equal(ctx.requirements.find((r) => r.id === 'PR-007')?.text, 'Stok tidak boleh negatif');
  assert.equal(ctx.requirements.find((r) => r.id === 'FR-005')?.text, 'Cari produk');
});

const spec = [
  { method: 'POST', path: '/api/orders', description: 'Buat pesanan', requirementIds: ['FR-001'] },
  { method: 'POST', path: '/api/orders/:id/approve', description: 'Setujui', requirementIds: ['FR-002'] },
  { method: 'GET', path: '/api/products', description: 'Daftar produk', requirementIds: [] },
];

test('selectEndpoints memilih endpoint sesuai requirement dan mengutamakan kontrak aktual', () => {
  const sel = selectEndpoints({
    requirementIds: ['FR-001'],
    haystack: '',
    own: [],
    consumes: [],
    completed: [{ method: 'POST', path: '/api/orders', description: 'AKTUAL', requestBody: '{ items }' }],
    spec,
  });
  assert.equal(sel.endpoints.length, 1);
  assert.equal(sel.endpoints[0].description, 'AKTUAL');
  assert.equal(sel.total, 3);
});

test('selectEndpoints memakai consumesApis dan jatuh ke kecocokan nama resource bila tak ada requirement cocok', () => {
  const viaConsumes = selectEndpoints({
    requirementIds: [],
    haystack: '',
    own: [],
    consumes: [{ method: 'GET', path: '/api/products' }],
    completed: [],
    spec,
  });
  assert.equal(viaConsumes.endpoints[0].path, '/api/products');

  const viaName = selectEndpoints({ requirementIds: [], haystack: 'halaman daftar products', own: [], consumes: [], completed: [], spec });
  assert.deepEqual(viaName.endpoints.map((e) => e.path), ['/api/products']);
});

const entities = [
  { name: 'Order', description: 'Pesanan', fields: [{ name: 'id', type: 'string' }], relations: ['Customer (many-to-one)'] },
  { name: 'Customer', description: undefined, fields: [], relations: [] },
  { name: 'Invoice', description: undefined, fields: [], relations: [] },
];

test('selectEntities memilih model yang disebut task dan menyertakan relasi satu langkah', () => {
  const sel = selectEntities({ layer: 'BACKEND', entities, haystack: 'endpoint order baru', endpoints: [] });
  assert.deepEqual(sel.entities.map((e) => e.name).sort(), ['Customer', 'Order']);
  assert.equal(sel.fallback, false);
});

test('selectEntities: tanpa kecocokan, layer DATABASE/BACKEND fallback ke model awal, FRONTEND kosong', () => {
  const db = selectEntities({ layer: 'DATABASE', entities, haystack: 'migrasi awal', endpoints: [] });
  assert.equal(db.fallback, true);
  assert.equal(db.entities.length, 3);
  const fe = selectEntities({ layer: 'FRONTEND', entities, haystack: 'halaman beranda', endpoints: [] });
  assert.equal(fe.entities.length, 0);
});

test('selectProjectFiles memakai changedFiles nyata, menyaring noise, dan mengutamakan file task', () => {
  const sel = selectProjectFiles({
    completed: [
      { changedFiles: ['package-lock.json', 'node_modules/x/index.js', 'apps/web/src/a.ts', 'apps/api/src/orders.ts'], plannedFiles: ['rencana.ts'] },
    ],
    taskFiles: ['apps/api/src/orders.ts'],
  });
  assert.equal(sel.planned, false);
  assert.deepEqual(sel.files, ['apps/api/src/orders.ts', 'apps/web/src/a.ts']);
});

test('selectProjectFiles jatuh ke rencana bila tak ada laporan guard dan memberi penanda planned', () => {
  const sel = selectProjectFiles({ completed: [{ plannedFiles: ['src/a.ts'] }, { changedFiles: [] }], taskFiles: [] });
  assert.equal(sel.planned, true);
  assert.deepEqual(sel.files, ['src/a.ts']);
});

test('summarizeArchitecture ringkas: lapisan, larangan, dan format error', () => {
  const lines = summarizeArchitecture(ARCHITECTURE_CONTRACTS.express);
  assert.match(lines[0], /Express/);
  assert.match(lines[1], /Routes.*Controllers.*Services.*Repositories/);
  assert.ok(lines.some((l) => l.startsWith('Larangan:')));
  assert.ok(lines.length < 8);
});
