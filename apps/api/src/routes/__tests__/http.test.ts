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

test('POST /api/chat/finalize tanpa sesi dibalas 401, endpoint chat lama sudah dihapus', async () => {
  const res = await request(app).post('/api/chat/finalize').send({ idea: 'Aplikasi kasir' });
  assert.equal(res.status, 401);
  for (const path of ['/api/chat/sessions', '/api/chat/sessions/s1/messages', '/api/chat/sessions/s1/finalize', '/api/chat/sessions/s1/retry']) {
    const old = await request(app).post(path).send({});
    assert.equal(old.status, 404, path);
  }
});

test('login CLI: request, approve, deny butuh sesi; poll memvalidasi body; endpoint checkpoint sudah tidak ada', async () => {
  assert.equal((await request(app).get('/api/cli-auth/request?code=ABCD-EF23')).status, 401);
  for (const path of ['/api/cli-auth/approve', '/api/cli-auth/deny']) {
    assert.equal((await request(app).post(path).send({ code: 'ABCD-EF23' })).status, 401, path);
  }
  assert.equal((await request(app).post('/api/cli-auth/poll').send({})).status, 400);
  assert.equal((await request(app).get('/api/agent/checkpoints')).status, 404);
  assert.equal((await request(app).post('/api/checkpoints/x/approve')).status, 404);
});

test('endpoint admin usage tanpa sesi dibalas 401 (bukan 404, agar tidak membuka info)', async () => {
  for (const name of ['summary', 'timeseries', 'by-agent', 'by-user', 'by-plan']) {
    const res = await request(app).get(`/api/admin/usage/${name}`);
    assert.equal(res.status, 401, name);
  }
});

test('endpoint siklus perubahan tanpa sesi dibalas 401 (bukan 404, jadi rutenya terpasang)', async () => {
  const base = '/api/projects/p1';
  assert.equal((await request(app).get(`${base}/cycles`)).status, 401);
  assert.equal((await request(app).get(`${base}/cycles/c1`)).status, 401);
  for (const path of [`${base}/change-request`, `${base}/cycles/c1/analyze`, `${base}/cycles/c1/clarify`, `${base}/cycles/c1/generate`]) {
    const res = await request(app).post(path).send({});
    assert.equal(res.status, 401, path);
  }
  assert.equal((await request(app).delete(`${base}/cycles/c1`)).status, 401);
});

test('job siklus dikenali sebagai tipe job AI yang valid', async () => {
  const { isAiJobType } = await import('../../lib/ai/job.js');
  assert.equal(isAiJobType('cycle_analyze'), true);
  assert.equal(isAiJobType('cycle_generate'), true);
  assert.equal(isAiJobType('cycle_unknown'), false);
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

function withMayarEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  return async () => {
    const lama: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(vars)) {
      lama[k] = process.env[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      await fn();
    } finally {
      for (const [k, v] of Object.entries(lama)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };
}

test(
  'webhook billing dibalas 503 bila API key Mayar belum diatur',
  withMayarEnv({ MAYAR_API_KEY: undefined, MAYAR_WEBHOOK_TOKEN: undefined }, async () => {
    const res = await request(app).post('/api/billing/webhook').send({});
    assert.equal(res.status, 503);
  }),
);

test(
  'webhook billing dibalas 503 bila token webhook belum diatur',
  withMayarEnv({ MAYAR_API_KEY: 'kunci-uji', MAYAR_WEBHOOK_TOKEN: undefined }, async () => {
    const res = await request(app).post('/api/billing/webhook').send({});
    assert.equal(res.status, 503);
  }),
);

test(
  'webhook billing dengan token salah dibalas 401',
  withMayarEnv({ MAYAR_API_KEY: 'kunci-uji', MAYAR_WEBHOOK_TOKEN: 'token-uji' }, async () => {
    const res = await request(app)
      .post('/api/billing/webhook')
      .set('X-Callback-Token', 'salah')
      .send({ event: 'payment.received', data: { id: 'x' } });
    assert.equal(res.status, 401);
  }),
);

test(
  'webhook billing tanpa token dibalas 401',
  withMayarEnv({ MAYAR_API_KEY: 'kunci-uji', MAYAR_WEBHOOK_TOKEN: 'token-uji' }, async () => {
    const res = await request(app).post('/api/billing/webhook').send({ event: 'payment.received', data: { id: 'x' } });
    assert.equal(res.status, 401);
  }),
);

test(
  'webhook billing dengan body tidak valid dibalas 400',
  withMayarEnv({ MAYAR_API_KEY: 'kunci-uji', MAYAR_WEBHOOK_TOKEN: 'token-uji' }, async () => {
    const res = await request(app).post('/api/billing/webhook').set('X-Callback-Token', 'token-uji').send({});
    assert.equal(res.status, 400);
  }),
);

test(
  'webhook billing mengabaikan event selain payment.received',
  withMayarEnv({ MAYAR_API_KEY: 'kunci-uji', MAYAR_WEBHOOK_TOKEN: 'token-uji' }, async () => {
    const res = await request(app)
      .post('/api/billing/webhook')
      .set('X-Callback-Token', ' token-uji ')
      .send({ event: 'payment.reminder', data: { id: 'x' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.ignored, true);
  }),
);

test('checkout dan sync billing menolak permintaan tanpa login', async () => {
  const checkout = await request(app).post('/api/billing/checkout').send({ plan: 'starter' });
  assert.equal(checkout.status, 401);
  const sync = await request(app).post('/api/billing/payments/abc/sync');
  assert.equal(sync.status, 401);
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
