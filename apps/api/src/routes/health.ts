// Health check & meta endpoints (public).
import { Router } from 'express';
import { toolsRegistry } from '../tools/registry.js';
import { prisma } from '../lib/prisma.js';
import { isJobWorkerRunning } from '../lib/ai/job.js';

export const healthRouter = Router();

healthRouter.get(['/health', '/api/health'], (_req, res) => {
  res.json({ ok: true });
});

// Liveness: proses hidup. Readiness: database terjangkau dan worker antrean aktif.
healthRouter.get(['/ready', '/api/ready'], async (_req, res) => {
  const checks = { database: false, worker: isJobWorkerRunning() };
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch {
    checks.database = false;
  }
  const ok = checks.database && checks.worker;
  res.status(ok ? 200 : 503).json({ ok, checks });
});

healthRouter.get('/api/tools', (_req, res) => {
  res.json({ tools: toolsRegistry });
});
