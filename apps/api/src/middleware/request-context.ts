// Request id per permintaan (header X-Request-Id) dan access log terstruktur.
import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

declare global {
   
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Pakai request id dari proxy bila bentuknya aman (cegah injeksi log), selain itu buat baru. */
export function resolveRequestId(incoming: unknown): string {
  return typeof incoming === 'string' && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID();
}

// Probe kesehatan tidak perlu memenuhi log.
const QUIET_PATHS = new Set(['/api/health', '/health']);

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const requestId = resolveRequestId(req.headers['x-request-id']);
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const path = req.originalUrl.split('?')[0];
    if (QUIET_PATHS.has(path)) return;
    const durationMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]('http_request', {
      requestId,
      method: req.method,
      path,
      status: res.statusCode,
      durationMs,
      userId: req.userId,
      ip: req.ip,
    });
  });
  next();
}
