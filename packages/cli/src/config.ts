// Konfigurasi tersimpan di ~/.numa/config.json
// Skema: { apiUrl, token?, activeTaskId?, projectId? }
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type Config = {
  apiUrl: string;
  token?: string;
  activeTaskId?: string;
  projectId?: string;
};

const DIR = path.join(os.homedir(), '.numa');
const FILE = path.join(DIR, 'config.json');

function ensureDir() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
}

export function loadConfig(): Config {
  ensureDir();
  if (!fs.existsSync(FILE)) {
    return { apiUrl: process.env.NUMA_API_URL ?? 'http://localhost:6655' };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf-8')) as Partial<Config>;
    return {
      apiUrl: raw.apiUrl ?? process.env.NUMA_API_URL ?? 'http://localhost:6655',
      token: raw.token,
      activeTaskId: raw.activeTaskId,
      projectId: raw.projectId,
    };
  } catch {
    return { apiUrl: process.env.NUMA_API_URL ?? 'http://localhost:6655' };
  }
}

export function saveConfig(cfg: Config) {
  ensureDir();
  fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

export function clearConfig() {
  if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
}
