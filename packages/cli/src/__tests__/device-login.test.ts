import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

// HOME diarahkan ke folder sementara sebelum modul dimuat: config dan pending-login ditulis di sana.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'numa-cli-test-'));
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.NUMA_NO_BROWSER = '1';
process.env.NUMA_LOGIN_WAIT_SECONDS = '2';

type Script = { polls: Array<{ status: number; body: unknown }>; started: number };
let script: Script = { polls: [], started: 0 };
let server: http.Server;
let apiUrl = '';
let mod: typeof import('../device-login.js');
let cfgMod: typeof import('../config.js');

before(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (req.url === '/api/cli-auth/start') {
        script.started++;
        return send(201, {
          deviceCode: 'd'.repeat(64),
          userCode: 'ABCD-EF23',
          verificationUrlComplete: 'http://web.test/cli-login?code=ABCD-EF23',
          expiresIn: 600,
          interval: 1,
        });
      }
      if (req.url === '/api/cli-auth/poll') {
        const next = script.polls.shift() ?? { status: 202, body: { status: 'pending' } };
        return send(next.status, next.body);
      }
      send(404, {});
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  mod = await import('../device-login.js');
  cfgMod = await import('../config.js');
});

after(() => {
  server.close();
  fs.rmSync(home, { recursive: true, force: true });
});

test('persetujuan: token tersimpan di config dan permintaan tertunda dihapus', async () => {
  script = { started: 0, polls: [{ status: 202, body: { status: 'pending' } }, { status: 200, body: { status: 'approved', token: 'numa_abc123' } }] };
  const cfg = await mod.deviceLogin({ apiUrl });
  assert.equal(cfg.token, 'numa_abc123');
  assert.equal(cfgMod.loadGlobalConfig().token, 'numa_abc123');
  assert.equal(mod.loadPending(), null);
  cfgMod.clearConfig();
});

test('penolakan di browser: gagal dengan pesan jelas dan permintaan dihapus', async () => {
  script = { started: 0, polls: [{ status: 403, body: { status: 'denied' } }] };
  await assert.rejects(mod.deviceLogin({ apiUrl }), /ditolak/);
  assert.equal(mod.loadPending(), null);
  assert.equal(cfgMod.loadGlobalConfig().token, undefined);
});

test('kode kedaluwarsa (410): gagal dan permintaan dihapus', async () => {
  script = { started: 0, polls: [{ status: 410, body: { status: 'expired' } }] };
  await assert.rejects(mod.deviceLogin({ apiUrl }), /kedaluwarsa/);
  assert.equal(mod.loadPending(), null);
});

test('non-interaktif belum disetujui: LoginPendingError, lalu menjalankan ulang melanjutkan kode yang sama', async () => {
  script = { started: 0, polls: [] }; // selalu pending
  await assert.rejects(mod.deviceLogin({ apiUrl }), (e: Error) => e.name === 'LoginPendingError' && /ABCD-EF23/.test(e.message));
  assert.equal(script.started, 1);
  assert.equal(mod.loadPending()?.userCode, 'ABCD-EF23');

  // Dijalankan ulang setelah user menyetujui: tidak meminta kode baru.
  script.polls = [{ status: 200, body: { status: 'approved', token: 'numa_lanjut' } }];
  const cfg = await mod.deviceLogin({ apiUrl });
  assert.equal(script.started, 1);
  assert.equal(cfg.token, 'numa_lanjut');
  cfgMod.clearConfig();
});

test('isPendingUsable: server berbeda atau hampir kedaluwarsa tidak dipakai ulang', () => {
  const base = { apiUrl: 'http://a', deviceCode: 'x', userCode: 'U', verificationUrlComplete: 'u', interval: 3 };
  const now = Date.now();
  assert.equal(mod.isPendingUsable({ ...base, expiresAt: now + 60_000 }, 'http://a', now), true);
  assert.equal(mod.isPendingUsable({ ...base, expiresAt: now + 60_000 }, 'http://b', now), false);
  assert.equal(mod.isPendingUsable({ ...base, expiresAt: now + 1_000 }, 'http://a', now), false);
  assert.equal(mod.isPendingUsable(null, 'http://a', now), false);
});
