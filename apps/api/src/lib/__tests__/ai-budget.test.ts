import test from 'node:test';
import assert from 'node:assert/strict';
import { AiBudgetExceededError, isOverBudget, monthStart } from '../ai-budget.js';
import { tokenBudget } from '../billing.js';

test('monthStart mengembalikan tanggal 1 pukul 00:00 UTC', () => {
  const d = monthStart(new Date('2026-10-17T13:45:00Z'));
  assert.equal(d.toISOString(), '2026-10-01T00:00:00.000Z');
});

test('isOverBudget: batas 0 berarti tanpa batas', () => {
  assert.equal(isOverBudget(9_999_999, 0), false);
  assert.equal(isOverBudget(99, 100), false);
  assert.equal(isOverBudget(100, 100), true);
  assert.equal(isOverBudget(101, 100), true);
});

test('AiBudgetExceededError membawa nama dan angka pemakaian', () => {
  const err = new AiBudgetExceededError(300, 200);
  assert.equal(err.name, 'AiBudgetExceededError');
  assert.equal(err.used, 300);
  assert.equal(err.limit, 200);
});

test('tokenBudget memakai override env, fallback bila tidak valid', () => {
  const key = 'AI_TOKEN_BUDGET_FREE';
  const prev = process.env[key];
  try {
    delete process.env[key];
    assert.equal(tokenBudget('FREE', 123), 123);
    process.env[key] = '999';
    assert.equal(tokenBudget('FREE', 123), 999);
    process.env[key] = '0';
    assert.equal(tokenBudget('FREE', 123), 0);
    process.env[key] = 'abc';
    assert.equal(tokenBudget('FREE', 123), 123);
    process.env[key] = '-5';
    assert.equal(tokenBudget('FREE', 123), 123);
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
});
