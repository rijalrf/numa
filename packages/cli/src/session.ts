// Helper sesi: pastikan sudah login dan project aktif terpilih sebelum memanggil API.
import { loadConfig, updateGlobalConfig, type Config } from './config.js';
import { deviceLogin, LoginPendingError } from './device-login.js';
import { api, ensureActiveProject } from './api-client.js';

/** Konfigurasi siap pakai atau keluar dengan pesan jelas. */
export async function requireSession(): Promise<Config> {
  const cfg = await ensureLoggedIn();
  if (!(await ensureActiveProject(cfg))) {
    process.exit(1);
  }
  return cfg;
}

/** ID task dari argumen atau task aktif; keluar bila tidak ada. */
export function resolveTaskId(cfg: Config, id?: string): string {
  const taskId = id ?? cfg.activeTaskId;
  if (!taskId) {
    console.error('Tidak ada task aktif. Jalankan: numa next');
    process.exit(1);
  }
  return taskId;
}

/**
 * Konfigurasi dengan token. Bila belum login, jalankan login lewat browser (sekali), pilih project aktif otomatis bila
 * hanya ada satu, lalu lanjutkan. Token dari NUMA_TOKEN (CI/headless) dipakai apa adanya tanpa login interaktif.
 */
export async function ensureLoggedIn(): Promise<Config> {
  const cfg = loadConfig();
  if (cfg.token) return cfg;
  try {
    const saved = await deviceLogin(cfg);
    return await autoSelectProject({ ...loadConfig(), ...saved, token: saved.token });
  } catch (err) {
    if (err instanceof LoginPendingError) {
      console.error(`\n${err.message}`);
      process.exit(2);
    }
    console.error(`Login gagal: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

/** Setelah login: bila belum ada project aktif dan hanya satu project yang bisa diakses, pilih otomatis. */
async function autoSelectProject(cfg: Config): Promise<Config> {
  if (cfg.projectId) return cfg;
  try {
    const result = (await api.listScopes(cfg)) as unknown;
    const projects: Array<{ id: string; name: string }> =
      (result as { scopes?: Array<{ id: string; name: string }> })?.scopes ?? (Array.isArray(result) ? result : []);
    if (projects.length === 1) {
      console.log(`Project aktif otomatis: ${projects[0].name} (${projects[0].id})`);
      return updateGlobalConfig({ projectId: projects[0].id });
    }
  } catch {
    // pemilihan project bisa dilakukan manual lewat numa switch
  }
  return cfg;
}
