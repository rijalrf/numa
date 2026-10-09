import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChangeRequestBodySchema, ClarifyBodySchema, CycleGenerateBodySchema } from '../request-schemas.js';

test('ChangeRequestBodySchema: dipangkas, minimal 8 karakter, maksimal 4000', () => {
  assert.equal(ChangeRequestBodySchema.parse({ request: '  Tambah ekspor CSV  ' }).request, 'Tambah ekspor CSV');
  assert.equal(ChangeRequestBodySchema.safeParse({ request: 'pendek' }).success, false);
  assert.equal(ChangeRequestBodySchema.safeParse({ request: '       a       ' }).success, false);
  assert.equal(ChangeRequestBodySchema.safeParse({ request: 'x'.repeat(4001) }).success, false);
  assert.equal(ChangeRequestBodySchema.safeParse({}).success, false);
  assert.equal(ChangeRequestBodySchema.safeParse({ request: 123456789 }).success, false);
});

test('ClarifyBodySchema: minimal satu jawaban, tidak boleh kosong, batas panjang dan jumlah', () => {
  assert.equal(ClarifyBodySchema.safeParse({ answers: [{ questionId: 'q1', answer: 'CSV' }] }).success, true);
  assert.equal(ClarifyBodySchema.safeParse({ answers: [] }).success, false);
  assert.equal(ClarifyBodySchema.safeParse({ answers: [{ questionId: 'q1', answer: '   ' }] }).success, false);
  assert.equal(ClarifyBodySchema.safeParse({ answers: [{ questionId: '', answer: 'CSV' }] }).success, false);
  assert.equal(ClarifyBodySchema.safeParse({ answers: [{ questionId: 'q1', answer: 'x'.repeat(501) }] }).success, false);
  const eleven = Array.from({ length: 11 }, (_, i) => ({ questionId: `q${i}`, answer: 'a' }));
  assert.equal(ClarifyBodySchema.safeParse({ answers: eleven }).success, false);
  assert.equal(ClarifyBodySchema.safeParse({}).success, false);
});

test('CycleGenerateBodySchema: split bawaan single, hanya single/a/b, judul opsional dibatasi', () => {
  assert.deepEqual(CycleGenerateBodySchema.parse({ confirm: true }), { confirm: true, split: 'single' });
  assert.equal(CycleGenerateBodySchema.parse({ confirm: true, split: 'a' }).split, 'a');
  assert.equal(CycleGenerateBodySchema.safeParse({ confirm: true, split: 'c' }).success, false);
  assert.equal(CycleGenerateBodySchema.safeParse({ split: 'a' }).success, false);
  assert.equal(CycleGenerateBodySchema.safeParse({ confirm: true, title: '' }).success, false);
  assert.equal(CycleGenerateBodySchema.safeParse({ confirm: true, title: 'x'.repeat(121) }).success, false);
  assert.equal(CycleGenerateBodySchema.parse({ confirm: true, title: '  Ekspor CSV ' }).title, 'Ekspor CSV');
});

test('partRequest dari klien tidak lagi diterima: field tak dikenal dibuang', () => {
  const parsed = CycleGenerateBodySchema.parse({ confirm: true, split: 'a', partRequest: 'teks sisipan' });
  assert.equal('partRequest' in parsed, false);
});
