// Observabilitas AI: metrics token & latensi.
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';

export const aiMetricsRouter = Router();

aiMetricsRouter.get('/api/projects/:id/ai-metrics', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const logs = await prisma.aiCallLog.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const totalCalls = logs.length;
  const totalTokens = logs.reduce((sum, l) => sum + l.totalTokens, 0);
  const inputTokens = logs.reduce((sum, l) => sum + l.inputTokens, 0);
  const outputTokens = logs.reduce((sum, l) => sum + l.outputTokens, 0);
  const avgLatencyMs = totalCalls > 0 ? Math.round(logs.reduce((sum, l) => sum + l.latencyMs, 0) / totalCalls) : 0;
  const successCount = logs.filter((l) => l.success).length;
  const successRate = totalCalls > 0 ? Math.round((successCount / totalCalls) * 100) : 100;

  // Breakdown per agent
  const agentMap = new Map<string, { calls: number; tokens: number; totalLatency: number; success: number }>();
  for (const l of logs) {
    const existing = agentMap.get(l.agentName) ?? { calls: 0, tokens: 0, totalLatency: 0, success: 0 };
    existing.calls += 1;
    existing.tokens += l.totalTokens;
    existing.totalLatency += l.latencyMs;
    if (l.success) existing.success += 1;
    agentMap.set(l.agentName, existing);
  }

  const byAgent = Array.from(agentMap.entries()).map(([agentName, data]) => ({
    agentName,
    calls: data.calls,
    tokens: data.tokens,
    avgLatencyMs: Math.round(data.totalLatency / data.calls),
    successRate: Math.round((data.success / data.calls) * 100),
  }));

  res.json({
    ok: true,
    summary: {
      totalCalls,
      totalTokens,
      inputTokens,
      outputTokens,
      avgLatencyMs,
      successRate,
    },
    byAgent,
    recentLogs: logs.slice(0, 20),
  });
});

aiMetricsRouter.get('/api/ai-metrics', requireUser, async (req: AuthedRequest, res) => {
  // Ambil semua project milik user
  const userProjects = await prisma.project.findMany({
    where: { userId: req.userId },
    select: { id: true },
  });
  const projectIds = userProjects.map((p) => p.id);

  const logs = await prisma.aiCallLog.findMany({
    where: {
      OR: [
        { projectId: { in: projectIds } },
        { projectId: null }, // log global
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const totalCalls = logs.length;
  const totalTokens = logs.reduce((sum, l) => sum + l.totalTokens, 0);
  const inputTokens = logs.reduce((sum, l) => sum + l.inputTokens, 0);
  const outputTokens = logs.reduce((sum, l) => sum + l.outputTokens, 0);
  const avgLatencyMs = totalCalls > 0 ? Math.round(logs.reduce((sum, l) => sum + l.latencyMs, 0) / totalCalls) : 0;
  const successCount = logs.filter((l) => l.success).length;
  const successRate = totalCalls > 0 ? Math.round((successCount / totalCalls) * 100) : 100;

  res.json({
    ok: true,
    summary: {
      totalCalls,
      totalTokens,
      inputTokens,
      outputTokens,
      avgLatencyMs,
      successRate,
    },
    recentLogs: logs.slice(0, 20),
  });
});
