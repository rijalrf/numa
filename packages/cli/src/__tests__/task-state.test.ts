import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { captureTaskState, changedSinceStart } from '../task-state.js';
import { matchesGlob } from '../guard.js';

function sh(cwd: string, ...args: string[]) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  assert.equal(r.status, 0, r.stderr);
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'numa-cli-'));
  sh(dir, 'init', '-q');
  sh(dir, 'config', 'user.email', 't@t.test');
  sh(dir, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  sh(dir, 'add', '-A');
  sh(dir, 'commit', '-q', '-m', 'init');
  return dir;
}

test('perubahan sebelum start tidak dihitung, perubahan sesudahnya dihitung', () => {
  const dir = makeRepo();
  try {
    fs.writeFileSync(path.join(dir, 'dirty-before.txt'), 'x\n');
    const state = captureTaskState('t1', dir);
    assert.ok(state.baselineSha);

    fs.writeFileSync(path.join(dir, 'new.txt'), 'n\n');
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'deep.ts'), 'd\n');
    const changed = changedSinceStart(dir, state).sort();
    assert.deepEqual(changed, ['new.txt', 'src/deep.ts']);

    // file yang sudah kotor sebelum start dihitung lagi bila isinya berubah
    fs.writeFileSync(path.join(dir, 'dirty-before.txt'), 'y\n');
    assert.ok(changedSinceStart(dir, state).includes('dirty-before.txt'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('commit setelah baseline tetap terdeteksi', () => {
  const dir = makeRepo();
  try {
    const state = captureTaskState('t2', dir);
    fs.writeFileSync(path.join(dir, 'b.txt'), 'b\n');
    sh(dir, 'add', '-A');
    sh(dir, 'commit', '-q', '-m', 'agent commit');
    assert.deepEqual(changedSinceStart(dir, state), ['b.txt']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('matchesGlob mencakup dir/** dan *.ext', () => {
  assert.ok(matchesGlob('apps/api/**', 'apps/api/src/index.ts'));
  assert.ok(matchesGlob('*.env', 'prod.env'));
  assert.ok(!matchesGlob('apps/web/**', 'apps/api/src/index.ts'));
});
