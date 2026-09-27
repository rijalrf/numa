import { prisma } from './prisma.js';

export type PlanKey = 'free' | 'starter' | 'pro';

export interface PlanConfig {
  name: string;
  quotaMax: number;
  surveyRounds: number;
  charLimit: number;
  price: number;
}

export const PLANS: Record<PlanKey, PlanConfig> = {
  free: {
    name: 'Free Trial',
    quotaMax: 1,
    surveyRounds: 1,
    charLimit: 1000,
    price: 0,
  },
  starter: {
    name: 'Starter',
    quotaMax: 2,
    surveyRounds: 3,
    charLimit: 2000,
    price: 49000,
  },
  pro: {
    name: 'Pro',
    quotaMax: 5,
    surveyRounds: 4,
    charLimit: 4000,
    price: 129000,
  },
};

const PRESET_USER_TIERS: Record<string, PlanKey> = {
  'womevuhaza09@gmail.com': 'free',
  'obibutoheq339@gmail.com': 'starter',
  'ghostredarm@gmail.com': 'pro',
};

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
  if (user?.email && user.email in PRESET_USER_TIERS) {
    const targetPlan = PRESET_USER_TIERS[user.email];
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
