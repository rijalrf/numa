import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MayarError,
  WebhookBodySchema,
  classifyMayarStatus,
  createPaymentRequest,
  getMayarConfig,
  getTransaction,
  verifyWebhookToken,
  webhookCandidateIds,
  webhookEventName,
} from '../mayar.js';

const config = { apiKey: 'kunci-uji', baseUrl: 'https://mayar.test/hl/v2', webhookToken: 'token-uji' };

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const asli = globalThis.fetch;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = asli) };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

test('getMayarConfig null bila API key kosong, memilih base URL sesuai mode', () => {
  assert.equal(getMayarConfig({} as NodeJS.ProcessEnv), null);
  assert.equal(getMayarConfig({ MAYAR_API_KEY: '  ' } as NodeJS.ProcessEnv), null);
  const sandbox = getMayarConfig({ MAYAR_API_KEY: 'k' } as NodeJS.ProcessEnv);
  assert.equal(sandbox?.baseUrl, 'https://api.mayar.io/hl/v2');
  const prod = getMayarConfig({ MAYAR_API_KEY: 'k', MAYAR_IS_PRODUCTION: 'true', MAYAR_WEBHOOK_TOKEN: ' t \n' } as NodeJS.ProcessEnv);
  assert.equal(prod?.baseUrl, 'https://api.mayar.id/hl/v2');
  assert.equal(prod?.webhookToken, 't');
});

test('classifyMayarStatus memetakan status transaksi', () => {
  assert.equal(classifyMayarStatus('paid'), 'success');
  assert.equal(classifyMayarStatus('PAID'), 'success');
  assert.equal(classifyMayarStatus('unpaid'), 'pending');
  assert.equal(classifyMayarStatus('closed'), 'expired');
  assert.equal(classifyMayarStatus('created'), 'pending');
});

test('verifyWebhookToken menerima token benar, mengabaikan spasi tepi', () => {
  assert.equal(verifyWebhookToken('token-uji', 'token-uji'), true);
  assert.equal(verifyWebhookToken(' token-uji\n', 'token-uji'), true);
});

test('verifyWebhookToken menolak token salah, kosong, atau tidak ada', () => {
  assert.equal(verifyWebhookToken('salah', 'token-uji'), false);
  assert.equal(verifyWebhookToken('', 'token-uji'), false);
  assert.equal(verifyWebhookToken(undefined, 'token-uji'), false);
  assert.equal(verifyWebhookToken('apa-saja', ''), false);
});

test('WebhookBodySchema menerima payload dan mengekstrak event serta id', () => {
  const body = WebhookBodySchema.parse({
    event: 'payment.received',
    data: { id: 'a', transactionId: 'b', status: 'SUCCESS', amount: 49000 },
  });
  assert.equal(webhookEventName(body), 'payment.received');
  assert.deepEqual(webhookCandidateIds(body), ['b', 'a']);
});

test('WebhookBodySchema mengenali nama field event.received dan menolak body tanpa data', () => {
  const body = WebhookBodySchema.parse({ 'event.received': 'payment.received', data: { id: 'x' } });
  assert.equal(webhookEventName(body), 'payment.received');
  assert.equal(WebhookBodySchema.safeParse({}).success, false);
});

test('createPaymentRequest mengirim Bearer, body, dan mengurai respons', async () => {
  const m = mockFetch(() =>
    json({ statusCode: 200, messages: 'success', data: { id: 'p1', transactionId: 't1', link: 'https://x.myr.id/pl/abc' } }),
  );
  try {
    const res = await createPaymentRequest(config, {
      name: 'Langganan',
      amount: 49000,
      expiredAt: new Date('2026-10-07T00:00:00.000Z'),
      extraData: { paymentId: 'pay1' },
    });
    assert.deepEqual(res, { id: 'p1', transactionId: 't1', link: 'https://x.myr.id/pl/abc' });
    assert.equal(m.calls[0].url, 'https://mayar.test/hl/v2/payments/create');
    const headers = m.calls[0].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, 'Bearer kunci-uji');
    const sent = JSON.parse(String(m.calls[0].init.body));
    assert.equal(sent.expiredAt, '2026-10-07T00:00:00.000Z');
    assert.equal(sent.amount, 49000);
  } finally {
    m.restore();
  }
});

test('createPaymentRequest melempar MayarError tanpa membocorkan API key', async () => {
  const m = mockFetch(() => json({ statusCode: 400, messages: 'Validation Error' }, 400));
  try {
    await assert.rejects(
      createPaymentRequest(config, { name: 'x', amount: 1, expiredAt: new Date() }),
      (err: unknown) => err instanceof MayarError && err.status === 400 && !err.message.includes('kunci-uji'),
    );
  } finally {
    m.restore();
  }
});

test('mayarRequest menolak respons dengan bentuk tidak dikenali', async () => {
  const m = mockFetch(() => json({ statusCode: 200, messages: 'success', data: { id: 'p1' } }));
  try {
    await assert.rejects(createPaymentRequest(config, { name: 'x', amount: 1, expiredAt: new Date() }), MayarError);
  } finally {
    m.restore();
  }
});

test('getTransaction mengurai status dan nominal, id di-encode', async () => {
  const m = mockFetch(() => json({ statusCode: 200, messages: 'success', data: { id: 't 1', amount: 49000, status: 'paid', paymentMethod: 'QRIS' } }));
  try {
    const trx = await getTransaction(config, 't 1');
    assert.equal(trx.status, 'paid');
    assert.equal(trx.amount, 49000);
    assert.equal(m.calls[0].url, 'https://mayar.test/hl/v2/transactions/t%201');
  } finally {
    m.restore();
  }
});

test('kegagalan jaringan dibungkus MayarError status 0', async () => {
  const m = mockFetch(() => {
    throw new Error('ECONNRESET');
  });
  try {
    await assert.rejects(getTransaction(config, 't1'), (err: unknown) => err instanceof MayarError && err.status === 0);
  } finally {
    m.restore();
  }
});
