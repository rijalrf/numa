// Konfigurasi Better Auth dengan Prisma adapter.
// Instance auth dipakai di:
//  - server: toNodeHandler() untuk mount sebagai middleware sebelum express.json()
//  - web: createAuthClient() (lihat apps/web/src/lib/auth-client.ts)
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import { prisma } from './prisma.js';

import { FE_ORIGINS, getAllowedHosts, getPublicApiUrl, IS_PRODUCTION } from './config.js';

const allowedHosts = getAllowedHosts();

// SSO OIDC (kerangka F4.5): aktif hanya bila OIDC_ISSUER, OIDC_CLIENT_ID, dan OIDC_CLIENT_SECRET terisi.
// Redirect URI yang didaftarkan di IdP: <BETTER_AUTH_URL>/api/auth/oauth2/callback/oidc
const oidcIssuer = process.env.OIDC_ISSUER?.replace(/\/+$/, '');
const oidcEnabled = Boolean(oidcIssuer && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET);
// Menautkan akun OIDC ke akun yang sudah ada berdasarkan email hanya aman bila IdP memverifikasi email.
const oidcTrustEmail = process.env.OIDC_TRUST_EMAIL === 'true';
const trustedOrigins = FE_ORIGINS;

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  secret: process.env.BETTER_AUTH_SECRET,
  // Mendukung multi-host (akses via localhost:6655 atau via tunnel/domain publik)
  baseURL: {
    ...(IS_PRODUCTION ? { protocol: 'https' as const } : {}),
    allowedHosts,
    fallback: getPublicApiUrl(),
  },
  // Header proxy hanya dipercaya karena jumlah hop dibatasi di index.ts (TRUST_PROXY_HOPS).
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
  // Redirect URI yang didaftarkan di Google Cloud Console: <BETTER_AUTH_URL>/api/auth/callback/google
  // Didaftarkan hanya bila pasangan ID dan secret lengkap (divalidasi di lib/env.ts).
  socialProviders:
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } }
      : {},
  plugins: oidcEnabled
    ? [
        genericOAuth({
          config: [
            {
              providerId: 'oidc',
              discoveryUrl: `${oidcIssuer}/.well-known/openid-configuration`,
              clientId: process.env.OIDC_CLIENT_ID!,
              clientSecret: process.env.OIDC_CLIENT_SECRET!,
              scopes: (process.env.OIDC_SCOPES ?? 'openid email profile').split(/[\s,]+/).filter(Boolean),
              pkce: true,
            },
          ],
        }),
      ]
    : [],
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: oidcTrustEmail ? ['google', 'oidc'] : ['google'],
    },
  },
  user: {
    additionalFields: {
      name: { type: 'string', required: false },
    },
  },
});
