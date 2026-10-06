import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authenticateToken, hashToken } from '../agent-auth.js';

function dbWith(record: unknown) {
  return { agentToken: { findUnique: async () => record, update: async () => ({}) } } as any;
}

test('hashToken menghasilkan sha256 heksadesimal yang stabil', () => {
  assert.equal(hashToken('numa_abc'), hashToken('numa_abc'));
  assert.match(hashToken('numa_abc'), /^[0-9a-f]{64}$/);
});

test('authenticateToken menolak header kosong dan format token salah tanpa menyentuh DB', async () => {
  assert.ok((await authenticateToken(undefined)).failure);
  assert.ok((await authenticateToken('Bearer sk-bukan-numa')).failure);
});

test('authenticateToken menolak token yang tidak dikenal, dicabut, atau kedaluwarsa', async () => {
  assert.equal((await authenticateToken('Bearer numa_x', dbWith(null))).failure?.status, 401);

  assert.match((await authenticateToken('Bearer numa_x', dbWith({ id: 't', isRevoked: true, expiresAt: null, agentTokenScopes: [], userId: 'u' }))).failure?.error ?? '', /dicabut/);

  assert.match((await authenticateToken('Bearer numa_x', dbWith({ id: 't', isRevoked: false, expiresAt: new Date(Date.now() - 1000), agentTokenScopes: [], userId: 'u' }))).failure?.error ?? '', /kedaluwarsa/);
});

test('authenticateToken menerima token valid dan mengembalikan recordnya', async () => {
  const res = await authenticateToken('Bearer numa_x', dbWith({ id: 't', isRevoked: false, expiresAt: new Date(Date.now() + 60_000), agentTokenScopes: [], userId: 'u' }));
  assert.equal(res.failure, undefined);
  assert.equal(res.record?.id, 't');
});
