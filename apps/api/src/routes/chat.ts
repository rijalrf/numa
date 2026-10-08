// Pintu masuk ide awal: satu request membuat project (tanpa panggilan AI).
import { logger, serializeError } from '../lib/logger.js';
import { Router } from 'express';
import { z } from 'zod';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { checkProjectLimit, getUserPlan } from '../lib/billing.js';
import { finalizeChatSession } from '../lib/ai/chat.js';

export const chatRouter = Router();

const FinalizeBodySchema = z.object({
  idea: z.string().trim().min(1),
});

chatRouter.post('/api/chat/finalize', requireUser, async (req: AuthedRequest, res) => {
  const parsed = FinalizeBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Ide aplikasi wajib diisi.' });

  const { config } = await getUserPlan(req.userId);
  if (parsed.data.idea.length > config.charLimit) {
    return res.status(400).json({
      error: `Ide terlalu panjang (${parsed.data.idea.length} karakter). Maksimal ${config.charLimit} karakter untuk paket ${config.name}.`,
    });
  }

  const limitCheck = await checkProjectLimit(req.userId);
  if (!limitCheck.allowed) {
    return res.status(403).json({
      error: `Batas jumlah proyek telah tercapai (maksimal ${limitCheck.quotaMax} proyek aktif untuk paket ${limitCheck.plan}). Silakan upgrade paket untuk membuat proyek baru.`,
      code: 'project_limit_reached',
      plan: limitCheck.plan,
      currentCount: limitCheck.currentCount,
      quotaMax: limitCheck.quotaMax,
      upgradeUrl: '/pricing',
    });
  }

  try {
    res.status(201).json(await finalizeChatSession(req.userId, parsed.data.idea));
  } catch (err) {
    logger.error('Gagal membuat project dari ide', { scope: 'chat/finalize', error: serializeError(err) });
    res.status(500).json({ error: 'Gagal membuat project.' });
  }
});
