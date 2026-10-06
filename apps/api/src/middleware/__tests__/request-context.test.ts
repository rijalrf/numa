import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRequestId } from '../request-context.js';
import { formatLog } from '../../lib/logger.js';

test('resolveRequestId memakai id aman dari proxy', () => {
  assert.equal(resolveRequestId('abc12345-def'), 'abc12345-def');
});

test('resolveRequestId menolak id berbahaya atau terlalu pendek dan membuat UUID baru', () => {
  for (const bad of ['short', 'has space in it!!', 'x'.repeat(65), 'a\nb\nc\nd\ne\nf', undefined, 42]) {
    const id = resolveRequestId(bad);
    assert.match(id, /^[0-9a-f-]{36}$/);
  }
});

test('formatLog menghasilkan JSON valid pada mode json', () => {
  const prev = process.env.LOG_FORMAT;
  process.env.LOG_FORMAT = 'json';
  try {
    const line = formatLog('info', 'halo', { requestId: 'r1' }, new Date('2026-10-05T00:00:00Z'));
    assert.deepEqual(JSON.parse(line), { time: '2026-10-05T00:00:00.000Z', level: 'info', msg: 'halo', requestId: 'r1' });
  } finally {
    if (prev === undefined) delete process.env.LOG_FORMAT;
    else process.env.LOG_FORMAT = prev;
  }
});
