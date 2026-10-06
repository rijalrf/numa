// Tes HTTP tanpa database: memverifikasi gerbang akses, bentuk error, dan header keamanan.
// Semua skenario di sini ditolak sebelum menyentuh database.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { Express } from 'express';

let app: Express;

before(async () => {
  process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:1/test';
  process.env.BETTER_AUTH_SECRET ??= 'secret-khusus-pengujian-minimal-32-karakter';
  process.env.PLATFORM_ADMIN_EMAILS = 'admin@example.com';
  const { createApp } = await import('../../app.js');
  app = createApp();
});

test('GET /health membalas ok dan membawa request id serta header helmet', async () => {
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.ok(res.headers['x-request-id']);
  assert.equal(res.headers['x-powered-by'], undefined);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
});

test('GET /ready membalas 503 bila database tidak terjangkau', async () => {
  const res = await request(app).get('/ready');
  assert.equal(res.status, 503);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.checks.database, false);
});

test('endpoint user tanpa sesi dibalas 401', async () => {
  for (const path of ['/api/projects', '/api/user/profile', '/api/ai-metrics']) {
    const res = await request(app).get(path);
    assert.equal(res.status, 401, path);
    assert.ok(res.body.error, path);
  }
});

test('endpoint admin usage tanpa sesi dibalas 401 (bukan 404, agar tidak membuka info)', async () => {
  for (const name of ['summary', 'timeseries', 'by-agent', 'by-user', 'by-plan']) {
    const res = await request(app).get(`/api/admin/usage/${name}`);
    assert.equal(res.status, 401, name);
  }
});

test('endpoint agent tanpa token dibalas 401', async () => {
  const res = await request(app).get('/api/agent/tasks/next').set('X-Project-ID', 'p1');
  assert.equal(res.status, 401);
});

test('body JSON rusak dibalas 400 generik tanpa bocor detail internal', async () => {
  const res = await request(app).post('/api/billing/webhook').set('Content-Type', 'application/json').send('{rusak');
  assert.equal(res.status, 400);
  assert.ok(res.body.requestId);
  assert.equal(res.body.stack, undefined);
});

test('webhook billing dibalas 503 bila kunci gateway belum diatur', async () => {
  const lama = process.env.MIDTRANS_SERVER_KEY;
  delete process.env.MIDTRANS_SERVER_KEY;
  try {
    const res = await request(app).post('/api/billing/webhook').send({});
    assert.equal(res.status, 503);
  } finally {
    if (lama !== undefined) process.env.MIDTRANS_SERVER_KEY = lama;
  }
});

test('webhook billing dengan body tidak valid dibalas 400', async () => {
  const lama = process.env.MIDTRANS_SERVER_KEY;
  process.env.MIDTRANS_SERVER_KEY = 'kunci-uji';
  try {
    const res = await request(app).post('/api/billing/webhook').send({});
    assert.equal(res.status, 400);
  } finally {
    if (lama === undefined) delete process.env.MIDTRANS_SERVER_KEY;
    else process.env.MIDTRANS_SERVER_KEY = lama;
  }
});

test('body lebih dari 1 MB dibalas 413', async () => {
  const res = await request(app)
    .post('/api/billing/webhook')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ x: 'a'.repeat(1_100_000) }));
  assert.equal(res.status, 413);
});

test('CORS tidak mengizinkan origin asing', async () => {
  const res = await request(app).get('/health').set('Origin', 'https://jahat.example');
  assert.equal(res.headers['access-control-allow-origin'], undefined);
});
