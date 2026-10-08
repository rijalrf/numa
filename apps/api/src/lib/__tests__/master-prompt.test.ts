import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMasterPrompt, DEFAULT_EXECUTION_MODE, isExecutionMode, type MasterPromptInput } from '../master-prompt.js';

const base: MasterPromptInput = {
  projectName: 'WarungPOS',
  projectId: 'cmuproj123',
  idea: 'Aplikasi kasir warung',
  hasPrd: true,
  architectureMarkdown: '### Kontrak Arsitektur Uji\n- apps/api/src/**',
  apiUrl: 'https://numa.example.com',
  previewPort: 9999,
  mode: 'confirm',
};

test('mode default adalah dengan konfirmasi per layer', () => {
  assert.equal(DEFAULT_EXECUTION_MODE, 'confirm');
  assert.equal(isExecutionMode('confirm'), true);
  assert.equal(isExecutionMode('auto'), true);
  assert.equal(isExecutionMode('manual'), false);
  assert.equal(isExecutionMode(undefined), false);
});

test('teks berbeda sesuai mode', () => {
  const confirm = buildMasterPrompt({ ...base, mode: 'confirm' });
  const auto = buildMasterPrompt({ ...base, mode: 'auto' });
  assert.match(confirm, /DENGAN KONFIRMASI PER LAYER/);
  assert.match(confirm, /minta konfirmasi user/);
  assert.doesNotMatch(confirm, /OTOMATIS PENUH/);
  assert.match(auto, /OTOMATIS PENUH/);
  assert.match(auto, /JANGAN meminta konfirmasi/);
  assert.doesNotMatch(auto, /DENGAN KONFIRMASI PER LAYER/);
  assert.notEqual(confirm, auto);
});

test('memuat skill pack, kontrak arsitektur, checklist kualitas, dan larangan --force', () => {
  const p = buildMasterPrompt(base);
  assert.match(p, /numa init/);
  assert.match(p, /Kontrak Arsitektur Uji/);
  assert.match(p, /Checklist Kualitas/);
  assert.match(p, /Dilarang `numa done --force`/);
  assert.match(p, /numa block --reason/);
  assert.match(p, /numa sync/);
});

test('login lewat browser: tanpa perintah numa login, tanpa token, tanpa checkpoint', () => {
  for (const mode of ['confirm', 'auto'] as const) {
    const p = buildMasterPrompt({ ...base, mode });
    assert.match(p, /numa --api-url https:\/\/numa\.example\.com switch cmuproj123/);
    assert.match(p, /menampilkan alamat dan kode persetujuan/);
    assert.match(p, /Dilarang meminta, menyalin, atau menampilkan token/);
    assert.doesNotMatch(p, /numa login/);
    assert.doesNotMatch(p, /checkpoint/i);
    assert.doesNotMatch(p, /numa_[a-f0-9]{20,}/);
  }
});

test('PRD belum ada dilaporkan di identitas project', () => {
  assert.match(buildMasterPrompt({ ...base, hasPrd: false }), /PRD: BELUM dibuat/);
  assert.match(buildMasterPrompt(base), /numa prd/);
});
