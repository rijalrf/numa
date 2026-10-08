// Pembuatan PAT agent. Dipakai halaman profil (token universal), token per project, dan login CLI lewat browser.
import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { hashToken } from './agent-auth.js';

export const DEFAULT_TOKEN_TTL_DAYS = 90;
const MAX_TOKEN_TTL_DAYS = 365;

/** Masa berlaku token dalam hari: default 90, dibatasi 1..365. */
export function resolveExpiry(raw: unknown): Date {
  const days = Number(raw);
  const clamped = Number.isFinite(days) && days >= 1 ? Math.min(Math.floor(days), MAX_TOKEN_TTL_DAYS) : DEFAULT_TOKEN_TTL_DAYS;
  return new Date(Date.now() + clamped * 24 * 60 * 60 * 1000);
}

/** Token baru; teks aslinya hanya dikembalikan di sini dan tidak pernah disimpan (hanya sha256). */
export async function issueAgentToken(args: {
  userId: string;
  name: string;
  /** true = semua project pemilik; false = hanya `projectId`. */
  allProjects: boolean;
  projectId?: string;
  expiresInDays?: unknown;
}) {
  const token = 'numa_' + crypto.randomBytes(24).toString('hex');
  const record = await prisma.agentToken.create({
    data: {
      userId: args.userId,
      name: args.name,
      tokenHash: hashToken(token),
      allProjects: args.allProjects,
      expiresAt: resolveExpiry(args.expiresInDays),
      ...(args.allProjects || !args.projectId ? {} : { agentTokenScopes: { create: { projectId: args.projectId } } }),
    },
  });
  return { token, record };
}
