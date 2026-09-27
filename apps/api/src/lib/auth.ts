// Konfigurasi Better Auth dengan Prisma adapter.
// Instance auth dipakai di:
//  - server: toNodeHandler() untuk mount sebagai middleware sebelum express.json()
//  - web: createAuthClient() (lihat apps/web/src/lib/auth-client.ts)
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from './prisma.js';

// Ambil host dinamis dari BETTER_AUTH_URL jika ada
const dynamicHosts: string[] = [];
if (process.env.BETTER_AUTH_URL) {
  try {
    const host = new URL(process.env.BETTER_AUTH_URL).host;
    if (host) dynamicHosts.push(host);
  } catch {
    // Abaikan jika format URL tidak valid
  }
}

// Host yang diizinkan untuk multi-host (lokal, domain VPS lama & baru)
const allowedHosts = Array.from(
  new Set([
    'localhost:6655',
    'localhost:3455',
    '127.0.0.1:6655',
    '127.0.0.1:3455',
    'numa.mrijal.my.id',
    'numa.opendv.xyz',
    ...dynamicHosts,
  ]),
);

const isProd = process.env.NODE_ENV === 'production';
const fallbackBaseUrl =
  process.env.BETTER_AUTH_URL ??
  (isProd ? 'https://numa.opendv.xyz' : 'http://localhost:6655');

const defaultOrigins = [
  'http://localhost:3455',
  'https://numa.mrijal.my.id',
  'https://numa.opendv.xyz',
];
const customOrigins = (process.env.FE_URL ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const trustedOrigins = Array.from(new Set([...defaultOrigins, ...customOrigins]));

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  secret: process.env.BETTER_AUTH_SECRET,
  // Mendukung multi-host (akses via localhost:6655 atau via tunnel/domain publik)
  baseURL: {
    ...(isProd ? { protocol: 'https' as const } : {}),
    allowedHosts,
    fallback: fallbackBaseUrl,
  },
  trustedProxyHeaders: true,
  // FE_URL boleh berisi beberapa origin dipisah koma (lokal + domain publik).
  trustedOrigins,
  // Registrasi & login email dinonaktifkan secara default untuk mencegah user enumeration
  // dan unverified account creation. Hanya aktifkan jika ENABLE_EMAIL_AUTH=true (mis. untuk pengujian internal).
  emailAndPassword: {
    enabled: process.env.ENABLE_EMAIL_AUTH === 'true',
    autoSignIn: true,
  },
  // Login Google: satu-satunya metode yang ditampilkan di UI.
  // Redirect URI yang didaftarkan di Google Cloud Console:
  //   http://localhost:6655/api/auth/callback/google
  //   https://numa.mrijal.my.id/api/auth/callback/google
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google'],
    },
  },
  user: {
    additionalFields: {
      name: { type: 'string', required: false },
    },
  },
});

export type AuthInstance = typeof auth;
