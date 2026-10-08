// Skill pack Numa: daftar skill bundled dan pemasangannya ke workspace user.
// Lokasi pasang:
//   .agents/skills/<nama>/SKILL.md   sumber utama, netral terhadap agent (Codex, Cursor, dll.)
//   .claude/skills/<nama>/SKILL.md   salinan agar Claude Code ikut membacanya
//   AGENTS.md                        blok Numa (di-update lewat penanda numa:begin/numa:end)
//   CLAUDE.md                        hanya mengimpor AGENTS.md untuk Claude Code
import fs from 'node:fs';
import path from 'node:path';

export type SkillTarget = 'agents' | 'claude' | 'all';

export type BundledSkill = {
  /** Nama berkas di folder skills bundled. */
  file: string;
  /** Nama folder skill di workspace user (juga nama pada frontmatter). */
  name: string;
  /** Label singkat untuk daftar di AGENTS.md. */
  label: string;
};

/** Urutan di sini menjadi urutan tampil di AGENTS.md. numa-workflow wajib pertama. */
export const BUNDLED_SKILLS: BundledSkill[] = [
  { file: 'numa-workflow.md', name: 'numa-workflow', label: 'Alur Kerja Numa (loop CLI, mode eksekusi, guard)' },
  { file: 'incremental-implementation.md', name: 'numa-incremental', label: 'Implementasi Bertahap' },
  { file: 'test-driven-development.md', name: 'numa-tdd', label: 'Test-Driven Development' },
  { file: 'api-and-interface-design.md', name: 'numa-api-design', label: 'Desain API' },
  { file: 'security-and-hardening.md', name: 'numa-security', label: 'Pengerasan Keamanan' },
  { file: 'production-readiness.md', name: 'numa-production', label: 'Kesiapan Produksi' },
  { file: 'frontend-ui-engineering.md', name: 'numa-frontend', label: 'Desain Frontend dan Konsistensi UI/UX' },
];

export const ARCHITECTURE_SKILL_NAME = 'numa-architecture';

export const MARKER_BEGIN = '<!-- numa:begin -->';
export const MARKER_END = '<!-- numa:end -->';

/** Folder skill relatif terhadap root workspace untuk target yang dipilih. */
export function skillRoots(target: SkillTarget): string[] {
  const roots: string[] = [];
  if (target === 'agents' || target === 'all') roots.push(path.join('.agents', 'skills'));
  if (target === 'claude' || target === 'all') roots.push(path.join('.claude', 'skills'));
  return roots;
}

export function isSkillTarget(value: string): value is SkillTarget {
  return value === 'agents' || value === 'claude' || value === 'all';
}

export type ArchitectureContractInput = {
  title: string;
  framework: string;
  markdown: string;
};

export type InstallSkillPackOptions = {
  targetDir: string;
  bundledSkillsDir: string;
  contract: ArchitectureContractInput;
  target: SkillTarget;
  /** Timpa blok Numa di AGENTS.md walau sudah ada. */
  force?: boolean;
  log?: (msg: string) => void;
};

export type InstallSkillPackResult = {
  installedSkills: string[];
  missingSources: string[];
  roots: string[];
  agentsMd: 'dibuat' | 'ditambah' | 'diperbarui' | 'dibiarkan';
  claudeMd: 'dibuat' | 'ditambah' | 'dibiarkan' | 'dilewati';
};

function writeSkill(rootDir: string, name: string, content: string): void {
  const dir = path.join(rootDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), content, 'utf-8');
}

/** Teks blok Numa untuk AGENTS.md. Selalu menunjuk .agents/skills sebagai sumber utama. */
export function buildAgentsBlock(contractTitle: string): string {
  const lines = [
    MARKER_BEGIN,
    '# Pedoman Rekayasa dan Kontrak Arsitektur Numa',
    '',
    'Proyek ini dikerjakan lewat CLI `numa`. Baca skill berikut sebelum menulis kode:',
    `- Kontrak Arsitektur: .agents/skills/${ARCHITECTURE_SKILL_NAME}/SKILL.md (${contractTitle})`,
    ...BUNDLED_SKILLS.map((s) => `- ${s.label}: .agents/skills/${s.name}/SKILL.md`),
    '',
    'Aturan ringkas:',
    '- Mulai dari `numa next`, lalu `numa start`, `numa context`, kerjakan, `numa done`. Detail ada di skill numa-workflow.',
    '- Patuhi bounded context task: hanya sentuh file yang diizinkan dan jangan menyentuh file `forbidden`.',
    '- Jangan memakai `numa done --force` untuk melewati kegagalan. Gunakan `numa block --reason` bila task macet.',
    '- Jangan menulis secret, token, atau password di kode, log, atau prompt.',
    MARKER_END,
  ];
  return lines.join('\n');
}

function upsertAgentsMd(targetDir: string, block: string, force: boolean): InstallSkillPackResult['agentsMd'] {
  const agentsPath = path.join(targetDir, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) {
    fs.writeFileSync(agentsPath, `# AGENTS.md\n\n${block}\n`, 'utf-8');
    return 'dibuat';
  }
  const content = fs.readFileSync(agentsPath, 'utf-8');
  if (!content.includes(MARKER_BEGIN)) {
    fs.appendFileSync(agentsPath, `\n${block}\n`, 'utf-8');
    return 'ditambah';
  }
  if (!force) return 'dibiarkan';
  const start = content.indexOf(MARKER_BEGIN);
  const endIdx = content.indexOf(MARKER_END, start);
  if (endIdx === -1) {
    fs.appendFileSync(agentsPath, `\n${block}\n`, 'utf-8');
    return 'ditambah';
  }
  const updated = content.slice(0, start) + block + content.slice(endIdx + MARKER_END.length);
  fs.writeFileSync(agentsPath, updated, 'utf-8');
  return 'diperbarui';
}

function ensureClaudeMd(targetDir: string): InstallSkillPackResult['claudeMd'] {
  const claudePath = path.join(targetDir, 'CLAUDE.md');
  if (!fs.existsSync(claudePath)) {
    fs.writeFileSync(claudePath, '@AGENTS.md\n', 'utf-8');
    return 'dibuat';
  }
  const content = fs.readFileSync(claudePath, 'utf-8');
  if (/^@AGENTS\.md\s*$/m.test(content)) return 'dibiarkan';
  fs.appendFileSync(claudePath, `${content.endsWith('\n') ? '' : '\n'}\n@AGENTS.md\n`, 'utf-8');
  return 'ditambah';
}

/** Pasang skill bundled, skill kontrak arsitektur, AGENTS.md, dan CLAUDE.md ke workspace. */
export function installSkillPack(opts: InstallSkillPackOptions): InstallSkillPackResult {
  const { targetDir, bundledSkillsDir, contract, target } = opts;
  const roots = skillRoots(target);
  const installedSkills: string[] = [];
  const missingSources: string[] = [];

  const archContent = `---
name: ${ARCHITECTURE_SKILL_NAME}
description: Kontrak arsitektur wajib untuk framework ${contract.framework}.
---

${contract.markdown}
`;

  for (const rel of roots) {
    const rootDir = path.join(targetDir, rel);
    fs.mkdirSync(rootDir, { recursive: true });
    for (const skill of BUNDLED_SKILLS) {
      const src = path.join(bundledSkillsDir, skill.file);
      if (!fs.existsSync(src)) {
        if (!missingSources.includes(skill.file)) missingSources.push(skill.file);
        continue;
      }
      writeSkill(rootDir, skill.name, fs.readFileSync(src, 'utf-8'));
      if (!installedSkills.includes(skill.name)) installedSkills.push(skill.name);
    }
    writeSkill(rootDir, ARCHITECTURE_SKILL_NAME, archContent);
  }
  installedSkills.push(ARCHITECTURE_SKILL_NAME);

  const agentsMd = upsertAgentsMd(targetDir, buildAgentsBlock(contract.title), Boolean(opts.force));
  const claudeMd = target === 'agents' ? 'dilewati' : ensureClaudeMd(targetDir);

  return { installedSkills, missingSources, roots, agentsMd, claudeMd };
}
