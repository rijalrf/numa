import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCommand, splitCommand } from '../command-policy.js';

test('perintah umum build/test diizinkan', () => {
  for (const cmd of ['npm test', 'npx tsc --noEmit', 'pnpm run build', 'NODE_ENV=test npm run test:unit', 'pytest -q', 'cd apps/api && npm test']) {
    assert.equal(checkCommand(cmd).kind, 'allowed', cmd);
  }
});

test('&& dipecah per segmen dan tiap segmen dicek', () => {
  const r = splitCommand('npm run build && npm test');
  assert.deepEqual(r.ok && r.segments, ['npm run build', 'npm test']);
  const v = checkCommand('npm run build && curl http://x.test');
  assert.equal(v.kind, 'needs-confirmation');
  assert.deepEqual(v.kind === 'needs-confirmation' && v.unlisted, ['curl']);
});

test('metakarakter berbahaya ditolak', () => {
  for (const cmd of [
    'npm test | tee out.log',
    'npm test; rm -rf /',
    'npm test `whoami`',
    'npm test $(whoami)',
    'npm test > /etc/passwd',
    'npm test &',
    'npm test || true',
    'npm test\nrm -rf /',
  ]) {
    assert.equal(checkCommand(cmd).kind, 'rejected', cmd);
  }
});

test('metakarakter di dalam kutip tunggal dianggap literal', () => {
  assert.equal(checkCommand("npm test -- -t 'a|b;c'").kind, 'allowed');
  // di kutip ganda, substitusi tetap berbahaya
  assert.equal(checkCommand('npm test -- -t "$(whoami)"').kind, 'rejected');
});

test('program terlarang selalu ditolak', () => {
  assert.equal(checkCommand('sudo npm test').kind, 'rejected');
  assert.equal(checkCommand('npm test && ssh host').kind, 'rejected');
});

test('cd hanya ke path relatif di dalam workspace', () => {
  assert.equal(checkCommand('cd ../other && npm test').kind, 'rejected');
  assert.equal(checkCommand('cd /etc && npm test').kind, 'rejected');
  assert.equal(checkCommand('cd apps/web && npm test').kind, 'allowed');
});

test('perintah kosong dan segmen kosong ditolak', () => {
  assert.equal(checkCommand('   ').kind, 'rejected');
  assert.equal(checkCommand('npm test &&').kind, 'rejected');
});

test('program di luar allowlist butuh konfirmasi', () => {
  assert.equal(checkCommand('./scripts/verify.sh').kind, 'needs-confirmation');
});
