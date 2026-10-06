import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { pollAiJob } from '../src/lib/ai-job';

type FetchFn = typeof globalThis.fetch;
const g = globalThis as unknown as { fetch: FetchFn };
const originalFetch = g.fetch;

afterEach(() => {
  g.fetch = originalFetch;
});

function sequence(responses: Array<Record<string, unknown> | 'error'>) {
  let i = 0;
  g.fetch = (async () => {
    const r = responses[Math.min(i++, responses.length - 1)];
    if (r === 'error') throw new Error('jaringan putus');
    return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as FetchFn;
}

test('onDone dipanggil dengan result saat job selesai, dan polling berhenti', async () => {
  sequence([{ status: 'running' }, { status: 'done', result: { n: 1 } }]);
  const result = await new Promise((resolve) => {
    pollAiJob('p1', 'tasks_generate', { intervalMs: 5, onDone: resolve });
  });
  assert.deepEqual(result, { n: 1 });
});

test('onFailed menerima pesan error job', async () => {
  sequence([{ status: 'failed', error: 'AI gagal' }]);
  const msg = await new Promise((resolve) => {
    pollAiJob('p1', 'tree_generate', { intervalMs: 5, onFailed: resolve });
  });
  assert.equal(msg, 'AI gagal');
});

test('gangguan jaringan sementara tidak menghentikan polling', async () => {
  sequence(['error', { status: 'done', result: 'ok' }]);
  const result = await new Promise((resolve) => {
    pollAiJob('p1', 'tasks_generate', { intervalMs: 5, onDone: resolve });
  });
  assert.equal(result, 'ok');
});

test('onTimeout dipanggil setelah maxAttempts terlampaui', async () => {
  sequence([{ status: 'running' }]);
  await new Promise<void>((resolve) => {
    pollAiJob('p1', 'tasks_generate', { intervalMs: 2, maxAttempts: 3, onTimeout: resolve });
  });
});

test('fungsi pembatal menghentikan polling', async () => {
  let calls = 0;
  g.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ status: 'running' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as FetchFn;
  const cancel = pollAiJob('p1', 'tasks_generate', { intervalMs: 5 });
  await new Promise((r) => setTimeout(r, 20));
  cancel();
  const sebelum = calls;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(calls, sebelum);
});
