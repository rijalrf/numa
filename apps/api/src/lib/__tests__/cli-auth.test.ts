// Login CLI lewat browser: bagian murni tanpa database dan alur lengkap terhadap database nyata
// (dilewati otomatis bila DB tidak terjangkau atau belum ada user).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateUserCode, normalizeUserCode, sanitizeClientName } from '../cli-auth.js';
import type { prisma as PrismaClient } from '../prisma.js';

test('userCode berformat XXXX-XXXX tanpa huruf/angka yang mudah tertukar', () => {
  for (let i = 0; i < 200; i++) {
    const code = generateUserCode();
    assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  }
});

test('normalizeUserCode menerima huruf kecil, spasi, dan tanpa tanda hubung', () => {
  assert.equal(normalizeUserCode('abcd-ef23'), 'ABCD-EF23');
  assert.equal(normalizeUserCode(' abcd ef23 '), 'ABCD-EF23');
  assert.equal(normalizeUserCode('ABCDEF23'), 'ABCD-EF23');
});

test('sanitizeClientName membuang karakter berbahaya dan membatasi panjang', () => {
  assert.equal(sanitizeClientName('laptop-rijal.local'), 'laptop-rijal.local');
  assert.equal(sanitizeClientName('<script>alert(1)</script>'), 'scriptalert1script');
  assert.equal(sanitizeClientName('   '), 'CLI');
  assert.equal(sanitizeClientName(undefined), 'CLI');
  assert.equal(sanitizeClientName('x'.repeat(200)).length, 60);
});

let prisma: typeof PrismaClient;
let ready = false;
let userId = '';
let lib: typeof import('../cli-auth.js');
let authenticateToken: typeof import('../agent-auth.js').authenticateToken;
const createdTokenIds: string[] = [];

before(async () => {
  try {
    ({ prisma } = await import('../prisma.js'));
    lib = await import('../cli-auth.js');
    ({ authenticateToken } = await import('../agent-auth.js'));
    const user = await prisma.user.findFirst({ select: { id: true } });
    if (!user) return;
    userId = user.id;
    ready = true;
  } catch (err) {
    ready = false;
    console.warn('Tes login CLI dilewati:', (err as Error).message.split('\n').pop());
  }
});

after(async () => {
  if (ready) {
    await prisma.cliAuthRequest.deleteMany({ where: { clientName: { startsWith: 'tes-' } } }).catch(() => undefined);
    await prisma.agentToken.deleteMany({ where: { id: { in: createdTokenIds } } }).catch(() => undefined);
  }
  await prisma?.$disconnect().catch(() => undefined);
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('alur lengkap: pending, persetujuan, token semua project terbit sekali dan berfungsi', async (t) => {
  if (!ready) return t.skip('database tidak terjangkau atau tidak ada user');
  const started = await lib.startCliAuth('tes-laptop');
  assert.match(started.userCode, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);

  assert.deepEqual(await lib.pollCliAuth(started.deviceCode), { state: 'pending' });
  assert.deepEqual(await lib.pollCliAuth(started.deviceCode), { state: 'slow_down' }); // terlalu rapat

  const info = await lib.describeCliAuth(started.userCode.toLowerCase());
  assert.equal(info?.clientName, 'tes-laptop');
  assert.equal(info?.status, 'pending');

  assert.ok(await lib.resolveCliAuth(started.userCode, userId, 'approved'));
  assert.equal(await lib.resolveCliAuth(started.userCode, userId, 'approved'), null); // sudah diproses

  const approved = await lib.pollCliAuth(started.deviceCode);
  assert.equal(approved.state, 'approved');
  if (approved.state !== 'approved') return;
  createdTokenIds.push(approved.tokenId);
  assert.match(approved.token, /^numa_[a-f0-9]{48}$/);

  // Token sah dan berlingkup semua project; pengambilan kedua tidak menghasilkan token baru.
  const auth = await authenticateToken(`Bearer ${approved.token}`);
  assert.equal(auth.record?.userId, userId);
  assert.equal(auth.record?.allProjects, true);
  assert.deepEqual(await lib.pollCliAuth(started.deviceCode), { state: 'expired' });
});

test('polling bersamaan setelah persetujuan hanya menghasilkan satu token', async (t) => {
  if (!ready) return t.skip('database tidak terjangkau atau tidak ada user');
  const started = await lib.startCliAuth('tes-paralel');
  await lib.resolveCliAuth(started.userCode, userId, 'approved');
  const results = await Promise.all(Array.from({ length: 5 }, () => lib.pollCliAuth(started.deviceCode)));
  const approved = results.filter((r) => r.state === 'approved');
  assert.equal(approved.length, 1);
  for (const r of approved) if (r.state === 'approved') createdTokenIds.push(r.tokenId);
  assert.equal(results.filter((r) => r.state === 'expired').length, 4);
});

test('penolakan: CLI menerima denied dan tidak ada token', async (t) => {
  if (!ready) return t.skip('database tidak terjangkau atau tidak ada user');
  const started = await lib.startCliAuth('tes-tolak');
  assert.ok(await lib.resolveCliAuth(started.userCode, userId, 'denied'));
  assert.deepEqual(await lib.pollCliAuth(started.deviceCode), { state: 'denied' });
});

test('kedaluwarsa dan kode tak dikenal: tidak bisa disetujui maupun dipoll', async (t) => {
  if (!ready) return t.skip('database tidak terjangkau atau tidak ada user');
  const started = await lib.startCliAuth('tes-kedaluwarsa');
  await prisma.cliAuthRequest.update({ where: { userCode: started.userCode }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal(await lib.resolveCliAuth(started.userCode, userId, 'approved'), null);
  assert.deepEqual(await lib.pollCliAuth(started.deviceCode), { state: 'expired' });
  assert.deepEqual(await lib.pollCliAuth('x'.repeat(64)), { state: 'expired' });
  assert.equal(await lib.describeCliAuth('ZZZZ-ZZZZ'), null);
  await wait(10);
});
