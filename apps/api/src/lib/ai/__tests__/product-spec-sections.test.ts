import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectSpecSections } from '../product-spec.js';

const prd = [
  '# PRD Warung',
  '## 1. Ringkasan Eksekutif & Latar Belakang',
  'Ringkasan panjang yang tidak dipakai ekstraktor.',
  '## 2. Target Pengguna & Persona',
  'Pemilik warung.',
  '## 3. Tujuan Produk & Batasan MVP',
  'Tujuan yang tidak dipakai.',
  '## 4. Functional Requirements',
  '- FR-001 Kelola produk',
  '## 5. Aturan Produk & Bisnis',
  '- PR-001 Stok tidak boleh negatif',
  '## 6. Rancangan Model Data (Database Schema)',
  'Tabel products.',
  '## 7. Spesifikasi Endpoint API',
  'GET /api/products',
  '## 8. Kebutuhan Non-Fungsional',
  'Tidak dipakai.',
  '## 9. Skenario Edge Cases & Penanganan Kesalahan',
  'Tidak dipakai.',
  '## 11. Metrik Keberhasilan (Success Metrics)',
  'Tidak dipakai.',
].join('\n');

test('selectSpecSections menyimpan bagian yang dipakai dan membuang sisanya', () => {
  const out = selectSpecSections(prd);
  for (const keep of ['Target Pengguna', 'Functional Requirements', 'Aturan Produk', 'Model Data', 'Endpoint API']) {
    assert.ok(out.includes(keep), `bagian ${keep} harus ada`);
  }
  for (const drop of ['Ringkasan Eksekutif', 'Tujuan Produk', 'Non-Fungsional', 'Edge Cases', 'Metrik Keberhasilan']) {
    assert.ok(!out.includes(drop), `bagian ${drop} harus dibuang`);
  }
  assert.ok(out.length < prd.length);
});

test('selectSpecSections mengembalikan markdown utuh bila model data atau endpoint tidak ditemukan', () => {
  const noEndpoint = prd.replace('## 7. Spesifikasi Endpoint API', '## 7. Lain-lain');
  assert.equal(selectSpecSections(noEndpoint), noEndpoint);
  const plain = 'PRD tanpa heading bernomor.';
  assert.equal(selectSpecSections(plain), plain);
});
