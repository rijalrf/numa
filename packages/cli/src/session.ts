// Helper sesi: pastikan sudah login dan project aktif terpilih sebelum memanggil API.
import { loadConfig, type Config } from './config.js';
import { ensureActiveProject } from './api-client.js';

/** Konfigurasi siap pakai atau keluar dengan pesan jelas. */
export async function requireSession(): Promise<Config> {
  const cfg = loadConfig();
  if (!cfg.token) {
    console.error('Belum login. Jalankan: numa login');
    process.exit(1);
  }
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
