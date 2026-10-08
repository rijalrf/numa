import test from 'node:test';
import assert from 'node:assert/strict';
import { UsageAccumulator, estimateTokens } from '../usage.js';

test('UsageAccumulator menjumlahkan usage dari beberapa percobaan', () => {
  const acc = new UsageAccumulator();
  acc.add({ prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 });
  acc.add({ prompt_tokens: 120, completion_tokens: 60 });
  assert.deepEqual(acc.snapshot(), { inputTokens: 220, outputTokens: 100, totalTokens: 320, reasoningTokens: 0 });
  assert.equal(acc.estimated, false);
});

test('UsageAccumulator mencatat reasoning_tokens dari completion_tokens_details', () => {
  const acc = new UsageAccumulator();
  acc.add({ prompt_tokens: 2009, completion_tokens: 171, total_tokens: 2180, completion_tokens_details: { reasoning_tokens: 160 } });
  acc.add({ prompt_tokens: 10, completion_tokens: 5 });
  assert.equal(acc.snapshot().reasoningTokens, 160);
});

test('UsageAccumulator mengabaikan usage kosong tanpa menandai taksiran', () => {
  const acc = new UsageAccumulator();
  acc.add(undefined);
  acc.add(null);
  assert.deepEqual(acc.snapshot(), { inputTokens: 0, outputTokens: 0, totalTokens: 0, reasoningTokens: 0 });
  assert.equal(acc.estimated, false);
});

test('addEstimate menandai hasil sebagai taksiran', () => {
  const acc = new UsageAccumulator();
  acc.addEstimate(400, 80);
  assert.deepEqual(acc.snapshot(), { inputTokens: 100, outputTokens: 20, totalTokens: 120, reasoningTokens: 0 });
  assert.equal(acc.estimated, true);
});

test('estimateTokens membulatkan ke atas dan tidak negatif', () => {
  assert.equal(estimateTokens(0), 0);
  assert.equal(estimateTokens(1), 1);
  assert.equal(estimateTokens(9), 3);
  assert.equal(estimateTokens(-5), 0);
});
