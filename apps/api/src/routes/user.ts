// Profil user, plan billing, dan onboarding.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { getUserPlan } from '../lib/billing.js';

export const userRouter = Router();

userRouter.get('/api/user/plan', requireUser, async (req: AuthedRequest, res) => {
  const { plan, config, subscription } = await getUserPlan(req.userId);
  res.json({
    plan,
    planName: config.name,
    quotaUsed: subscription.quotaUsed,
    quotaMax: config.quotaMax,
    surveyRounds: config.surveyRounds,
    charLimit: config.charLimit,
    price: config.price,
    expiresAt: subscription.expiresAt,
  });
});

// Ambil profil pengguna termasuk status onboarding
userRouter.get('/api/user/profile', requireUser, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: {
      id: true,
      name: true,
      email: true,
      codingExperience: true,
      referralSource: true,
      referralDetail: true,
      onboardingCompletedAt: true,
    },
  });
  if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });
  res.json({ user });
});

const OnboardingBody = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  codingExperience: z.enum(['pemula', 'menengah', 'mahir']).optional(),
  referralSource: z.enum(['google', 'media_sosial', 'teman', 'lainnya']).optional(),
  referralDetail: z.string().trim().max(200).optional(),
});

// Selesaikan onboarding pengguna
userRouter.post('/api/user/onboarding', requireUser, async (req: AuthedRequest, res) => {
  const parsed = OnboardingBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Data onboarding tidak valid.', detail: parsed.error.flatten() });
  }

  const { name, codingExperience, referralSource, referralDetail } = parsed.data;

  const updated = await prisma.user.update({
    where: { id: req.userId },
    data: {
      ...(name ? { name } : {}),
      ...(codingExperience ? { codingExperience } : {}),
      ...(referralSource ? { referralSource } : {}),
      ...(referralDetail ? { referralDetail } : {}),
      onboardingCompletedAt: new Date(),
    },
    select: {
      id: true,
      name: true,
      email: true,
      codingExperience: true,
      referralSource: true,
      referralDetail: true,
      onboardingCompletedAt: true,
    },
  });

  res.json({ ok: true, user: updated });
});

// Update profil pengguna (nama)
userRouter.patch('/api/user/profile', requireUser, async (req: AuthedRequest, res) => {
  const { name } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Nama tidak boleh kosong.' });
  }
  const updated = await prisma.user.update({
    where: { id: req.userId },
    data: { name: name.trim() },
    select: { id: true, name: true, email: true },
  });
  res.json({ ok: true, user: updated });
});
