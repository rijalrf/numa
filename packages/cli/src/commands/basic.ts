// Handler command kecil: login, switch, whoami, next, start, context, prd, logout, status.
import { loadConfig, saveConfig, clearConfig } from '../config.js';
import { api, ApiError, probeHealth, ensureActiveProject } from '../api-client.js';
import { formatPrdMarkdown } from '../format-prd.js';

export async function runLogin(token: string, opts: { apiUrl?: string; url?: string }): Promise<void> {
  const cfg = loadConfig();
  const targetUrl = opts.url || opts.apiUrl;
  if (targetUrl) {
    cfg.apiUrl = targetUrl;
  }
  cfg.token = token;
  saveConfig(cfg);
  const healthy = await probeHealth(cfg);
  if (!healthy) {
    console.error(`Tidak bisa menghubungi server di ${cfg.apiUrl}.`);
    console.error('Pastikan numa API jalan di port 6655.');
    process.exit(2);
  }

  console.log(`Mengecek akses token...`);

  // Fetch all projects accessible by this token
  let availableProjects: Array<{ id: string; name: string }> = [];

  try {
    const result = await api.listScopes(cfg);
    // Result should be { scopes: [...] }
    if (result && typeof result === 'object' && 'scopes' in result) {
      availableProjects = (result as any).scopes || [];
    } else {
      // Fallback: direct array
      availableProjects = Array.isArray(result) ? result : [];
    }
    console.log(`Found ${availableProjects.length} project(s)`);
  } catch (err) {
    if (err instanceof ApiError) {
      console.error('Error fetching scopes:', err.status, err.message);
      clearConfig();
      process.exit(1);
    }
    console.error('Unexpected error:', err);
    process.exit(1);
  }

  console.log(`Login berhasil!`);

  if (availableProjects.length > 0) {
    console.log(`Token valid dengan akses ke ${availableProjects.length} project:`);
    for (const proj of availableProjects) {
      console.log(`  - ${proj.name} (${proj.id})`);
    }
    if (availableProjects.length === 1) {
      cfg.projectId = availableProjects[0].id;
      saveConfig(cfg);
      console.log('');
      console.log(`Project aktif otomatis: ${availableProjects[0].name} (${availableProjects[0].id})`);
    } else {
      console.log('');
      console.log('Gunakan "numa switch <project-id>" untuk memilih project aktif.');
    }
  } else {
    console.log('Token valid, tetapi belum ada project yang di-scope.');
    console.log('Buat project baru atau minta admin menambahkan scope.');
  }

  console.log(`Server   : ${cfg.apiUrl}`);
}

export async function runSwitch(projectId?: string): Promise<void> {
  const cfg = loadConfig();

  if (!cfg.token) {
    console.error('Belum login. Jalankan: numa login <token>');
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

  cfg.projectId = projectId;
  saveConfig(cfg);

  try {
    const me = await api.whoami(cfg);
    console.log(`Switch berhasil!`);
    console.log(`Project  : ${me.project.name}`);
    console.log(`ProjectId: ${me.project.id}`);
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Gagal switch ke project ${projectId}: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
}

export async function runWhoami(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.token) {
    console.error('Belum login. Jalankan: numa login <token>');
    process.exit(1);
  }
  if (!(await ensureActiveProject(cfg))) {
    process.exit(1);
  }
  try {
    const me = await api.whoami(cfg);
    console.log(JSON.stringify(me, null, 2));
  } catch (e: any) {
    console.error(`Error: ${e?.message || e}`);
    process.exit(1);
  }
}

export async function runNext(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.token) {
    console.error('Belum login. Jalankan: numa login <token>');
    process.exit(1);
  }
  if (!(await ensureActiveProject(cfg))) {
    process.exit(1);
  }
  try {
    const out = await api.next(cfg);
    if (!out.hasTask) {
      console.log(out.message ?? 'Tidak ada task tersisa.');
      return;
    }
    cfg.activeTaskId = out.task!.id;
    saveConfig(cfg);
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

export async function runStart(id?: string): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.token) {
    console.error('Belum login. Jalankan: numa login <token>');
    process.exit(1);
  }
  if (!(await ensureActiveProject(cfg))) {
    process.exit(1);
  }
  const taskId = id ?? cfg.activeTaskId;
  if (!taskId) {
    console.error('Tidak ada task aktif. Jalankan: numa next');
    process.exit(1);
  }
  try {
    const r = await api.start(cfg, taskId);
    console.log(`Task ${r.taskId} -> ${r.status}`);
  } catch (e: any) {
    console.error(`Error: ${e?.message || e}`);
    process.exit(1);
  }
}

export async function runContext(id?: string): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.token) {
    console.error('Belum login. Jalankan: numa login <token>');
    process.exit(1);
  }
  if (!(await ensureActiveProject(cfg))) {
    process.exit(1);
  }
  const taskId = id ?? cfg.activeTaskId;
  if (!taskId) {
    console.error('Tidak ada task aktif. Jalankan: numa next');
    process.exit(1);
  }
  try {
    const r = await api.context(cfg, taskId);
    console.log(r.markdown);
  } catch (e: any) {
    console.error(`Error: ${e?.message || e}`);
    process.exit(1);
  }
}

export async function runPrd(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.token) {
    console.error('Belum login. Jalankan: numa login <token>');
    process.exit(1);
  }
  if (!(await ensureActiveProject(cfg))) {
    process.exit(1);
  }
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
}

export async function runStatus(): Promise<void> {
  const cfg = loadConfig();
  const healthy = await probeHealth(cfg);
  console.log(`Server : ${cfg.apiUrl} -> ${healthy ? 'OK' : 'TIDAK TERHUBUNG'}`);
  console.log(`Token  : ${cfg.token ? 'tersimpan' : 'kosong'}`);
  if (cfg.activeTaskId) console.log(`Active : ${cfg.activeTaskId}`);
  if (cfg.projectId) console.log(`Project: ${cfg.projectId}`);
}
