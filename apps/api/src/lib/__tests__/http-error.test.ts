import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { HttpError, toClientError } from '../http-error.js';

test('HttpError meneruskan pesan dan kode', () => {
  const r = toClientError(new HttpError(403, 'Kuota tercapai', 'project_limit_reached'));
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'Kuota tercapai');
  assert.equal(r.body.code, 'project_limit_reached');
});

test('ZodError menjadi 400 dengan daftar issue', () => {
  const parsed = z.object({ nama: z.string() }).safeParse({});
  assert.ok(!parsed.success);
  const r = toClientError(parsed.error);
  assert.equal(r.status, 400);
  assert.equal(r.body.issues?.[0].path, 'nama');
});

test('error internal tidak membocorkan pesan', () => {
  const r = toClientError(new Error('password db = rahasia'));
  assert.equal(r.status, 500);
  assert.ok(!JSON.stringify(r.body).includes('rahasia'));
});

test('error 4xx berpesan internal dibalas generik', () => {
  const r = toClientError(Object.assign(new Error('detail internal'), { status: 404 }));
  assert.equal(r.status, 404);
  assert.ok(!r.body.error.includes('internal'));
});

test('body terlalu besar menjadi 413', () => {
  const r = toClientError(Object.assign(new Error('x'), { type: 'entity.too.large' }));
  assert.equal(r.status, 413);
});
