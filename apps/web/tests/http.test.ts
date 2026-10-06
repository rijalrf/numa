import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from '../src/lib/http';

type FetchFn = typeof globalThis.fetch;
const g = globalThis as unknown as { fetch: FetchFn; window?: unknown };
const originalFetch = g.fetch;
let assigned: string[] = [];

function mockFetch(status: number, body: string, contentType = 'application/json') {
  g.fetch = (async () => new Response(body, { status, headers: { 'content-type': contentType } })) as FetchFn;
}

function mockWindow(pathname: string) {
  assigned = [];
  g.window = { location: { pathname, assign: (url: string) => assigned.push(url) } };
}

beforeEach(() => {
  assigned = [];
});

afterEach(() => {
  g.fetch = originalFetch;
  delete g.window;
});

test('api mengembalikan body JSON bila sukses', async () => {
  mockFetch(200, JSON.stringify({ ok: true }));
  assert.deepEqual(await api('/api/x'), { ok: true });
});

test('api melempar ApiError dengan pesan dari server', async () => {
  mockFetch(403, JSON.stringify({ error: 'Dilarang' }));
  await assert.rejects(api('/api/x'), (err: unknown) => err instanceof ApiError && err.status === 403 && err.message === 'Dilarang');
});

test('api menolak balasan HTML dengan pesan yang jelas', async () => {
  mockFetch(502, '<html>Bad Gateway</html>', 'text/html');
  await assert.rejects(api('/api/x'), (err: unknown) => err instanceof ApiError && err.message.includes('HTML'));
});

test('api melempar ApiError bila JSON rusak', async () => {
  mockFetch(200, '{rusak');
  await assert.rejects(api('/api/x'), (err: unknown) => err instanceof ApiError && err.message.includes('JSON'));
});

test('401 di halaman privat mengarahkan ke /login sekali saja', async () => {
  mockWindow('/projects/1/prd');
  mockFetch(401, JSON.stringify({ error: 'Tidak terautentikasi' }));
  await assert.rejects(api('/api/projects'));
  await assert.rejects(api('/api/projects'));
  assert.deepEqual(assigned, ['/login']);
});
