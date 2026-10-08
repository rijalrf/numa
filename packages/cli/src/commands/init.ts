// Logic command `init` — pasang skill pack numa + kontrak arsitektur ke workspace.
import fs from 'node:fs';
import path from 'node:path';
import { findWorkspaceRoot, saveWorkspace } from '../config.js';
import { ensureLoggedIn } from '../session.js';
import { api, ApiError } from '../api-client.js';
import { CLI_VERSION } from '../version.js';
import { installSkillPack, isSkillTarget, type SkillTarget } from '../skill-pack.js';

export type InitOptions = {
  dir?: string;
  force?: boolean;
  /** Pasang ulang skill pack walau versinya sama dengan CLI. */
  update?: boolean;
  /** Lokasi pasang skill: agents (.agents/skills), claude (.claude/skills), atau all (default). */
  target?: string;
  // Path folder bundled skills (dist/../skills). Dihitung dari index.ts agar
  // path tetap sama walau file ini dipindah ke subfolder commands/.
  bundledSkillsDir: string;
};

const SKILLS_VERSION_FILE = '.numa/skills.version';

/** Versi skill pack yang terpasang di workspace, atau null bila belum ada. */
export function readSkillsVersion(dir: string): string | null {
  const root = findWorkspaceRoot(dir) ?? path.resolve(dir);
  try {
    return fs.readFileSync(path.join(root, SKILLS_VERSION_FILE), 'utf-8').trim() || null;
  } catch {
    return null;
  }
}

export async function runInit(opts: InitOptions): Promise<void> {
  try {
    const targetDir = path.resolve(opts.dir || process.cwd());
    const targetRaw = opts.target ?? 'all';
    if (!isSkillTarget(targetRaw)) {
      console.error(`Nilai --target tidak valid: "${targetRaw}". Pilih: agents, claude, atau all.`);
      process.exit(1);
    }
    const target: SkillTarget = targetRaw;

    // Login otomatis lewat browser bila belum login (kontrak arsitektur diambil dari server).
    const cfg = await ensureLoggedIn();

    const installed = readSkillsVersion(targetDir);
    if (installed === CLI_VERSION && !opts.update && !opts.force) {
      console.log(`Skill pack sudah versi ${CLI_VERSION} di ${targetDir}. Gunakan --update untuk memasang ulang.`);
      return;
    }
    console.log(
      installed
        ? `Memperbarui skill pack numa ${installed} -> ${CLI_VERSION} di: ${targetDir}`
        : `Memasang skill pack numa ${CLI_VERSION} di: ${targetDir}`
    );

    // 1. Fetch kontrak arsitektur dari API
    console.log('Mengambil kontrak arsitektur dari server...');
    const contract = await api.architectureContract(cfg);

    // 2. Pasang skill, kontrak arsitektur, AGENTS.md, dan CLAUDE.md
    const result = installSkillPack({
      targetDir,
      bundledSkillsDir: opts.bundledSkillsDir,
      contract,
      target,
      force: opts.force,
    });
    if (result.missingSources.length > 0) {
      throw new Error(`Berkas skill bundled tidak ditemukan: ${result.missingSources.join(', ')}. Pasang ulang numa-cli.`);
    }
    console.log(`Skill terpasang (${result.installedSkills.length}) di: ${result.roots.join(', ')}`);
    console.log(`AGENTS.md ${result.agentsMd}.${result.claudeMd === 'dilewati' ? '' : ` CLAUDE.md ${result.claudeMd}.`}`);

    // 3. Catat versi skill pack dan project untuk workspace ini (saveWorkspace juga menulis .numa/.gitignore)
    const wsFile = saveWorkspace(targetDir, { ...(cfg.projectId ? { projectId: cfg.projectId } : {}) });
    fs.writeFileSync(path.join(targetDir, SKILLS_VERSION_FILE), CLI_VERSION + '\n', 'utf-8');
    console.log(`Workspace dikonfigurasi: ${path.relative(targetDir, wsFile) || wsFile}`);
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
