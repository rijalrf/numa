// Konfigurasi CLI berlapis. Prioritas (tinggi ke rendah):
//   1. Environment: NUMA_API_URL, NUMA_PROJECT_ID
//   2. Workspace:   .numa/workspace.json { projectId, apiUrl } (dicari naik dari cwd)
//   3. Global:      ~/.numa/config.json { apiUrl, token?, activeTaskId?, projectId? }
// Token TIDAK pernah ditulis ke workspace (aman untuk di-commit).
import { ensureNumaGitignore } from './numa-gitignore.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type Config = {
  apiUrl: string;
  token?: string;
  activeTaskId?: string;
  projectId?: string;
};

export type WorkspaceConfig = { projectId?: string; apiUrl?: string };

const DEFAULT_API_URL = 'http://localhost:6655';
const DIR = path.join(os.homedir(), '.numa');
const FILE = path.join(DIR, 'config.json');
const WORKSPACE_DIR_NAME = '.numa';
const WORKSPACE_FILE_NAME = 'workspace.json';

function ensureDir() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
}

function readJson<T>(file: string): Partial<T> | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<T>;
  } catch {
    return null;
  }
}

/** Cari folder yang memuat .numa/workspace.json, naik dari `from`. Null bila tidak ada. */
export function findWorkspaceRoot(from: string = process.cwd()): string | null {
  let dir = path.resolve(from);
  for (;;) {
    if (fs.existsSync(path.join(dir, WORKSPACE_DIR_NAME, WORKSPACE_FILE_NAME))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function loadGlobalConfig(): Config {
  ensureDir();
  const raw = fs.existsSync(FILE) ? readJson<Config>(FILE) : null;
  return {
    apiUrl: raw?.apiUrl ?? DEFAULT_API_URL,
    token: raw?.token,
    activeTaskId: raw?.activeTaskId,
    projectId: raw?.projectId,
  };
}

/** Konfigurasi efektif (env > workspace > global). Hanya untuk dibaca; ubah lewat updateGlobalConfig/saveWorkspace. */
export function loadConfig(from: string = process.cwd()): Config {
  const global = loadGlobalConfig();
  const root = findWorkspaceRoot(from);
  const ws = root ? readJson<WorkspaceConfig>(path.join(root, WORKSPACE_DIR_NAME, WORKSPACE_FILE_NAME)) : null;
  return {
    apiUrl: process.env.NUMA_API_URL || ws?.apiUrl || global.apiUrl,
    token: global.token,
    activeTaskId: global.activeTaskId,
    projectId: process.env.NUMA_PROJECT_ID || ws?.projectId || global.projectId,
  };
}

export function updateGlobalConfig(patch: Partial<Config>): Config {
  const next = { ...loadGlobalConfig(), ...patch };
  ensureDir();
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}

export function saveWorkspace(root: string, ws: WorkspaceConfig): string {
  const dir = path.join(root, WORKSPACE_DIR_NAME);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, WORKSPACE_FILE_NAME);
  const merged = { ...(readJson<WorkspaceConfig>(file) ?? {}), ...ws };
  fs.writeFileSync(file, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  // Berkas runtime lokal tidak boleh ikut ter-commit; workspace.json aman (tanpa rahasia).
  ensureNumaGitignore(dir);
  return file;
}

export function clearConfig() {
  if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
}
