// Fetch wrapper ke backend numa. credentials 'include' agar cookie session terbaca.
export function resolveApiUrl() {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:6655';
    }
    return window.location.origin;
  }
  return import.meta.env.VITE_API_URL ?? 'http://localhost:6655';
}

export const API_URL = resolveApiUrl();

export class ApiError extends Error {
  status: number;
  detail?: unknown;
  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const resp = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await resp.text();
  const body = text ? JSON.parse(text) : null;
  if (!resp.ok) {
    throw new ApiError(body?.error ?? `HTTP ${resp.status}`, resp.status, body);
  }
  return body as T;
}

// Download file biner/teks dari backend dengan session cookie dan deteksi error
export async function downloadFile(path: string, fallbackFilename: string): Promise<void> {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;
  const res = await fetch(url, { credentials: 'include' });

  if (!res.ok) {
    let errMsg = `Gagal mengunduh (HTTP ${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) errMsg = body.error;
    } catch {}
    throw new Error(errMsg);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new Error('Menerima respon HTML tidak terduga, server gagal memproses unduhan.');
  }

  const disposition = res.headers.get('content-disposition');
  let filename = fallbackFilename;
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match && match[1]) filename = match[1];
  }

  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(blobUrl);
}
