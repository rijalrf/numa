// Jejak audit aksi sensitif. Kegagalan mencatat tidak boleh menggagalkan aksi utama.
import { logger, serializeError } from './logger.js';
import type { Request } from 'express';
import { prisma } from './prisma.js';

export type AuditEntry = {
  action: string; // mis. token.revoke, task.force_complete
  actorType?: 'user' | 'agent' | 'system';
  actorUserId?: string | null;
  projectId?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  req?: Pick<Request, 'ip'>;
};

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        actorType: entry.actorType ?? 'user',
        actorUserId: entry.actorUserId ?? null,
        projectId: entry.projectId ?? null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: entry.metadata === undefined ? undefined : (entry.metadata as any),
        ip: entry.req?.ip ?? null,
      },
    });
  } catch (err) {
    logger.error('Gagal mencatat audit log', { scope: 'audit', error: serializeError(err) });
  }
}
