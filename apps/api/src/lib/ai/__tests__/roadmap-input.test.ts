import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoadmapInput } from '../roadmap.js';
import type { PrdDoc } from '../prd.js';

const markdown = '# PRD\n' + 'Deskripsi panjang fitur. '.repeat(2000);
const spec = {
  personas: [{ name: 'Kasir', description: '' }],
  entities: [{ name: 'Produk', fields: [{ name: 'id', type: 'string' }, { name: 'nama', type: 'string' }], relations: [] }],
  endpoints: [{ method: 'GET', path: '/api/produk', description: 'Daftar produk', authRequired: true, requirementIds: [] }],
  rules: [],
  journeys: [{ name: 'Jual barang', kind: 'main' as const, steps: ['a', 'b', 'c'], requirementIds: [] }],
};
const prd = { markdown, requirementIndex: [{ id: 'FR-001', title: 'Kelola produk' }], spec } as unknown as PrdDoc;
const stack = {
  frontend: { framework: 'Vue.js' },
  backend: { framework: 'Laravel PHP' },
  database: { engine: 'MySQL', orm: 'Eloquent' },
  testing: 'Playwright',
} as any;

test('roadmap memakai spec ringkas, bukan markdown penuh', () => {
  const out = buildRoadmapInput(prd, stack);
  assert.match(out, /SPEC TERSTRUKTUR PRD/);
  assert.match(out, /- Produk \(id, nama\)/);
  assert.match(out, /GET \/api\/produk \[auth\]/);
  assert.match(out, /Jual barang \(utama\): 3 langkah/);
  assert.match(out, /\[FR-001\] Kelola produk/);
  assert.ok(out.length < markdown.length / 10);
});

test('roadmap memuat tech stack terpilih agar tidak berasumsi Node/Prisma', () => {
  const out = buildRoadmapInput(prd, stack);
  assert.match(out, /Backend: Laravel PHP/);
  assert.match(out, /ORM: Eloquent/);
});

test('tanpa spec jatuh ke markdown PRD (dipotong)', () => {
  const out = buildRoadmapInput({ ...prd, spec: undefined } as PrdDoc);
  assert.match(out, /^PRD:/);
  assert.ok(out.length <= 30010);
});
