import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retryBackoffMs, isHeartbeatStale, toClientStatus, isAiJobType, STALE_HEARTBEAT_MS } from '../job';

test('retryBackoffMs naik tiga kali lipat dan dibatasi 2 menit', () => {
  assert.equal(retryBackoffMs(1), 5_000);
  assert.equal(retryBackoffMs(2), 15_000);
  assert.equal(retryBackoffMs(3), 45_000);
  assert.equal(retryBackoffMs(10), 120_000);
});

test('isHeartbeatStale memakai ambang STALE_HEARTBEAT_MS', () => {
  const now = Date.now();
  assert.equal(isHeartbeatStale(new Date(now - STALE_HEARTBEAT_MS + 1000), now), false);
  assert.equal(isHeartbeatStale(new Date(now - STALE_HEARTBEAT_MS - 1000), now), true);
});

test('toClientStatus memetakan queued dan running menjadi generating', () => {
  assert.equal(toClientStatus('queued'), 'generating');
  assert.equal(toClientStatus('running'), 'generating');
  assert.equal(toClientStatus('done'), 'done');
  assert.equal(toClientStatus('cancelled'), 'cancelled');
  assert.equal(toClientStatus(undefined), 'idle');
});

test('isAiJobType menolak tipe tak dikenal', () => {
  assert.equal(isAiJobType('tasks_generate'), true);
  assert.equal(isAiJobType('rm_rf'), false);
});
