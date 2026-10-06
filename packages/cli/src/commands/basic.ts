// Handler command kecil: login, switch, whoami, next, start, context, prd, logout, status.
import { loadConfig, loadGlobalConfig, updateGlobalConfig, clearConfig, findWorkspaceRoot, saveWorkspace } from '../config.js';
import { api, ApiError, probeHealth } from '../api-client.js';
import { formatPrdMarkdown } from '../format-prd.js';
import { readSecret } from '../prompt.js';
import { requireSession, resolveTaskId } from '../session.js';
import { captureTaskState, saveTaskState } from '../task-state.js';
import { readSkillsVersion } from './init.js';
import { CLI_VERSION } from '../version.js';

/** Token dari argumen (deprecated), env NUMA_TOKEN, atau prompt tersembunyi. */
async function resolveLoginToken(arg?: string): Promise<string> {
  if (arg) {
    console.error(
      'Peringatan: token lewat argumen tersimpan di riwayat shell dan daftar proses. ' +
        'Gunakan NUMA_TOKEN atau prompt interaktif (jalankan "numa login" tanpa argumen).'
    );
    return arg.trim();
  }
  if (process.env.NUMA_TOKEN) return process.env.NUMA_TOKEN.trim();
  return readSecret('Tempel token PAT (tidak ditampilkan): ');
}

export async function runLogin(tokenArg: string | undefined, opts: { apiUrl?: string; url?: string }): Promise<void> {
  const token = await resolveLoginToken(tokenArg);
  if (!token) {
    console.error('Token kosong. Login dibatalkan.');
    process.exit(1);
  }

  const targetUrl = opts.url || opts.apiUrl;
  const previous = loadGlobalConfig();
  const cfg = updateGlobalConfig({ apiUrl: targetUrl ?? process.env.NUMA_API_URL ?? previous.apiUrl, token });

  const healthy = await probeHealth(cfg);
  if (!healthy) {
    console.error(`Tidak bisa menghubungi server di ${cfg.apiUrl}.`);
    console.error('Pastikan numa API jalan dan URL benar (--api-url).');
    process.exit(2);
  }

  console.log('Mengecek akses token...');

  let availableProjects: Array<{ id: string; name: string }> = [];
  try {
    const result = await api.listScopes(cfg);
    availableProjects = (result as any)?.scopes ?? (Array.isArray(result) ? result : []);
  } catch (err) {
    // Token ditolak: jangan biarkan token tidak valid tersimpan.
    updateGlobalConfig({ token: undefined });
    if (err instanceof ApiError) {
      console.error(`Login gagal [${err.status}]: ${err.message}`);
      process.exit(1);
    }
    console.error('Unexpected error:', err);
    process.exit(1);
  }

  console.log('Login berhasil!');
  console.log(`Server   : ${cfg.apiUrl}`);

  if (availableProjects.length === 0) {
    console.log('Token valid, tetapi belum ada project yang dapat diakses.');
    return;
  }
  console.log(`Token valid dengan akses ke ${availableProjects.length} project:`);
  for (const proj of availableProjects) {
    console.log(`  - ${proj.name} (${proj.id})`);
  }
  if (availableProjects.length === 1) {
    const only = availableProjects[0];
    updateGlobalConfig({ projectId: only.id });
    console.log(`\nProject aktif otomatis: ${only.name} (${only.id})`);
  } else {
    console.log('\nGunakan "numa switch <project-id>" untuk memilih project aktif.');
  }
}

export async function runSwitch(projectId?: string): Promise<void> {
  const cfg = loadConfig();

  if (!cfg.token) {
    console.error('Belum login. Jalankan: numa login');
    process.exit(1);
  }

  if (!projectId) {
    try {
      const result = await api.listScopes(cfg);
      const projects: Array<{ id: string; name: string }> =
        (result as any)?.scopes ?? (Array.isArray(result) ? result : []);
      console.log('Daftar project yang tersedia untuk token ini:\n');
      if (projects.length === 0) {
        console.log('  (Belum ada project yang dapat diakses)');
      } else {
        for (const p of projects) {
          const isCurrent = p.id === cfg.projectId ? ' * (aktif)' : '';
          console.log(`  - ${p.name} (${p.id})${isCurrent}`);
        }
      }
      console.log('\nGunakan: numa switch <project-id>');
    } catch (err: any) {
      console.error('Gagal mengambil daftar project:', err?.message || err);
      process.exit(1);
    }
    return;
  }

  // Verifikasi akses dulu; jangan menyimpan project yang tidak boleh diakses.
  try {
    const me = await api.whoami({ ...cfg, projectId });
    updateGlobalConfig({ projectId });
    const root = findWorkspaceRoot();
    if (root) {
      saveWorkspace(root, { projectId });
      console.log(`Workspace diperbarui: ${root}/.numa/workspace.json`);
    }
    console.log('Switch berhasil!');
    console.log(`Project  : ${me.project.name}`);
    console.log(`ProjectId: ${me.project.id}`);
    if (process.env.NUMA_PROJECT_ID && process.env.NUMA_PROJECT_ID !== projectId) {
      console.log('Catatan: NUMA_PROJECT_ID di environment masih menimpa project aktif ini.');
    }
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Gagal switch ke project ${projectId}: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
}

export async function runWhoami(): Promise<void> {
  const cfg = await requireSession();
  try {
    const me = await api.whoami(cfg);
    console.log(JSON.stringify(me, null, 2));
  } catch (e: any) {
    console.error(`Error: ${e?.message || e}`);
    process.exit(1);
  }
}

export async function runNext(): Promise<void> {
  const cfg = await requireSession();
  try {
    const out = await api.next(cfg);
    if (!out.hasTask) {
      console.log(out.message ?? 'Tidak ada task tersisa.');
      return;
    }
    updateGlobalConfig({ activeTaskId: out.task!.id });
    console.log(`Task #${out.task!.order} [${out.task!.layer}] ${out.task!.status}`);
    console.log(`ID    : ${out.task!.id}`);
    console.log(`Judul : ${out.task!.title}`);
    if (out.task!.description) console.log(`\n${out.task!.description}`);
    console.log(`\n-> Lanjut: \`numa start\` lalu \`numa context\``);
  } catch (e: any) {
    console.error(`Error: ${e?.message || e}`);
    process.exit(1);
  }
}

export async function runStart(id?: string, opts?: { dir?: string }): Promise<void> {
  const cfg = await requireSession();
  const taskId = resolveTaskId(cfg, id);
  try {
    const r = await api.start(cfg, taskId);
    console.log(`Task ${r.taskId} -> ${r.status}`);
    updateGlobalConfig({ activeTaskId: r.taskId });

    // Catat baseline agar guard hanya menilai perubahan sejak task dimulai.
    const dir = opts?.dir ?? process.cwd();
    const state = captureTaskState(r.taskId, dir);
    saveTaskState(dir, state);
    console.log(
      state.baselineSha
        ? `Baseline git: ${state.baselineSha.slice(0, 8)} (${Object.keys(state.dirtyAtStart).length} file sudah berubah sebelum task)`
        : 'Baseline git tidak tersedia (bukan repo git atau belum ada commit).'
    );
  } catch (e: any) {
    console.error(`Error: ${e?.message || e}`);
    process.exit(1);
  }
}

export async function runContext(id?: string): Promise<void> {
  const cfg = await requireSession();
  const taskId = resolveTaskId(cfg, id);
  try {
    const r = await api.context(cfg, taskId);
    console.log(r.markdown);
  } catch (e: any) {
    console.error(`Error: ${e?.message || e}`);
    process.exit(1);
  }
}

export async function runPrd(): Promise<void> {
  const cfg = await requireSession();
  try {
    const r = await api.prd(cfg);
    const prdObj = r.prd ?? r.brd;
    if (!prdObj) {
      throw new ApiError('PRD belum ada di project ini. Generate PRD dulu lewat web UI.', 400);
    }
    const rendered = formatPrdMarkdown(prdObj.content, prdObj);
    console.log(rendered);
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Error [${e.status}]: ${e.message}`);
    } else {
      console.error('Error:', e instanceof Error ? e.message : e);
    }
    process.exit(1);
  }
}

export function runLogout(): void {
  clearConfig();
  console.log('Token dihapus.');
  if (process.env.NUMA_TOKEN) console.log('Catatan: NUMA_TOKEN di environment masih terpasang.');
}

export async function runStatus(): Promise<void> {
  const cfg = loadConfig();
  const healthy = await probeHealth(cfg);
  console.log(`CLI    : ${CLI_VERSION}`);
  console.log(`Server : ${cfg.apiUrl} -> ${healthy ? 'OK' : 'TIDAK TERHUBUNG'}`);
  console.log(`Token  : ${cfg.token ? (process.env.NUMA_TOKEN ? 'dari NUMA_TOKEN' : 'tersimpan') : 'kosong'}`);
  if (cfg.activeTaskId) console.log(`Active : ${cfg.activeTaskId}`);
  if (cfg.projectId) {
    const root = findWorkspaceRoot();
    const source = process.env.NUMA_PROJECT_ID ? 'env' : root ? 'workspace' : 'global';
    console.log(`Project: ${cfg.projectId} (${source})`);
  }
  if (cfg.token && healthy) {
    try {
      const scopes = await api.listScopes(cfg);
      const n = ((scopes as any)?.scopes ?? []).length;
      console.log(`Akses  : token valid, ${n} project`);
    } catch (e) {
      console.log(`Akses  : token DITOLAK (${e instanceof ApiError ? e.message : 'error'})`);
    }
  }
  const skills = readSkillsVersion(process.cwd());
  if (skills && skills !== CLI_VERSION) {
    console.log(`Skill  : ${skills} (CLI ${CLI_VERSION}) -> jalankan: numa init --update`);
  } else if (skills) {
    console.log(`Skill  : ${skills}`);
  }
}
