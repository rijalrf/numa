import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARCHITECTURE_SKILL_NAME,
  BUNDLED_SKILLS,
  MARKER_BEGIN,
  MARKER_END,
  installSkillPack,
  skillRoots,
} from '../skill-pack.js';
import { isInternalFile } from '../guard.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const bundledSkillsDir = path.resolve(here, '../../skills');
const contract = { title: 'Express Layered', framework: 'Express', markdown: '# Kontrak\n- aturan 1\n' };

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'numa-skills-'));
}

// Rentang emoji umum; skill pack dilarang memuat emoji.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

test('setiap skill bundled ada, frontmatter name cocok, tanpa emoji dan tanpa backslash escape', () => {
  for (const skill of BUNDLED_SKILLS) {
    const file = path.join(bundledSkillsDir, skill.file);
    assert.ok(fs.existsSync(file), `berkas hilang: ${skill.file}`);
    const text = fs.readFileSync(file, 'utf-8');
    const fm = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(text);
    assert.ok(fm, `frontmatter tidak valid: ${skill.file}`);
    assert.equal(fm![1], skill.name, `name frontmatter tidak cocok: ${skill.file}`);
    assert.ok(fm![2].length > 20, `description terlalu pendek: ${skill.file}`);
    assert.ok(!EMOJI.test(text), `emoji ditemukan: ${skill.file}`);
    assert.ok(!text.includes('\\`'), `backtick ter-escape: ${skill.file}`);
  }
});

test('numa-workflow adalah skill pertama dan semua nama unik', () => {
  assert.equal(BUNDLED_SKILLS[0].name, 'numa-workflow');
  const names = BUNDLED_SKILLS.map((s) => s.name);
  assert.equal(new Set(names).size, names.length);
});

test('skillRoots mengikuti target', () => {
  assert.deepEqual(skillRoots('agents'), [path.join('.agents', 'skills')]);
  assert.deepEqual(skillRoots('claude'), [path.join('.claude', 'skills')]);
  assert.deepEqual(skillRoots('all'), [path.join('.agents', 'skills'), path.join('.claude', 'skills')]);
});

test('target all memasang skill di .agents dan .claude serta AGENTS.md dan CLAUDE.md', () => {
  const dir = tmp();
  try {
    const r = installSkillPack({ targetDir: dir, bundledSkillsDir, contract, target: 'all' });
    assert.deepEqual(r.missingSources, []);
    for (const root of ['.agents', '.claude']) {
      for (const name of [...BUNDLED_SKILLS.map((s) => s.name), ARCHITECTURE_SKILL_NAME]) {
        assert.ok(fs.existsSync(path.join(dir, root, 'skills', name, 'SKILL.md')), `${root}/${name}`);
      }
    }
    const arch = fs.readFileSync(path.join(dir, '.agents', 'skills', ARCHITECTURE_SKILL_NAME, 'SKILL.md'), 'utf-8');
    assert.match(arch, /Kontrak arsitektur wajib untuk framework Express/);
    const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf-8');
    assert.ok(agents.includes(MARKER_BEGIN) && agents.includes(MARKER_END));
    assert.ok(agents.includes('.agents/skills/numa-workflow/SKILL.md'));
    assert.equal(r.agentsMd, 'dibuat');
    assert.equal(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf-8'), '@AGENTS.md\n');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('target agents tidak menyentuh .claude maupun CLAUDE.md', () => {
  const dir = tmp();
  try {
    const r = installSkillPack({ targetDir: dir, bundledSkillsDir, contract, target: 'agents' });
    assert.equal(r.claudeMd, 'dilewati');
    assert.ok(!fs.existsSync(path.join(dir, '.claude')));
    assert.ok(!fs.existsSync(path.join(dir, 'CLAUDE.md')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('AGENTS.md dan CLAUDE.md milik user dipertahankan; blok Numa ditambah sekali dan diperbarui hanya dengan force', () => {
  const dir = tmp();
  try {
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Aturan tim\n\nJangan hapus ini.\n');
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Catatan Claude\n');

    const first = installSkillPack({ targetDir: dir, bundledSkillsDir, contract, target: 'all' });
    assert.equal(first.agentsMd, 'ditambah');
    assert.equal(first.claudeMd, 'ditambah');

    const second = installSkillPack({ targetDir: dir, bundledSkillsDir, contract, target: 'all' });
    assert.equal(second.agentsMd, 'dibiarkan');
    assert.equal(second.claudeMd, 'dibiarkan');

    const forced = installSkillPack({
      targetDir: dir,
      bundledSkillsDir,
      contract: { ...contract, title: 'Judul Baru' },
      target: 'all',
      force: true,
    });
    assert.equal(forced.agentsMd, 'diperbarui');

    const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf-8');
    assert.ok(agents.includes('Jangan hapus ini.'));
    assert.ok(agents.includes('Judul Baru'));
    assert.equal(agents.split(MARKER_BEGIN).length - 1, 1);
    const claude = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf-8');
    assert.ok(claude.includes('# Catatan Claude'));
    assert.equal(claude.split('@AGENTS.md').length - 1, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('sumber skill yang hilang dilaporkan, bukan diabaikan diam-diam', () => {
  const dir = tmp();
  const emptySrc = tmp();
  try {
    const r = installSkillPack({ targetDir: dir, bundledSkillsDir: emptySrc, contract, target: 'agents' });
    assert.equal(r.missingSources.length, BUNDLED_SKILLS.length);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(emptySrc, { recursive: true, force: true });
  }
});

test('guard menganggap state Numa dan skill numa-* sebagai berkas internal', () => {
  assert.equal(isInternalFile('.numa/state.json'), true);
  assert.equal(isInternalFile('.agents/skills/numa-workflow/SKILL.md'), true);
  assert.equal(isInternalFile('.claude/skills/numa-architecture/SKILL.md'), true);
  assert.equal(isInternalFile('.agents/skills/refira/SKILL.md'), false);
  assert.equal(isInternalFile('src/index.ts'), false);
});
