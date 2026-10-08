// Login CLI lewat browser (device code). CLI memegang deviceCode (hanya hash-nya yang disimpan); user melihat
// userCode di halaman persetujuan web. Token PAT (semua project) dibuat sekali saat CLI mengambil hasil persetujuan,
// sehingga token asli tidak pernah disalin manual dan tidak tersimpan di database.
import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { hashToken } from './agent-auth.js';
import { issueAgentToken } from './agent-token.js';

export const CLI_AUTH_TTL_MS = 10 * 60 * 1000;
/** Interval polling yang disarankan ke CLI (detik); polling lebih rapat dari separuhnya ditolak. */
export const CLI_AUTH_INTERVAL_SECONDS = 3;

// Tanpa huruf/angka yang mudah tertukar (0/O, 1/I).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateUserCode(): string {
  const pick = () => Array.from({ length: 4 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
  return `${pick()}-${pick()}`;
}

/** Normalisasi masukan user: huruf besar, tanpa spasi, tanda hubung di tengah. */
export function normalizeUserCode(input: string): string {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return compact.length === 8 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : input.trim().toUpperCase();
}

/** Nama perangkat dari CLI dibersihkan agar aman ditampilkan dan disimpan sebagai nama token. */
export function sanitizeClientName(raw: unknown): string {
  const cleaned = String(raw ?? '').replace(/[^\p{L}\p{N} ._@-]/gu, '').trim().slice(0, 60);
  return cleaned || 'CLI';
}

export async function startCliAuth(clientName: unknown) {
  // Bersihkan baris lama secara oportunistik agar tabel tetap kecil.
  await prisma.cliAuthRequest.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } } }).catch(() => undefined);

  const deviceCode = crypto.randomBytes(32).toString('hex');
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const row = await prisma.cliAuthRequest.create({
        data: {
          deviceCodeHash: hashToken(deviceCode),
          userCode: generateUserCode(),
          clientName: sanitizeClientName(clientName),
          expiresAt: new Date(Date.now() + CLI_AUTH_TTL_MS),
        },
      });
      return { deviceCode, userCode: row.userCode, expiresIn: CLI_AUTH_TTL_MS / 1000, interval: CLI_AUTH_INTERVAL_SECONDS };
    } catch (err) {
      if ((err as { code?: string })?.code !== 'P2002') throw err; // tabrakan userCode: coba kode lain
    }
  }
  throw new Error('Gagal membuat kode login CLI.');
}

export type PollResult =
  | { state: 'pending' }
  | { state: 'slow_down' }
  | { state: 'denied' }
  | { state: 'expired' }
  | { state: 'approved'; token: string; tokenId: string; userId: string; expiresAt: Date | null };

/**
 * Hasil persetujuan untuk CLI. Token dibuat tepat sekali: transisi approved -> consumed bersifat atomik,
 * jadi polling ganda tidak menghasilkan dua token (yang kedua mendapat 'expired').
 */
export async function pollCliAuth(deviceCode: string): Promise<PollResult> {
  const row = await prisma.cliAuthRequest.findUnique({ where: { deviceCodeHash: hashToken(deviceCode) } });
  if (!row || row.status === 'consumed') return { state: 'expired' };
  if (row.expiresAt.getTime() <= Date.now()) return { state: 'expired' };
  if (row.status === 'denied') return { state: 'denied' };
  if (row.status === 'pending') {
    if (row.lastPolledAt && Date.now() - row.lastPolledAt.getTime() < (CLI_AUTH_INTERVAL_SECONDS * 1000) / 2) {
      return { state: 'slow_down' };
    }
    await prisma.cliAuthRequest.update({ where: { id: row.id }, data: { lastPolledAt: new Date() } });
    return { state: 'pending' };
  }

  // approved
  if (!row.userId) return { state: 'expired' };
  const claimed = await prisma.cliAuthRequest.updateMany({ where: { id: row.id, status: 'approved' }, data: { status: 'consumed' } });
  if (claimed.count !== 1) return { state: 'expired' };
  const { token, record } = await issueAgentToken({ userId: row.userId, name: `CLI: ${row.clientName}` });
  return { state: 'approved', token, tokenId: record.id, userId: row.userId, expiresAt: record.expiresAt };
}

export type CliAuthInfo = { userCode: string; clientName: string; status: string; expiresAt: Date; expired: boolean };

export async function describeCliAuth(code: string): Promise<CliAuthInfo | null> {
  const row = await prisma.cliAuthRequest.findUnique({ where: { userCode: normalizeUserCode(code) } });
  if (!row) return null;
  return { userCode: row.userCode, clientName: row.clientName, status: row.status, expiresAt: row.expiresAt, expired: row.expiresAt.getTime() <= Date.now() };
}

/** Setujui atau tolak permintaan yang masih pending dan belum kedaluwarsa. Mengembalikan null bila tidak bisa diproses. */
export async function resolveCliAuth(code: string, userId: string, decision: 'approved' | 'denied') {
  const userCode = normalizeUserCode(code);
  const result = await prisma.cliAuthRequest.updateMany({
    where: { userCode, status: 'pending', expiresAt: { gt: new Date() } },
    data: { status: decision, userId, approvedAt: decision === 'approved' ? new Date() : null },
  });
  if (result.count !== 1) return null;
  return prisma.cliAuthRequest.findUnique({ where: { userCode } });
}
