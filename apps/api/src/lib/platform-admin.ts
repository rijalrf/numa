// Admin platform ditentukan lewat env PLATFORM_ADMIN_EMAILS (daftar email dipisah koma).
export function parseAdminEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPlatformAdmin(email: string | null | undefined, raw: string | undefined = process.env.PLATFORM_ADMIN_EMAILS): boolean {
  if (!email) return false;
  return parseAdminEmails(raw).has(email.toLowerCase());
}
