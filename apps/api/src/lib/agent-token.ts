// Pembuatan PAT agent. Satu-satunya jalur pembuatan adalah login CLI lewat browser (lib/cli-auth.ts).
import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { hashToken } from './agent-auth.js';

const TOKEN_TTL_DAYS = 90;

/** Token baru; teks aslinya hanya dikembalikan di sini dan tidak pernah disimpan (hanya sha256). */
export async function issueAgentToken(args: {
  userId: string;
  name: string;
}) {
  const token = 'numa_' + crypto.randomBytes(24).toString('hex');
  const record = await prisma.agentToken.create({
    data: {
      userId: args.userId,
      name: args.name,
      tokenHash: hashToken(token),
      allProjects: true,
      expiresAt: new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  return { token, record };
}
