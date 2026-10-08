// Validasi environment variable saat start. Fungsi murni agar mudah diuji;
// env-check.ts yang memanggilnya dan menghentikan proses bila ada kesalahan.
export type EnvReport = { errors: string[]; warnings: string[] };

const PLACEHOLDER_SECRETS = new Set(['changeme', 'change-me', 'secret', 'your-secret', 'isi-dengan-secret']);

function filled(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function checkNonNegativeInt(env: NodeJS.ProcessEnv, name: string, errors: string[]) {
  const raw = env[name];
  if (!filled(raw)) return;
  if (!/^\d+$/.test(raw.trim())) errors.push(`${name} harus berupa bilangan bulat tidak negatif (nilai sekarang: "${raw}").`);
}

export function validateEnv(env: NodeJS.ProcessEnv = process.env): EnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProd = env.NODE_ENV === 'production';

  if (!filled(env.DATABASE_URL)) errors.push('DATABASE_URL wajib diisi.');
  else if (!/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) errors.push('DATABASE_URL harus diawali postgresql://.');

  const secret = env.BETTER_AUTH_SECRET;
  if (!filled(secret)) {
    (isProd ? errors : warnings).push('BETTER_AUTH_SECRET belum diisi.');
  } else if (isProd && (secret.length < 32 || PLACEHOLDER_SECRETS.has(secret.toLowerCase()))) {
    errors.push('BETTER_AUTH_SECRET terlalu lemah: minimal 32 karakter dan bukan nilai contoh (gunakan: openssl rand -hex 32).');
  }

  if (isProd) {
    if (!filled(env.BETTER_AUTH_URL)) errors.push('BETTER_AUTH_URL wajib diisi di produksi.');
    else if (!isUrl(env.BETTER_AUTH_URL)) errors.push('BETTER_AUTH_URL bukan URL yang valid.');
    if (!filled(env.FE_URL)) errors.push('FE_URL wajib diisi di produksi.');
    if (!filled(env.OPENAI_API_KEY)) errors.push('OPENAI_API_KEY wajib diisi di produksi.');
  }

  const googleId = filled(env.GOOGLE_CLIENT_ID);
  const googleSecret = filled(env.GOOGLE_CLIENT_SECRET);
  if (googleId !== googleSecret) errors.push('GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET harus diisi berpasangan.');

  const oidcParts = [env.OIDC_ISSUER, env.OIDC_CLIENT_ID, env.OIDC_CLIENT_SECRET].filter(filled).length;
  if (oidcParts > 0 && oidcParts < 3) errors.push('OIDC_ISSUER, OIDC_CLIENT_ID, dan OIDC_CLIENT_SECRET harus diisi bersamaan.');
  if (filled(env.OIDC_ISSUER) && !isUrl(env.OIDC_ISSUER)) errors.push('OIDC_ISSUER bukan URL yang valid.');

  if (!(googleId && googleSecret) && oidcParts < 3 && env.ENABLE_EMAIL_AUTH !== 'true') {
    warnings.push('Tidak ada metode login yang aktif (Google, OIDC, atau ENABLE_EMAIL_AUTH).');
  }

  for (const name of [
    'PORT',
    'AI_JOB_CONCURRENCY',
    'AI_MAX_ACTIVE_JOBS_PER_USER',
    'AI_TOKEN_BUDGET_FREE',
    'AI_TOKEN_BUDGET_STARTER',
    'AI_TOKEN_BUDGET_PRO',
    'TRUST_PROXY_HOPS',
  ]) {
    checkNonNegativeInt(env, name, errors);
  }

  for (const name of [
    'AI_PRICE_INPUT_PER_MTOK_REASONING',
    'AI_PRICE_OUTPUT_PER_MTOK_REASONING',
    'AI_PRICE_INPUT_PER_MTOK_CHEAP',
    'AI_PRICE_OUTPUT_PER_MTOK_CHEAP',
  ]) {
    const raw = env[name];
    if (filled(raw) && !(Number.isFinite(Number(raw)) && Number(raw) >= 0)) {
      errors.push(`${name} harus berupa angka tidak negatif (rupiah per 1 juta token).`);
    }
  }

  if (isProd && !filled(env.MAYAR_API_KEY)) {
    warnings.push('MAYAR_API_KEY belum diisi: pembayaran dinonaktifkan.');
  } else if (isProd && !filled(env.MAYAR_WEBHOOK_TOKEN)) {
    warnings.push('MAYAR_WEBHOOK_TOKEN belum diisi: webhook pembayaran ditolak sehingga paket hanya aktif lewat sinkronisasi manual.');
  }
  if (!filled(env.PLATFORM_ADMIN_EMAILS)) {
    warnings.push('PLATFORM_ADMIN_EMAILS belum diisi: halaman admin tidak dapat diakses siapa pun.');
  }

  return { errors, warnings };
}
