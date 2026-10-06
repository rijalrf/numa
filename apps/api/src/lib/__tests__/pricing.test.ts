import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateCost, getAiPricing, normalizeTier, percentile } from '../pricing.js';
import { isPlatformAdmin } from '../platform-admin.js';

const env = {
  AI_PRICE_INPUT_PER_MTOK_REASONING: '50000',
  AI_PRICE_OUTPUT_PER_MTOK_REASONING: '200000',
} as NodeJS.ProcessEnv;

test('getAiPricing: tier tanpa pasangan harga lengkap bernilai null', () => {
  const p = getAiPricing(env);
  assert.deepEqual(p.reasoning, { inputPerMTok: 50000, outputPerMTok: 200000 });
  assert.equal(p.cheap, null);
});

test('estimateCost menghitung rupiah dari token input dan output', () => {
  const p = getAiPricing(env);
  const cost = estimateCost([{ tier: 'reasoning', inputTokens: 1_000_000, outputTokens: 500_000 }], p);
  assert.equal(cost, 150000);
});

test('estimateCost null bila tier terpakai belum punya harga', () => {
  const p = getAiPricing(env);
  assert.equal(estimateCost([{ tier: 'cheap', inputTokens: 10, outputTokens: 10 }], p), null);
});

test('estimateCost mengabaikan usage kosong pada tier tanpa harga', () => {
  const p = getAiPricing(env);
  assert.equal(estimateCost([{ tier: 'cheap', inputTokens: 0, outputTokens: 0 }], p), 0);
});

test('normalizeTier: log lama tanpa tier dianggap reasoning', () => {
  assert.equal(normalizeTier(null), 'reasoning');
  assert.equal(normalizeTier('cheap'), 'cheap');
});

test('percentile', () => {
  assert.equal(percentile([], 0.5), 0);
  assert.equal(percentile([10, 20, 30, 40], 0.5), 25);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9);
});

test('isPlatformAdmin tidak peka huruf besar dan menolak kosong', () => {
  assert.equal(isPlatformAdmin('Admin@Contoh.com', 'admin@contoh.com, lain@contoh.com'), true);
  assert.equal(isPlatformAdmin('x@contoh.com', 'admin@contoh.com'), false);
  assert.equal(isPlatformAdmin('x@contoh.com', ''), false);
  assert.equal(isPlatformAdmin(undefined, 'admin@contoh.com'), false);
});
