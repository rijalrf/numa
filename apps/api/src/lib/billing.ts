import { prisma } from './prisma.js';

export type PlanKey = 'free' | 'starter' | 'pro';

export interface PlanConfig {
  name: string;
  quotaMax: number;
  surveyRounds: number;
  charLimit: number;
  /** Batas total token AI per bulan kalender (UTC) untuk pemilik tagihan. 0 = tanpa batas. */
  monthlyTokenBudget: number;
  price: number;
}

// Default budget bisa ditimpa lewat env AI_TOKEN_BUDGET_FREE / _STARTER / _PRO (0 = tanpa batas).
export function tokenBudget(plan: 'FREE' | 'STARTER' | 'PRO', fallback: number): number {
  const raw = process.env[`AI_TOKEN_BUDGET_${plan}`];
  const parsed = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const PLANS: Record<PlanKey, PlanConfig> = {
  free: {
    name: 'Free Trial',
    quotaMax: 1,
    surveyRounds: 1,
    charLimit: 1000,
    monthlyTokenBudget: tokenBudget('FREE', 300_000),
    price: 0,
  },
  starter: {
    name: 'Starter',
    quotaMax: 2,
    surveyRounds: 3,
    charLimit: 2000,
    monthlyTokenBudget: tokenBudget('STARTER', 3_000_000),
    price: 49000,
  },
  pro: {
    name: 'Pro',
    quotaMax: 5,
    surveyRounds: 4,
    charLimit: 4000,
    monthlyTokenBudget: tokenBudget('PRO', 10_000_000),
    price: 129000,
  },
};

// Override paket manual untuk akun internal/uji, via env ADMIN_PLAN_OVERRIDES="email:plan,email:plan".
// Tidak ada email atau paket yang tertulis di kode sumber.
function parsePlanOverrides(raw: string | undefined): Record<string, PlanKey> {
  const result: Record<string, PlanKey> = {};
  for (const pair of (raw ?? '').split(',')) {
    const [email, plan] = pair.split(':').map((v) => v.trim().toLowerCase());
    if (email && plan && plan in PLANS) result[email] = plan as PlanKey;
  }
  return result;
}

const PLAN_OVERRIDES = parsePlanOverrides(process.env.ADMIN_PLAN_OVERRIDES);

// ponytail: Lazy-init subscription pada first-access. Upgrade ke webhook pendaftaran jika auth flow butuh explicit provisioning.
export async function getUserPlan(userId: string): Promise<{
  plan: PlanKey;
  config: PlanConfig;
  subscription: { id: string; userId: string; plan: string; quotaUsed: number; quotaMax: number; expiresAt: Date | null };
}> {
  let sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub) {
    sub = await prisma.subscription.create({
      data: {
        userId,
        plan: 'free',
        quotaUsed: 0,
        quotaMax: PLANS.free.quotaMax,
      },
    });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const overrideKey = user?.email?.toLowerCase();
  if (overrideKey && overrideKey in PLAN_OVERRIDES) {
    const targetPlan = PLAN_OVERRIDES[overrideKey];
    if (sub.plan !== targetPlan) {
      sub = await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          plan: targetPlan,
          quotaMax: PLANS[targetPlan].quotaMax,
          expiresAt: targetPlan === 'free' ? null : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      });
    }
  }

  const now = new Date();
  if (sub.expiresAt && sub.expiresAt < now && sub.plan !== 'free') {
    sub = await prisma.subscription.update({
      where: { id: sub.id },
      data: { plan: 'free', quotaMax: PLANS.free.quotaMax },
    });
  }

  const planKey = (sub.plan in PLANS ? sub.plan : 'free') as PlanKey;
  return {
    plan: planKey,
    config: PLANS[planKey],
    subscription: sub,
  };
}

export async function checkQuota(userId: string): Promise<{
  allowed: boolean;
  plan: PlanKey;
  quotaUsed: number;
  quotaMax: number;
}> {
  const { plan, config, subscription } = await getUserPlan(userId);
  const allowed = subscription.quotaUsed < config.quotaMax;
  return {
    allowed,
    plan,
    quotaUsed: subscription.quotaUsed,
    quotaMax: config.quotaMax,
  };
}

export async function checkProjectLimit(userId: string): Promise<{
  allowed: boolean;
  plan: PlanKey;
  currentCount: number;
  quotaMax: number;
}> {
  const { plan, config } = await getUserPlan(userId);
  const currentCount = await prisma.project.count({
    where: { userId, status: 'ACTIVE' },
  });
  return {
    allowed: currentCount < config.quotaMax,
    plan,
    currentCount,
    quotaMax: config.quotaMax,
  };
}

export async function incrementQuota(userId: string): Promise<void> {
  await prisma.subscription.updateMany({
    where: { userId },
    data: { quotaUsed: { increment: 1 } },
  });
}
