import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTechStackInput } from '../chat.js';

const base = { name: 'WarungPOS', idea: 'Aplikasi kasir warung.' };

test('input rekomendasi memuat ringkasan survey sebagai sumber utama', () => {
  const out = buildTechStackInput({ ...base, description: '## Target Pengguna\nPemilik dan 2 kasir.' });
  assert.match(out, /Nama aplikasi: WarungPOS/);
  assert.match(out, /Ide awal: Aplikasi kasir warung\./);
  assert.match(out, /Ringkasan hasil survey kebutuhan:\n## Target Pengguna\nPemilik dan 2 kasir\./);
});

test('input rekomendasi hanya memuat ide bila ringkasan belum ada atau masih sama dengan ide', () => {
  for (const description of [null, '', '   ', 'Aplikasi kasir warung.']) {
    const out = buildTechStackInput({ ...base, description });
    assert.doesNotMatch(out, /Ringkasan hasil survey/, String(description));
    assert.match(out, /Ide awal: Aplikasi kasir warung\./);
  }
});
