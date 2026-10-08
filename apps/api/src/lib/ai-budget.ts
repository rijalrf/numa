// Budget token AI bulanan per pemilik tagihan (Project.userId), mengikuti paket langganannya.
import { prisma } from './prisma.js';
import { getUserPlan } from './billing.js';

export class AiBudgetExceededError extends Error {
  constructor(public used: number, public limit: number) {
    super(`Budget token AI bulan ini telah habis (${used.toLocaleString('id-ID')} dari ${limit.toLocaleString('id-ID')}). Upgrade paket atau tunggu awal bulan berikutnya.`);
    this.name = 'AiBudgetExceededError';
  }
}

export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function isOverBudget(used: number, limit: number): boolean {
  return limit > 0 && used >= limit;
}

type Tenant = { userId: string };

const TENANT_TTL_MS = 5 * 60_000;
const USAGE_TTL_MS = 30_000;
const tenantCache = new Map<string, { value: Tenant | null; at: number }>();
const usageCache = new Map<string, { used: number; limit: number; at: number }>();

/** Pemilik tagihan dari sebuah project (di-cache singkat). */
export async function resolveTenant(projectId: string | undefined | null): Promise<Tenant | null> {
  if (!projectId) return null;
  const cached = tenantCache.get(projectId);
  if (cached && Date.now() - cached.at < TENANT_TTL_MS) return cached.value;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } });
  const value = project ? { userId: project.userId } : null;
  tenantCache.set(projectId, { value, at: Date.now() });
  return value;
}

export async function getMonthlyUsage(userId: string): Promise<{ used: number; limit: number }> {
  const cached = usageCache.get(userId);
  if (cached && Date.now() - cached.at < USAGE_TTL_MS) return cached;
  const [{ config }, agg] = await Promise.all([
    getUserPlan(userId),
    prisma.aiCallLog.aggregate({
      _sum: { totalTokens: true },
      where: { userId, createdAt: { gte: monthStart() } },
    }),
  ]);
  const entry = { used: agg._sum.totalTokens ?? 0, limit: config.monthlyTokenBudget, at: Date.now() };
  usageCache.set(userId, entry);
  return entry;
}

/** Lempar AiBudgetExceededError bila pemilik project sudah melewati budget bulanan. Tanpa projectId: tidak dibatasi. */
export async function assertAiBudget(projectId: string | undefined | null): Promise<void> {
  const tenant = await resolveTenant(projectId);
  if (!tenant) return;
  const { used, limit } = await getMonthlyUsage(tenant.userId);
  if (isOverBudget(used, limit)) throw new AiBudgetExceededError(used, limit);
}
