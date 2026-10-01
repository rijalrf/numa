// Logic command `init` — pasang skill pack numa + kontrak arsitektur ke workspace.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { api, ApiError } from '../api-client.js';

export type InitOptions = {
  dir?: string;
  force?: boolean;
  // Path folder bundled skills (dist/../skills). Dihitung dari index.ts agar
  // path tetap sama walau file ini dipindah ke subfolder commands/.
  bundledSkillsDir: string;
};

export async function runInit(opts: InitOptions): Promise<void> {
  try {
    const cfg = loadConfig();
    const targetDir = path.resolve(opts.dir || process.cwd());

    console.log(`Memasang skill pack numa di: ${targetDir}`);

    // 1. Fetch kontrak arsitektur dari API
    console.log('Mengambil kontrak arsitektur dari server...');
    const contract = await api.architectureContract(cfg);

    // 2. Siapkan folder .claude/skills/
    const skillsTargetDir = path.join(targetDir, '.claude', 'skills');
    fs.mkdirSync(skillsTargetDir, { recursive: true });

    // Salin 5 bundled skills
    const staticSkills = [
      { file: 'test-driven-development.md', name: 'numa-tdd' },
      { file: 'incremental-implementation.md', name: 'numa-incremental' },
      { file: 'api-and-interface-design.md', name: 'numa-api-design' },
      { file: 'security-and-hardening.md', name: 'numa-security' },
      { file: 'frontend-ui-engineering.md', name: 'numa-frontend' },
    ];

    for (const s of staticSkills) {
      const srcPath = path.join(opts.bundledSkillsDir, s.file);
      const destSkillDir = path.join(skillsTargetDir, s.name);
      fs.mkdirSync(destSkillDir, { recursive: true });
      const destPath = path.join(destSkillDir, 'SKILL.md');
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath);
      }
    }

    // Tulis dynamic architecture contract skill
    const archSkillDir = path.join(skillsTargetDir, 'numa-architecture');
    fs.mkdirSync(archSkillDir, { recursive: true });
    const archSkillContent = `---
name: numa-architecture
description: Kontrak arsitektur wajib untuk framework ${contract.framework}.
---

${contract.markdown}
`;
    fs.writeFileSync(path.join(archSkillDir, 'SKILL.md'), archSkillContent, 'utf-8');

    // 3. Tambahkan ke AGENTS.md
    const agentsPath = path.join(targetDir, 'AGENTS.md');
    const markerBegin = '<!-- numa:begin -->';
    const markerEnd = '<!-- numa:end -->';
    const agentsBlock = `\n${markerBegin}
# Pedoman Rekayasa & Kontrak Arsitektur Numa

Proyek ini menggunakan standar arsitektur dan skill pack Numa:
- Kontrak Arsitektur: .claude/skills/numa-architecture/SKILL.md (${contract.title})
- Test-Driven Development: .claude/skills/numa-tdd/SKILL.md
- Implementasi Bertahap: .claude/skills/numa-incremental/SKILL.md
- Desain API: .claude/skills/numa-api-design/SKILL.md
- Pengerasan Keamanan: .claude/skills/numa-security/SKILL.md
- Desain Frontend: .claude/skills/numa-frontend/SKILL.md

Patuhi seluruh Acceptance Criteria dan aturan layering sebelum menjalankan \`numa done\`.
${markerEnd}\n`;

    if (fs.existsSync(agentsPath)) {
      const content = fs.readFileSync(agentsPath, 'utf-8');
      if (content.includes(markerBegin)) {
        if (opts.force) {
          const regex = new RegExp(`${markerBegin}[\\s\\S]*?${markerEnd}`, 'g');
          const updated = content.replace(regex, agentsBlock.trim());
          fs.writeFileSync(agentsPath, updated, 'utf-8');
          console.log('AGENTS.md diperbarui dengan blok Numa terbaru.');
        } else {
          console.log('AGENTS.md sudah memuat konfigurasi Numa (gunakan --force untuk menimpa).');
        }
      } else {
        fs.appendFileSync(agentsPath, agentsBlock, 'utf-8');
        console.log('Blok Numa ditambahkan ke AGENTS.md.');
      }
    } else {
      fs.writeFileSync(agentsPath, `# AGENTS.md\n${agentsBlock}`, 'utf-8');
      console.log('File AGENTS.md dibuat dengan konfigurasi Numa.');
    }

    console.log('Berhasil memasang skill pack Numa dan kontrak arsitektur.');
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Error [${e.status}]: ${e.message}`);
    } else {
      console.error('Error:', e instanceof Error ? e.message : e);
    }
    process.exit(1);
  }
}
