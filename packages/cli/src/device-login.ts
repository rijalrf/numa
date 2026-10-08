// Login CLI lewat browser (device code): CLI meminta kode ke server, user menyetujui di web, lalu CLI menerima token
// berlingkup semua project. Tidak ada penyalinan token manual. Permintaan yang belum disetujui disimpan di
// ~/.numa/pending-login.json supaya menjalankan ulang perintah (mis. oleh agent non-interaktif) melanjutkan permintaan yang sama.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { updateGlobalConfig, type Config } from './config.js';
import { isInteractive } from './prompt.js';

const PENDING_FILE = path.join(os.homedir(), '.numa', 'pending-login.json');
const DEFAULT_NON_INTERACTIVE_WAIT_SECONDS = 90;

export type PendingLogin = {
  apiUrl: string;
  deviceCode: string;
  userCode: string;
  verificationUrlComplete: string;
  expiresAt: number; // epoch ms
  interval: number; // detik
};

export class LoginPendingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoginPendingError';
  }
}

export function loadPending(file: string = PENDING_FILE): PendingLogin | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as PendingLogin;
  } catch {
    return null;
  }
}

function savePending(p: PendingLogin, file: string = PENDING_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(p), { mode: 0o600 });
}

export function clearPending(file: string = PENDING_FILE) {
  try {
    fs.unlinkSync(file);
  } catch {
    // tidak ada berkas
  }
}

/** Permintaan tersimpan masih bisa dipakai untuk server yang sama. */
export function isPendingUsable(p: PendingLogin | null, apiUrl: string, now = Date.now()): p is PendingLogin {
  return Boolean(p && p.apiUrl === apiUrl && p.expiresAt - now > 5_000);
}

/** Buka URL di browser bila memungkinkan; gagal membuka tidak masalah (URL tetap dicetak). */
export function openBrowser(url: string): void {
  if (process.env.NUMA_NO_BROWSER) return;
  try {
    const [cmd, args]: [string, string[]] =
      process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => undefined);
    child.unref();
  } catch {
    // abaikan
  }
}

async function postJson(apiUrl: string, route: string, body: unknown): Promise<{ status: number; body: any }> {
  const resp = await fetch(`${apiUrl.replace(/\/$/, '')}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { error: text.slice(0, 200) };
  }
  return { status: resp.status, body: parsed };
}

async function startRequest(apiUrl: string): Promise<PendingLogin> {
  const { status, body } = await postJson(apiUrl, '/api/cli-auth/start', { clientName: os.hostname() });
  if (status !== 201 || !body?.deviceCode) {
    throw new Error(body?.error ?? `Server menolak permintaan login (HTTP ${status}).`);
  }
  return {
    apiUrl,
    deviceCode: body.deviceCode,
    userCode: body.userCode,
    verificationUrlComplete: body.verificationUrlComplete,
    expiresAt: Date.now() + body.expiresIn * 1000,
    interval: body.interval ?? 3,
  };
}

/** Lama menunggu persetujuan pada sesi non-interaktif (detik); dapat diubah lewat NUMA_LOGIN_WAIT_SECONDS. */
function waitSeconds(): number {
  const v = Number(process.env.NUMA_LOGIN_WAIT_SECONDS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_NON_INTERACTIVE_WAIT_SECONDS;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Login lewat browser. Mengembalikan konfigurasi dengan token tersimpan.
 * Interaktif: menunggu persetujuan sampai kode kedaluwarsa. Non-interaktif (mis. dijalankan agent): menunggu
 * maksimal ~90 detik lalu melempar LoginPendingError; menjalankan ulang perintah melanjutkan permintaan yang sama.
 */
export async function deviceLogin(cfg: Pick<Config, 'apiUrl'>): Promise<Config> {
  const apiUrl = cfg.apiUrl;
  let pending = loadPending();
  const reused = isPendingUsable(pending, apiUrl);
  if (!reused) {
    pending = await startRequest(apiUrl);
    savePending(pending);
  }
  const req = pending as PendingLogin;

  console.log('\nLogin Numa diperlukan (cukup sekali).');
  console.log(`1. Buka: ${req.verificationUrlComplete}`);
  console.log(`2. Pastikan kode ini tampil di browser: ${req.userCode}`);
  console.log('3. Klik "Setujui".');
  if (isInteractive() || process.env.NUMA_AUTO_OPEN) openBrowser(req.verificationUrlComplete);
  console.log('\nMenunggu persetujuan...');

  const interactive = isInteractive();
  const deadline = interactive ? req.expiresAt : Math.min(req.expiresAt, Date.now() + waitSeconds() * 1000);
  let interval = Math.max(1, req.interval) * 1000;

  while (Date.now() < deadline) {
    await sleep(interval);
    const { status, body } = await postJson(apiUrl, '/api/cli-auth/poll', { deviceCode: req.deviceCode });
    if (status === 200 && body?.token) {
      clearPending();
      const saved = updateGlobalConfig({ apiUrl, token: body.token });
      console.log('Login berhasil.');
      return saved;
    }
    if (status === 429) {
      interval += 1000; // terlalu rapat: perlambat
      continue;
    }
    if (status === 403) {
      clearPending();
      throw new Error('Login ditolak di browser.');
    }
    if (status === 410) {
      clearPending();
      throw new Error('Kode login kedaluwarsa atau sudah dipakai. Jalankan ulang perintah untuk meminta kode baru.');
    }
    // 202 pending atau galat sementara: lanjut menunggu
  }

  if (interactive) {
    clearPending();
    throw new Error('Kode login kedaluwarsa sebelum disetujui. Jalankan ulang perintah untuk meminta kode baru.');
  }
  throw new LoginPendingError(
    `Belum disetujui. Minta user membuka ${req.verificationUrlComplete} (kode ${req.userCode}) lalu klik Setujui, kemudian jalankan ulang perintah yang sama.`
  );
}
