// Agregasi pemakaian AI untuk dashboard admin platform. Seluruh penjumlahan dilakukan di database.
import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { PLANS, type PlanKey } from './billing.js';
import { estimateCost, getAiPricing, percentile, type AiPricing, type TokenUsage } from './pricing.js';
import { monthStart } from './ai-budget.js';

export type UsageRange = { from: Date; to: Date };

const MAX_RANGE_DAYS = 366;

/** Baca filter from/to (ISO 8601). Default: awal bulan berjalan (UTC) sampai sekarang. */
export function parseRange(query: { from?: unknown; to?: unknown }, now = new Date()): UsageRange {
  const parse = (v: unknown): Date | null => {
    if (typeof v !== 'string' || v.trim() === '') return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const from = parse(query.from) ?? monthStart(now);
  const to = parse(query.to) ?? now;
  if (from >= to) throw Object.assign(new Error('Tanggal "from" harus lebih awal dari "to".'), { rangeError: true });
  if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
    throw Object.assign(new Error(`Rentang maksimal ${MAX_RANGE_DAYS} hari.`), { rangeError: true });
  }
  return { from, to };
}

function whereRange(range: UsageRange): Prisma.AiCallLogWhereInput {
  return { createdAt: { gte: range.from, lt: range.to } };
}

type Totals = { calls: number; success: number; inputTokens: number; outputTokens: number; totalTokens: number; latencyMs: number; estimatedCalls: number };

const emptyTotals = (): Totals => ({ calls: 0, success: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, latencyMs: 0, estimatedCalls: 0 });

type Row = {
  tier: string | null;
  success: boolean;
  estimated: boolean;
  _count: { _all: number };
  _sum: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; latencyMs: number | null };
};

function addRow(t: Totals, r: Row) {
  const n = r._count._all;
  t.calls += n;
  if (r.success) t.success += n;
  if (r.estimated) t.estimatedCalls += n;
  t.inputTokens += r._sum.inputTokens ?? 0;
  t.outputTokens += r._sum.outputTokens ?? 0;
  t.totalTokens += r._sum.totalTokens ?? 0;
  t.latencyMs += r._sum.latencyMs ?? 0;
}

function toUsages(rows: Row[]): TokenUsage[] {
  return rows.map((r) => ({ tier: r.tier, inputTokens: r._sum.inputTokens ?? 0, outputTokens: r._sum.outputTokens ?? 0 }));
}

function finish(t: Totals, rows: Row[], pricing: AiPricing) {
  return {
    calls: t.calls,
    successCalls: t.success,
    failedCalls: t.calls - t.success,
    successRate: t.calls > 0 ? Math.round((t.success / t.calls) * 100) : 100,
    inputTokens: t.inputTokens,
    outputTokens: t.outputTokens,
    totalTokens: t.totalTokens,
    avgLatencyMs: t.calls > 0 ? Math.round(t.latencyMs / t.calls) : 0,
    estimatedCalls: t.estimatedCalls,
    costRupiah: estimateCost(toUsages(rows), pricing),
  };
}

const SUMS = { inputTokens: true as const, outputTokens: true as const, totalTokens: true as const, latencyMs: true as const };

export async function usageSummary(range: UsageRange) {
  const pricing = getAiPricing();
  const rawRows = await prisma.aiCallLog.groupBy({
    by: ['tier', 'success', 'estimated'],
    where: whereRange(range),
    _count: { _all: true },
    _sum: SUMS,
  });
  const rows = rawRows as unknown as Row[];
  const t = emptyTotals();
  rows.forEach((r) => addRow(t, r));
  return { range: { from: range.from.toISOString(), to: range.to.toISOString() }, pricingConfigured: pricingStatus(pricing), ...finish(t, rows, pricing) };
}

export function pricingStatus(pricing: AiPricing) {
  return { reasoning: pricing.reasoning !== null, cheap: pricing.cheap !== null };
}

export async function usageTimeseries(range: UsageRange) {
  const pricing = getAiPricing();
  const rows = await prisma.$queryRaw<
    { day: Date; tier: string | null; calls: bigint; input: bigint | null; output: bigint | null; total: bigint | null }[]
  >(Prisma.sql`
    SELECT date_trunc('day', "createdAt") AS day, "tier",
           COUNT(*) AS calls, SUM("inputTokens") AS input, SUM("outputTokens") AS output, SUM("totalTokens") AS total
    FROM "AiCallLog"
    WHERE "createdAt" >= ${range.from} AND "createdAt" < ${range.to}
    GROUP BY 1, 2
    ORDER BY 1`);
  const byDay = new Map<string, { calls: number; totalTokens: number; usages: TokenUsage[] }>();
  for (const r of rows) {
    const key = r.day.toISOString().slice(0, 10);
    const e = byDay.get(key) ?? { calls: 0, totalTokens: 0, usages: [] };
    e.calls += Number(r.calls);
    e.totalTokens += Number(r.total ?? 0);
    e.usages.push({ tier: r.tier, inputTokens: Number(r.input ?? 0), outputTokens: Number(r.output ?? 0) });
    byDay.set(key, e);
  }
  return {
    interval: 'day' as const,
    points: [...byDay.entries()].map(([date, e]) => ({ date, calls: e.calls, totalTokens: e.totalTokens, costRupiah: estimateCost(e.usages, pricing) })),
  };
}

export async function usageByAgent(range: UsageRange) {
  const pricing = getAiPricing();
  const rawRows = await prisma.aiCallLog.groupBy({
    by: ['agentName', 'promptVersion', 'tier', 'success', 'estimated'],
    where: whereRange(range),
    _count: { _all: true },
    _sum: SUMS,
  });
  const rows = rawRows as unknown as (Row & { agentName: string; promptVersion: string | null })[];
  // Dipisah per versi prompt agar dampak perubahan prompt terhadap token terlihat (versi null = data lama).
  const groups = new Map<string, { agentName: string; promptVersion: string | null; t: Totals; rows: Row[] }>();
  for (const r of rows) {
    const key = `${r.agentName}|${r.promptVersion ?? ''}`;
    const g = groups.get(key) ?? { agentName: r.agentName, promptVersion: r.promptVersion, t: emptyTotals(), rows: [] };
    addRow(g.t, r);
    g.rows.push(r);
    groups.set(key, g);
  }
  const items = [...groups.values()].map((g) => ({
    agentName: g.agentName,
    promptVersion: g.promptVersion,
    ...finish(g.t, g.rows, pricing),
    avgInputTokens: g.t.calls > 0 ? Math.round(g.t.inputTokens / g.t.calls) : 0,
    avgOutputTokens: g.t.calls > 0 ? Math.round(g.t.outputTokens / g.t.calls) : 0,
  }));
  items.sort((a, b) => b.totalTokens - a.totalTokens);
  return { items };
}

type UserAgg = { userId: string | null; t: Totals; rows: Row[] };

async function aggregateByUser(range: UsageRange, pricing: AiPricing) {
  const rawRows = await prisma.aiCallLog.groupBy({
    by: ['userId', 'tier', 'success', 'estimated'],
    where: whereRange(range),
    _count: { _all: true },
    _sum: SUMS,
  });
  const rows = rawRows as unknown as (Row & { userId: string | null })[];
  const map = new Map<string, UserAgg>();
  for (const r of rows) {
    const key = r.userId ?? '';
    const g = map.get(key) ?? { userId: r.userId, t: emptyTotals(), rows: [] };
    addRow(g.t, r);
    g.rows.push(r);
    map.set(key, g);
  }
  const ids = [...map.values()].map((g) => g.userId).filter((id): id is string => id !== null);
  const [users, subs, projectCounts] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, name: true } }),
    prisma.subscription.findMany({ where: { userId: { in: ids } }, select: { userId: true, plan: true, expiresAt: true } }),
    prisma.project.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _count: { _all: true } }),
  ]);
  const userMap = new Map(users.map((u) => [u.id, u]));
  const projectMap = new Map(projectCounts.map((p) => [p.userId, p._count._all]));
  const now = Date.now();
  const planMap = new Map<string, PlanKey>(
    subs.map((s) => {
      const expired = s.expiresAt !== null && s.expiresAt.getTime() < now && s.plan !== 'free';
      const key = (!expired && s.plan in PLANS ? s.plan : 'free') as PlanKey;
      return [s.userId, key];
    }),
  );
  return [...map.values()].map((g) => {
    const u = g.userId ? userMap.get(g.userId) : undefined;
    return {
      userId: g.userId,
      email: u?.email ?? null,
      name: u?.name ?? null,
      plan: (g.userId ? planMap.get(g.userId) ?? 'free' : null) as PlanKey | null,
      projectCount: g.userId ? projectMap.get(g.userId) ?? 0 : 0,
      ...finish(g.t, g.rows, pricing),
    };
  });
}

export async function usageByUser(range: UsageRange, page: number, pageSize: number) {
  const pricing = getAiPricing();
  const all = await aggregateByUser(range, pricing);
  all.sort((a, b) => b.totalTokens - a.totalTokens);
  const start = (page - 1) * pageSize;
  return { page, pageSize, total: all.length, items: all.slice(start, start + pageSize) };
}

export async function usageByPlan(range: UsageRange) {
  const pricing = getAiPricing();
  const users = await aggregateByUser(range, pricing);

  // Total token per project, dipetakan ke paket pemiliknya.
  const perProject = await prisma.aiCallLog.groupBy({
    by: ['projectId'],
    where: { ...whereRange(range), projectId: { not: null } },
    _sum: { totalTokens: true },
  });
  const projectOwners = await prisma.project.findMany({
    where: { id: { in: perProject.map((p) => p.projectId).filter((id): id is string => id !== null) } },
    select: { id: true, userId: true },
  });
  const planByUser = new Map(users.filter((u) => u.userId).map((u) => [u.userId as string, u.plan ?? 'free']));
  const ownerByProject = new Map(projectOwners.map((p) => [p.id, p.userId]));
  const projectTokensByPlan = new Map<PlanKey, number[]>();
  for (const p of perProject) {
    const owner = p.projectId ? ownerByProject.get(p.projectId) : undefined;
    const plan = (owner ? planByUser.get(owner) : undefined) ?? 'free';
    const arr = projectTokensByPlan.get(plan) ?? [];
    arr.push(p._sum.totalTokens ?? 0);
    projectTokensByPlan.set(plan, arr);
  }

  const items = (Object.keys(PLANS) as PlanKey[]).map((plan) => {
    const group = users.filter((u) => u.userId && u.plan === plan);
    const tokens = group.map((u) => u.totalTokens);
    const costs = group.map((u) => u.costRupiah);
    const costKnown = costs.every((c) => c !== null);
    const totalCost = costKnown ? costs.reduce<number>((s, c) => s + (c ?? 0), 0) : null;
    const avgCost = totalCost !== null && group.length > 0 ? Math.round(totalCost / group.length) : null;
    const cfg = PLANS[plan];
    const projectTokens = projectTokensByPlan.get(plan) ?? [];
    return {
      plan,
      planName: cfg.name,
      price: cfg.price,
      monthlyTokenBudget: cfg.monthlyTokenBudget,
      activeUsers: group.length,
      totalTokens: tokens.reduce((s, n) => s + n, 0),
      perUser: {
        avg: group.length > 0 ? Math.round(tokens.reduce((s, n) => s + n, 0) / group.length) : 0,
        median: percentile(tokens, 0.5),
        p90: percentile(tokens, 0.9),
        max: tokens.length > 0 ? Math.max(...tokens) : 0,
      },
      perProject: {
        projects: projectTokens.length,
        avg: projectTokens.length > 0 ? Math.round(projectTokens.reduce((s, n) => s + n, 0) / projectTokens.length) : 0,
        median: percentile(projectTokens, 0.5),
        p90: percentile(projectTokens, 0.9),
        max: projectTokens.length > 0 ? Math.max(...projectTokens) : 0,
      },
      totalCostRupiah: totalCost,
      avgCostPerUserRupiah: avgCost,
      // Margin kasar per user per periode: harga paket dikurangi rata-rata biaya AI. Null bila harga AI belum diatur.
      grossMarginPerUserRupiah: avgCost === null ? null : cfg.price - avgCost,
    };
  });
  return { items };
}
