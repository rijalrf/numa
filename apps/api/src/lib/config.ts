// Konfigurasi runtime terpusat. Semua domain, origin, dan secret berasal dari environment variable.
// Dipakai oleh index.ts (CORS), auth.ts (Better Auth), dan route yang membangun URL publik.

const isProd = process.env.NODE_ENV === 'production';

const LOCAL_ORIGINS = ['http://localhost:3455', 'http://127.0.0.1:3455'];

function splitList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

// Origin frontend yang diizinkan: lokal + daftar FE_URL (dipisah koma).
export const FE_ORIGINS: string[] = Array.from(new Set([...LOCAL_ORIGINS, ...splitList(process.env.FE_URL)]));

// URL publik API. Wajib di produksi agar tidak ada domain bawaan yang tertulis di kode.
export function getPublicApiUrl(): string {
  const url = process.env.BETTER_AUTH_URL;
  if (url) return url.replace(/\/$/, '');
  if (isProd) {
    throw new Error('BETTER_AUTH_URL wajib diisi di produksi.');
  }
  return `http://localhost:${process.env.PORT ?? 6655}`;
}

// Host yang diizinkan Better Auth (lokal + host dari FE_ORIGINS dan BETTER_AUTH_URL).
export function getAllowedHosts(): string[] {
  const hosts = new Set<string>(['localhost:6655', 'localhost:3455', '127.0.0.1:6655', '127.0.0.1:3455']);
  for (const origin of [...FE_ORIGINS, process.env.BETTER_AUTH_URL ?? '']) {
    if (!origin) continue;
    try {
      hosts.add(new URL(origin).host);
    } catch {
      // Abaikan origin dengan format tidak valid
    }
  }
  return Array.from(hosts);
}

export const IS_PRODUCTION = isProd;

// Port aplikasi hasil generate saat diverifikasi lokal (dihindarkan dari 3455/6655 milik Numa).
export const PREVIEW_PORT = Number(process.env.PREVIEW_PORT ?? 9999);

// Jumlah proxy tepercaya di depan API (default 1: tunnel Cloudflare langsung ke API).
// Jalur lewat nginx web berarti 2. Nilai terlalu besar membuat X-Forwarded-For palsu dipercaya.
export const TRUST_PROXY_HOPS = Number(process.env.TRUST_PROXY_HOPS ?? 1);

/** Batas atas baris untuk endpoint daftar yang bisa tumbuh tanpa batas (proyek, token, checkpoint, organisasi). */
export const LIST_LIMIT = 200;
