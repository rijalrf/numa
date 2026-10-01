// Chat brainstorm sebelum project dibuat.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { checkProjectLimit, getUserPlan } from '../lib/billing.js';
import { finalizeChatSession, postFinalizeProject } from '../lib/ai/chat.js';
import { startAiJob } from '../lib/ai/job.js';

export const chatRouter = Router();

const ChatMessageBodySchema = z.object({
  content: z.string().min(1),
  formAnswers: z.record(z.string(), z.string()).optional(), // jawaban form yang sudah diserialkan jadi teks
});

chatRouter.post('/api/chat/sessions', requireUser, async (req: AuthedRequest, res) => {
  const session = await prisma.chatSession.create({
    data: { userId: req.userId },
  });
  res.status(201).json({ sessionId: session.id });
});

chatRouter.get('/api/chat/sessions/:id/messages', requireUser, async (req: AuthedRequest, res) => {
  const session = await prisma.chatSession.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!session) return res.status(404).json({ error: 'Sesi chat tidak ditemukan.' });
  res.json({ messages: session.messages });
});

chatRouter.post('/api/chat/sessions/:id/messages', requireUser, async (req: AuthedRequest, res) => {
  const parsed = ChatMessageBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data tidak valid.' });

  const session = await prisma.chatSession.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!session) return res.status(404).json({ error: 'Sesi chat tidak ditemukan.' });

  const { plan, config } = await getUserPlan(req.userId);

  if (parsed.data.content.length > config.charLimit) {
    return res.status(400).json({
      error: `Pesan terlalu panjang (${parsed.data.content.length} karakter). Maksimal ${config.charLimit} karakter untuk paket ${config.name}.`,
    });
  }

  // Simpan pesan user untuk arsip ide awal
  const msg = await prisma.chatMessage.create({
    data: { sessionId: session.id, role: 'user', content: parsed.data.content },
  });

  res.json({ ok: true, id: msg.id, content: msg.content });
});

chatRouter.post('/api/chat/sessions/:id/retry', requireUser, async (req: AuthedRequest, res) => {
  res.json({ ok: true });
});

chatRouter.post('/api/chat/sessions/:id/finalize', requireUser, async (req: AuthedRequest, res) => {
  const session = await prisma.chatSession.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!session) return res.status(404).json({ error: 'Sesi chat tidak ditemukan.' });

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

  const rawIdea = typeof req.body?.idea === 'string' && req.body.idea.trim() ? req.body.idea.trim() : undefined;
  if (rawIdea) {
    await prisma.chatMessage.create({
      data: { sessionId: session.id, role: 'user', content: rawIdea },
    });
  }

  try {
    const result = await finalizeChatSession(session.id, req.userId, rawIdea);

    // Job async: rename project dengan nama hasil AI (survey round di-kickstart halaman survey).
    void startAiJob(result.projectId, 'chat_finalize', async () => {
      return postFinalizeProject(result.projectId, rawIdea ?? session.messages.find((m) => m.role === 'user')?.content ?? '', req.userId);
    }).catch((err) => console.error('[chat/finalize] Gagal memulai job rename:', err));

    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'Gagal finalisasi project.', detail: (err as Error).message });
  }
});
