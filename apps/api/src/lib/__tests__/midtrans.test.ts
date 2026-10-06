import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { WebhookBodySchema, amountMatches, classifyTransaction, verifySignature } from '../midtrans.js';

const KEY = 'kunci-uji-lokal';

function signed(overrides: Record<string, string> = {}) {
  const base = { order_id: 'NUMA-1-abc123', status_code: '200', gross_amount: '49000.00', transaction_status: 'settlement' };
  const body = { ...base, ...overrides };
  const signature_key = crypto
    .createHash('sha512')
    .update(`${body.order_id}${body.status_code}${body.gross_amount}${KEY}`)
    .digest('hex');
  return WebhookBodySchema.parse({ ...body, signature_key });
}

test('verifySignature menerima signature yang benar', () => {
  assert.equal(verifySignature(signed(), KEY), true);
});

test('verifySignature menolak signature palsu, salah panjang, dan server key lain', () => {
  const body = signed();
  assert.equal(verifySignature({ ...body, signature_key: 'abcd' }, KEY), false);
  assert.equal(verifySignature({ ...body, signature_key: 'z'.repeat(128) }, KEY), false);
  assert.equal(verifySignature(body, 'kunci-lain'), false);
  assert.equal(verifySignature({ ...body, gross_amount: '1.00' }, KEY), false);
});

test('WebhookBodySchema menolak body tanpa field wajib atau bertipe salah', () => {
  assert.equal(WebhookBodySchema.safeParse({}).success, false);
  assert.equal(WebhookBodySchema.safeParse({ ...signed(), gross_amount: 49000 }).success, false);
});

test('classifyTransaction memetakan status Midtrans', () => {
  assert.equal(classifyTransaction({ transaction_status: 'settlement' }), 'success');
  assert.equal(classifyTransaction({ transaction_status: 'capture', fraud_status: 'accept' }), 'success');
  assert.equal(classifyTransaction({ transaction_status: 'capture', fraud_status: 'challenge' }), 'pending');
  for (const s of ['deny', 'cancel', 'expire']) assert.equal(classifyTransaction({ transaction_status: s }), 'failed');
  assert.equal(classifyTransaction({ transaction_status: 'pending' }), 'pending');
});

test('amountMatches mencocokkan nominal desimal Midtrans dengan nominal tersimpan', () => {
  assert.equal(amountMatches('49000.00', 49000), true);
  assert.equal(amountMatches('49000', 49000), true);
  assert.equal(amountMatches('129000.00', 49000), false);
  assert.equal(amountMatches('49000.50', 49000), false);
  assert.equal(amountMatches('abc', 49000), false);
});
