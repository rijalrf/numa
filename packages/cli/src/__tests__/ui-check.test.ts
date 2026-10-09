import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkUiStyles, isUiCheckTarget, scanContent, type UiCheckConfig } from '../ui-check.js';
import { runGuard, GuardError } from '../guard.js';

const config: UiCheckConfig = {
  extensions: ['.tsx'],
  roots: ['src/app', 'src/components'],
  exempt: ['src/components/ui/**', '**/*.css'],
};

test('kelas palet bawaan Tailwind ditolak, token desain diizinkan', () => {
  const bad = scanContent('src/app/page.tsx', '<p className="text-slate-900 hover:bg-sky-500/80">x</p>');
  assert.deepEqual(bad.map((v) => v.match), ['text-slate-900', 'bg-sky-500']);
  assert.ok(bad.every((v) => v.rule === 'palet-bawaan'));
  assert.equal(scanContent('src/app/page.tsx', '<p className="text-foreground bg-primary text-white bg-transparent">x</p>').length, 0);
});

test('warna arbitrer dan hex mentah ditolak; hex di nilai arbitrer tidak dihitung dua kali', () => {
  const v = scanContent('src/app/page.tsx', '<div className="bg-[#0ea5e9]" style={{ color: "#ff0000" }} />');
  assert.deepEqual(v.map((x) => x.rule).sort(), ['hex-mentah', 'warna-arbitrer']);
  assert.equal(v.find((x) => x.rule === 'hex-mentah')?.match, '#ff0000');
});

test('jangkar tautan dan entitas HTML bukan hex mentah', () => {
  assert.equal(scanContent('src/app/page.tsx', '<a href="#fff">x</a>').length, 0);
  assert.equal(scanContent('src/app/page.tsx', '<p>&#123;</p>').length, 0);
});

test('isUiCheckTarget: pustaka komponen, file token, ekstensi lain, dan folder di luar akar dikecualikan', () => {
  assert.equal(isUiCheckTarget('src/app/dashboard/page.tsx', config), true);
  assert.equal(isUiCheckTarget('src/components/ui/Button.tsx', config), false);
  assert.equal(isUiCheckTarget('src/app/globals.css', config), false);
  assert.equal(isUiCheckTarget('src/lib/format.ts', config), false);
  assert.equal(isUiCheckTarget('scripts/seed.tsx', config), false);
});

test('checkUiStyles hanya memeriksa file yang diberikan dan melewati file yang tidak terbaca', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'numa-ui-'));
  try {
    fs.mkdirSync(path.join(dir, 'src/app'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src/components/ui'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/app/page.tsx'), 'const a = "bg-rose-500";\nconst b = "bg-primary";\n');
    fs.writeFileSync(path.join(dir, 'src/app/lama.tsx'), 'const a = "bg-rose-500";\n');
    fs.writeFileSync(path.join(dir, 'src/components/ui/Button.tsx'), 'const a = "bg-rose-500";\n');
    const v = checkUiStyles(['src/app/page.tsx', 'src/components/ui/Button.tsx', 'src/app/hilang.tsx'], dir, config);
    assert.equal(v.length, 1);
    assert.equal(v[0].file, 'src/app/page.tsx');
    assert.equal(v[0].line, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('guard: task FRONTEND dengan warna mentah gagal STYLE_VIOLATION; tanpa uiCheck atau layer lain dilewati', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'numa-guard-'));
  try {
    spawnSync('git', ['init', '-q'], { cwd: dir });
    fs.mkdirSync(path.join(dir, 'src/app'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/app/page.tsx'), 'const a = "text-slate-900";\n');
    const spec = { layer: 'FRONTEND', files_to_create: ['src/app/page.tsx'], uiCheck: config };

    await assert.rejects(
      () => runGuard(spec, dir, 'T1'),
      (e: unknown) => e instanceof GuardError && e.failureContext?.failure_type === 'STYLE_VIOLATION' && /text-slate-900/.test(e.message),
    );
    await runGuard({ ...spec, uiCheck: null }, dir, 'T1');
    await runGuard({ ...spec, layer: 'BACKEND' }, dir, 'T1');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('.numa/.gitignore memuat screenshots/ dan mempertahankan entri yang sudah ada', async () => {
  const { ensureNumaGitignore } = await import('../numa-gitignore.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'numa-ign-'));
  try {
    fs.writeFileSync(path.join(dir, '.gitignore'), 'state.json\ncatatan-user\n');
    ensureNumaGitignore(dir);
    ensureNumaGitignore(dir);
    const lines = fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8').split('\n').filter(Boolean);
    assert.deepEqual(lines, ['state.json', 'catatan-user', 'failure-context.json', 'screenshots/']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
