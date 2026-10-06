import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminEmails, isPlatformAdmin } from '../platform-admin.js';
import { requirePlatformAdmin } from '../../middleware/require-platform-admin.js';

test('parseAdminEmails memisahkan koma, memangkas spasi, dan mengabaikan huruf besar', () => {
  const set = parseAdminEmails(' A@x.com, b@y.com ,,');
  assert.deepEqual([...set].sort(), ['a@x.com', 'b@y.com']);
  assert.equal(parseAdminEmails(undefined).size, 0);
});

test('isPlatformAdmin menolak email kosong dan email di luar daftar', () => {
  assert.equal(isPlatformAdmin(undefined, 'a@x.com'), false);
  assert.equal(isPlatformAdmin('c@z.com', 'a@x.com'), false);
  assert.equal(isPlatformAdmin('A@X.com', 'a@x.com'), true);
  assert.equal(isPlatformAdmin('a@x.com', ''), false);
});

test('requirePlatformAdmin membalas 404 untuk non-admin tanpa memanggil next', async () => {
  delete process.env.PLATFORM_ADMIN_EMAILS;
  let status = 0;
  let nextCalled = false;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json() {
      return this;
    },
  };
  await requirePlatformAdmin({ userEmail: 'x@y.com', originalUrl: '/api/admin/usage/summary' } as never, res as never, () => {
    nextCalled = true;
  });
  assert.equal(status, 404);
  assert.equal(nextCalled, false);
});
