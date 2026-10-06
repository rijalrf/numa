// Fetch wrapper ke backend numa. credentials 'include' agar cookie session terbaca.
export function resolveApiUrl() {
  if (typeof window !== 'undefined') {
    return '';
  }
  return import.meta.env?.VITE_API_URL ?? '';
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

const PUBLIC_PATHS = ['/', '/login'];
let redirecting = false;

// Endpoint auth (/api/auth/*) menangani 401 sendiri lewat auth client, jadi tidak ikut redirect.
function shouldRedirectToLogin(path: string): boolean {
  if (typeof window === 'undefined') return false;
  if (path.startsWith('/api/auth')) return false;
  return !PUBLIC_PATHS.includes(window.location.pathname);
}

function redirectToLogin() {
  if (redirecting) return;
  redirecting = true;
  window.location.assign('/login');
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
  const contentType = resp.headers.get('content-type') || '';
  let body: any = null;
  if (text) {
    if (contentType.includes('application/json') || (!contentType.includes('text/html') && !text.trim().startsWith('<'))) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new ApiError(`Gagal membaca format JSON dari server (HTTP ${resp.status}).`, resp.status, text);
      }
    } else {
      throw new ApiError(
        `Server mengembalikan halaman HTML alih-alih JSON (HTTP ${resp.status}). Periksa rute gateway atau batas waktu proxy.`,
        resp.status,
        text
      );
    }
  }
  if (resp.status === 401 && shouldRedirectToLogin(path)) {
    // Sesi berakhir: arahkan ke login sekali saja agar banyak request paralel tidak memicu loop.
    redirectToLogin();
  }
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
