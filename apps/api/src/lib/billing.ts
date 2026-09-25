import { prisma } from './prisma.js';

export type PlanKey = 'free' | 'starter' | 'pro';

export interface PlanConfig {
  name: string;
  quotaMax: number;
  chatLimit: number;
  charLimit: number;
  price: number;
}

export const PLANS: Record<PlanKey, PlanConfig> = {
  free: {
    name: 'Free Trial',
    quotaMax: 1,
    chatLimit: 10,
    charLimit: 1000,
    price: 0,
  },
  starter: {
    name: 'Starter',
    quotaMax: 2,
    chatLimit: 15,
    charLimit: 2000,
    price: 49000,
  },
  pro: {
    name: 'Pro',
    quotaMax: 6,
    chatLimit: 25,
    charLimit: 4000,
    price: 129000,
  },
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

export async function incrementQuota(userId: string): Promise<void> {
  await prisma.subscription.updateMany({
    where: { userId },
    data: { quotaUsed: { increment: 1 } },
  });
}
