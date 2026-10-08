// HTTP client ke numa API (port 6655). TIDAK ADA mock fallback — semua error eksplisit.
import { updateGlobalConfig, type Config } from './config.js';

export class ApiError extends Error {
  status: number;
  detail?: unknown;
  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(cfg: Config, path: string, init: RequestInit = {}): Promise<T> {
  if (!cfg.token) {
    throw new ApiError('Belum login.', 401);
  }
  const url = `${cfg.apiUrl.replace(/\/$/, '')}${path}`;

  // Build headers with X-Project-ID if specified
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.token}`,
  };

  if (cfg.projectId) {
    headers['X-Project-ID'] = cfg.projectId;
  }

  const resp = await fetch(url, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers ?? {}),
    },
  });
  let body: unknown = null;
  const text = await resp.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (resp.status === 401 && !process.env.NUMA_TOKEN) {
    // Token tersimpan kedaluwarsa atau dicabut: hapus agar perintah berikutnya otomatis login ulang.
    updateGlobalConfig({ token: undefined });
    throw new ApiError('Sesi login berakhir atau token dicabut. Jalankan ulang perintah; CLI akan meminta login lagi.', 401, body);
  }
  if (!resp.ok) {
    const rawMsg = (body as { error?: string })?.error ?? (typeof body === 'string' ? body : `HTTP ${resp.status}`);
    let msg = rawMsg;
    if (resp.status === 400 && typeof rawMsg === 'string' && rawMsg.toLowerCase().includes('project id required')) {
      msg = 'Project aktif belum dipilih. Jalankan: numa switch <project-id>';
    }
    throw new ApiError(msg, resp.status, body);
  }
  return body as T;
}

// === Endpoint types & wrappers ===

export type Whoami = { project: { id: string; name: string } };
export type NextTask = {
  hasTask: boolean;
  task?: { id: string; title: string; description: string | null; layer: string; order: number; status: string };
  message?: string;
};
export type ContextResp = {
  ok: true;
  taskId: string;
  markdown: string;
  apiContracts?: unknown[];
  guard?: {
    layer?: string;
    forbidden?: string[];
    files_readonly?: string[];
    files_to_create?: string[];
    validation_commands?: string[];
    advisory_commands?: string[];
  };
};
export type GuardReportPayload = {
  baseline: string | null;
  changedFiles: string[];
  outOfScopeFiles: string[];
  commands: Array<{ command: string; ok: boolean; skipped?: boolean }>;
  cliVersion: string;
};
export type CompleteMeta = {
  outputSummary?: string;
  apiContracts?: unknown[];
  /** true bila user memakai --force (guard dilewati); dicatat di server. */
  forced?: boolean;
  guardReport?: GuardReportPayload;
};
export type StatusResp = {
  ok: true;
  taskId: string;
  status: string;
  layer?: string;
  /** true bila task ini yang terakhir di layernya (informasi netral; berhenti atau lanjut ditentukan mode di Master Prompt). */
  layerCompleted?: boolean;
  /** true bila seluruh task project sudah DONE (hanya diisi saat layer selesai). */
  allTasksDone?: boolean;
};
export type PrdResponse = {
  prd?: { id: string; content: unknown; version: number; generatedAt: string };
  brd?: { id: string; content: unknown; version: number; generatedAt: string };
};
export type BrdResponse = PrdResponse;
export type ProjectScope = { id: string; name: string };
export type ArchitectureContractResponse = {
  contractKey: string;
  title: string;
  framework: string;
  markdown: string;
};

export const api = {
  whoami(cfg: Config) {
    return request<Whoami>(cfg, '/api/agent/whoami');
  },
  // List all projects accessible by this token (without needing projectId)
  listScopes(cfg: Config) {
    // Force clear existing Authorization header from generic headers and set fresh one
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.token}`,
      // Explicitly don't include X-Project-ID for this endpoint
    };
    return request<ProjectScope[]>(cfg, '/api/agent/scopes', { headers });
  },
  next(cfg: Config) {
    return request<NextTask>(cfg, '/api/agent/tasks/next');
  },
  start(cfg: Config, id: string) {
    return request<StatusResp>(cfg, `/api/agent/tasks/${id}/start`, { method: 'POST' });
  },
  context(cfg: Config, id: string) {
    return request<ContextResp>(cfg, `/api/agent/tasks/${id}/context`);
  },
  done(cfg: Config, id: string, meta?: CompleteMeta) {
    return request<StatusResp>(cfg, `/api/agent/tasks/${id}/complete`, {
      method: 'POST',
      body: meta ? JSON.stringify(meta) : undefined,
    });
  },
  fail(cfg: Config, id: string, failure: unknown) {
    return request<{ ok: true; taskId: string; status: string }>(cfg, `/api/agent/tasks/${id}/fail`, {
      method: 'POST',
      body: JSON.stringify(failure),
    });
  },
  retry(cfg: Config, id: string) {
    return request<{ ok: true; taskId: string; status: string }>(cfg, `/api/agent/tasks/${id}/retry`, { method: 'POST' });
  },
  block(cfg: Config, id: string, reason: string) {
    return request<{ ok: true; taskId: string; status: string; blockedReason: string }>(cfg, `/api/agent/tasks/${id}/block`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
  prd(cfg: Config) {
    return request<PrdResponse>(cfg, '/api/agent/prd');
  },
  brd(cfg: Config) {
    return request<PrdResponse>(cfg, '/api/agent/prd');
  },
  architectureContract(cfg: Config) {
    return request<ArchitectureContractResponse>(cfg, '/api/agent/architecture-contract');
  },
  saveRepoSummary(cfg: Config, summary: unknown) {
    return request<{ ok: true; savedAt: string }>(cfg, '/api/agent/repo-summary', {
      method: 'POST',
      body: JSON.stringify({ summary }),
    });
  },
};

export async function probeHealth(cfg: Config): Promise<boolean> {
  try {
    const r = await fetch(`${cfg.apiUrl}/health`);
    return r.ok;
  } catch {
    return false;
  }
}

// Pastikan project aktif sudah dipilih. Bila belum, tampilkan daftar project
// yang bisa diakses token ini lalu arahkan user ke `numa switch <project-id>`.
export async function ensureActiveProject(cfg: Config): Promise<boolean> {
  if (cfg.projectId) return true;
  console.error('Project aktif belum dipilih.');
  try {
    const result = await api.listScopes(cfg);
    const projects: Array<{ id: string; name: string }> =
      (result as any)?.scopes ?? (Array.isArray(result) ? result : []);
    if (projects.length > 0) {
      console.error('\nDaftar project yang tersedia untuk token ini:');
      for (const p of projects) {
        console.error(`  - ${p.name} (${p.id})`);
      }
      console.error('\nPilih project aktif dengan: numa switch <project-id>');
    } else {
      console.error('Belum ada project yang dapat diakses oleh token ini.');
    }
  } catch (err: any) {
    console.error('Gagal mengambil daftar project:', err?.message || err);
  }
  return false;
}
