// Observabilitas AI: metrik token dan latensi per project dan per akun. Agregasi dilakukan di database.
import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { projectWhere } from '../lib/access.js';
import { prisma } from '../lib/prisma.js';
import { getMonthlyUsage, monthStart } from '../lib/ai-budget.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';

export const aiMetricsRouter = Router();

// Ringkasan pemakaian token AI bulan berjalan untuk akun yang login (sebagai pemilik tagihan).
aiMetricsRouter.get('/api/usage/ai', requireUser, async (req: AuthedRequest, res) => {
  const { used, limit } = await getMonthlyUsage(req.userId);
  res.json({
    periodStart: monthStart().toISOString(),
    usedTokens: used,
    limitTokens: limit,
    unlimited: limit === 0,
    remainingTokens: limit === 0 ? null : Math.max(0, limit - used),
  });
});

async function summarize(where: Prisma.AiCallLogWhereInput) {
  const [agg, successCount] = await Promise.all([
    prisma.aiCallLog.aggregate({
      where,
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true, totalTokens: true },
      _avg: { latencyMs: true },
    }),
    prisma.aiCallLog.count({ where: { ...where, success: true } }),
  ]);
  const totalCalls = agg._count._all;
  return {
    totalCalls,
    totalTokens: agg._sum.totalTokens ?? 0,
    inputTokens: agg._sum.inputTokens ?? 0,
    outputTokens: agg._sum.outputTokens ?? 0,
    avgLatencyMs: Math.round(agg._avg.latencyMs ?? 0),
    successRate: totalCalls > 0 ? Math.round((successCount / totalCalls) * 100) : 100,
  };
}

const recentLogs = (where: Prisma.AiCallLogWhereInput) =>
  prisma.aiCallLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 20 });

aiMetricsRouter.get('/api/projects/:id/ai-metrics', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({ where: projectWhere(req.userId, req.params.id) });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const where: Prisma.AiCallLogWhereInput = { projectId: project.id };
  const [summary, perAgent, perAgentSuccess, logs] = await Promise.all([
    summarize(where),
    prisma.aiCallLog.groupBy({
      by: ['agentName'],
      where,
      _count: { _all: true },
      _sum: { totalTokens: true },
      _avg: { latencyMs: true },
    }),
    prisma.aiCallLog.groupBy({ by: ['agentName'], where: { ...where, success: true }, _count: { _all: true } }),
    recentLogs(where),
  ]);
  const successByAgent = new Map(perAgentSuccess.map((r) => [r.agentName, r._count._all]));
  const byAgent = perAgent.map((r) => ({
    agentName: r.agentName,
    calls: r._count._all,
    tokens: r._sum.totalTokens ?? 0,
    avgLatencyMs: Math.round(r._avg.latencyMs ?? 0),
    successRate: Math.round(((successByAgent.get(r.agentName) ?? 0) / r._count._all) * 100),
  }));

  res.json({ ok: true, summary, byAgent, recentLogs: logs });
});

aiMetricsRouter.get('/api/ai-metrics', requireUser, async (req: AuthedRequest, res) => {
  const userProjects = await prisma.project.findMany({ where: projectWhere(req.userId), select: { id: true } });
  // Hanya log milik project user. Log tanpa projectId tidak bisa diatribusikan ke tenant tertentu.
  const where: Prisma.AiCallLogWhereInput = { projectId: { in: userProjects.map((p) => p.id) } };
  const [summary, logs] = await Promise.all([summarize(where), recentLogs(where)]);
  res.json({ ok: true, summary, recentLogs: logs });
});
