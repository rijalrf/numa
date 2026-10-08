// SaaS Monetisasi: checkout, webhook, dan sinkronisasi pembayaran lewat Mayar.id.
import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { PLANS } from '../lib/billing.js';
import { logger } from '../lib/logger.js';
import { recordAudit } from '../lib/audit.js';
import {
  MayarError,
  WebhookBodySchema,
  classifyMayarStatus,
  createPaymentRequest,
  getMayarConfig,
  getTransaction,
  verifyWebhookToken,
  webhookCandidateIds,
  webhookEventName,
  type CreatedPayment,
  type MayarConfig,
} from '../lib/mayar.js';

export const billingRouter = Router();

const CHECKOUT_TTL_MS = 24 * 60 * 60 * 1000; // masa berlaku tagihan: 24 jam
const SUBSCRIPTION_MS = 30 * 24 * 60 * 60 * 1000; // satu periode langganan: 30 hari

const CheckoutBodySchema = z.object({
  plan: z.enum(['starter', 'pro']),
});

type PaymentRow = NonNullable<Awaited<ReturnType<typeof prisma.payment.findUnique>>>;
type SettledStatus = 'success' | 'pending' | 'expired';

class AmountMismatchError extends Error {}

/** Base URL frontend untuk redirect setelah bayar: origin permintaan bila terdaftar di FE_URL, selain itu entri pertama. */
function frontendBaseUrl(req: Request): string {
  const allowed = (process.env.FE_URL ?? '')
    .split(',')
    .map((v) => v.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) return origin;
  return allowed[0] ?? 'http://localhost:3455';
}

/** Membuat tagihan di Mayar. Bila redirectUrl ditolak, diulang tanpa redirectUrl (pengguna disinkronkan manual). */
async function createMayarPayment(
  config: MayarConfig,
  input: Parameters<typeof createPaymentRequest>[1],
): Promise<CreatedPayment> {
  try {
    return await createPaymentRequest(config, input);
  } catch (err) {
    if (err instanceof MayarError && err.status === 400 && /redirectUrl/i.test(err.message) && input.redirectUrl) {
      logger.warn('Mayar menolak redirectUrl, mengulang tanpa redirectUrl', { message: err.message });
      return createPaymentRequest(config, { ...input, redirectUrl: undefined });
    }
    throw err;
  }
}

/**
 * Memeriksa status transaksi ke Mayar lalu menerapkan hasilnya. Dipakai webhook dan endpoint sync.
 * Payload webhook tidak dipercaya: status dan nominal selalu diambil dari API Mayar.
 */
async function settlePayment(config: MayarConfig, payment: PaymentRow, req: Request): Promise<SettledStatus> {
  if (payment.status === 'success') return 'success';
  if (payment.status !== 'pending') return 'expired';

  const expired = payment.expiresAt !== null && payment.expiresAt.getTime() < Date.now();
  if (!payment.providerTxId) {
    if (expired) await markExpired(payment.id);
    return expired ? 'expired' : 'pending';
  }

  const trx = await getTransaction(config, payment.providerTxId);
  const outcome = classifyMayarStatus(trx.status);

  if (outcome === 'success') {
    if (trx.amount !== payment.amount) {
      logger.error('Nominal transaksi Mayar tidak sesuai', {
        paymentId: payment.id,
        expected: payment.amount,
        received: trx.amount,
      });
      await recordAudit({
        action: 'billing.webhook.amount_mismatch',
        actorType: 'system',
        actorUserId: payment.userId,
        targetType: 'payment',
        targetId: payment.id,
        metadata: { expected: payment.amount, received: trx.amount },
        req,
      });
      throw new AmountMismatchError();
    }
    await applySuccessfulPayment(payment, trx.paymentMethod ?? 'mayar', req);
    return 'success';
  }

  if (outcome === 'expired' || expired) {
    await markExpired(payment.id);
    return 'expired';
  }
  return 'pending';
}

async function markExpired(paymentId: string) {
  await prisma.payment.updateMany({ where: { id: paymentId, status: 'pending' }, data: { status: 'expired' } });
}

async function applySuccessfulPayment(payment: PaymentRow, paymentType: string, req: Request) {
  const targetPlan = (payment.plan === 'pro' ? 'pro' : 'starter') as 'starter' | 'pro';
  const config = PLANS[targetPlan];
  const expiresAt = new Date(Date.now() + SUBSCRIPTION_MS);

  const applied = await prisma.$transaction(async (tx) => {
    // Kondisi status pending membuat pengiriman paralel (webhook dan sync) hanya diproses satu kali.
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: 'pending' },
      data: { status: 'success', paymentType, transactionAt: new Date() },
    });
    if (claimed.count === 0) return false;
    await tx.subscription.upsert({
      where: { userId: payment.userId },
      create: { userId: payment.userId, plan: targetPlan, quotaUsed: 0, quotaMax: config.quotaMax, expiresAt },
      update: { plan: targetPlan, quotaUsed: 0, quotaMax: config.quotaMax, expiresAt },
    });
    return true;
  });

  if (applied) {
    logger.info('Pembayaran berhasil, paket diperbarui', { userId: payment.userId, plan: targetPlan });
    await recordAudit({
      action: 'billing.payment.success',
      actorType: 'system',
      actorUserId: payment.userId,
      targetType: 'payment',
      targetId: payment.id,
      metadata: { plan: targetPlan, amount: payment.amount },
      req,
    });
  }
}

billingRouter.post('/api/billing/checkout', requireUser, async (req: AuthedRequest, res) => {
  const parsed = CheckoutBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Paket yang dipilih tidak valid.' });
  }

  const config = getMayarConfig();
  if (!config) {
    return res.status(503).json({ error: 'Gateway pembayaran belum dikonfigurasi di server.' });
  }

  const selectedPlan = parsed.data.plan;
  const plan = PLANS[selectedPlan];

  try {
    // Klik ganda tidak membuat tagihan baru: pakai ulang tagihan yang masih berlaku untuk paket yang sama.
    const existing = await prisma.payment.findFirst({
      where: {
        userId: req.userId,
        plan: selectedPlan,
        status: 'pending',
        provider: 'mayar',
        checkoutUrl: { not: null },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing?.checkoutUrl) {
      return res.json({ paymentId: existing.id, redirectUrl: existing.checkoutUrl });
    }

    const payment = await prisma.payment.create({
      data: {
        userId: req.userId,
        provider: 'mayar',
        amount: plan.price,
        plan: selectedPlan,
        status: 'pending',
        expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
      },
    });

    let created: CreatedPayment;
    try {
      created = await createMayarPayment(config, {
        name: `Langganan Numa ${plan.name} (1 Bulan)`,
        amount: plan.price,
        email: req.userEmail,
        description: `Langganan Numa paket ${plan.name} selama 30 hari`,
        redirectUrl: `${frontendBaseUrl(req)}/settings/billing?payment=${payment.id}`,
        expiredAt: payment.expiresAt as Date,
        extraData: { paymentId: payment.id, userId: req.userId, plan: selectedPlan },
      });
    } catch (err) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'failed' } });
      logger.error('Mayar gagal membuat tagihan', {
        status: err instanceof MayarError ? err.status : undefined,
        error: err instanceof Error ? err.message : String(err),
      });
      if (err instanceof MayarError && err.status === 429) {
        return res.status(429).json({ error: 'Permintaan terlalu cepat. Coba lagi dalam beberapa saat.' });
      }
      return res.status(502).json({ error: 'Gagal membuat tagihan di Mayar. Coba lagi nanti.' });
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: { providerRef: created.id, providerTxId: created.transactionId, checkoutUrl: created.link },
    });

    res.json({ paymentId: payment.id, redirectUrl: created.link });
  } catch (err) {
    logger.error('Checkout gagal', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Terjadi kesalahan sistem saat proses checkout.' });
  }
});

billingRouter.post('/api/billing/webhook', async (req, res) => {
  const config = getMayarConfig();
  if (!config || !config.webhookToken) {
    return res.status(503).json({ error: 'Gateway pembayaran belum dikonfigurasi di server.' });
  }

  if (!verifyWebhookToken(req.header('x-callback-token'), config.webhookToken)) {
    logger.warn('Token webhook Mayar tidak cocok');
    return res.status(401).json({ error: 'Token webhook tidak cocok.' });
  }

  const parsed = WebhookBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Data webhook tidak valid.' });
  }
  const body = parsed.data;

  const event = webhookEventName(body);
  if (event !== undefined && event !== 'payment.received') {
    return res.json({ ok: true, ignored: true });
  }

  const ids = webhookCandidateIds(body);
  const payment = ids.length
    ? await prisma.payment.findFirst({ where: { OR: [{ providerTxId: { in: ids } }, { providerRef: { in: ids } }] } })
    : null;
  if (!payment) {
    logger.warn('Pembayaran untuk webhook Mayar tidak ditemukan', { ids });
    return res.status(404).json({ error: 'Pembayaran tidak ditemukan.' });
  }

  // Status success dan failed bersifat final: notifikasi ulang tidak boleh mengubah apa pun.
  if (payment.status !== 'pending') {
    return res.json({ ok: true, duplicate: true });
  }

  try {
    const status = await settlePayment(config, payment, req);
    res.json({ ok: true, status });
  } catch (err) {
    if (err instanceof AmountMismatchError) {
      return res.status(400).json({ error: 'Nominal pembayaran tidak sesuai.' });
    }
    // Gagal konfirmasi ke Mayar: balas 502 agar Mayar mengirim ulang, status tetap pending.
    logger.error('Konfirmasi pembayaran ke Mayar gagal', {
      paymentId: payment.id,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(502).json({ error: 'Gagal mengonfirmasi pembayaran ke Mayar.' });
  }
});

// Rekonsiliasi saat pengguna kembali dari halaman bayar (webhook bisa terlambat atau hilang).
billingRouter.post('/api/billing/payments/:id/sync', requireUser, async (req: AuthedRequest, res) => {
  const config = getMayarConfig();
  if (!config) {
    return res.status(503).json({ error: 'Gateway pembayaran belum dikonfigurasi di server.' });
  }

  const payment = await prisma.payment.findFirst({ where: { id: String(req.params.id), userId: req.userId } });
  if (!payment) {
    return res.status(404).json({ error: 'Pembayaran tidak ditemukan.' });
  }

  try {
    const status = await settlePayment(config, payment, req);
    res.json({ paymentId: payment.id, status, plan: payment.plan });
  } catch (err) {
    if (err instanceof AmountMismatchError) {
      return res.status(409).json({ error: 'Nominal pembayaran tidak sesuai. Hubungi dukungan.' });
    }
    logger.error('Sinkronisasi pembayaran gagal', {
      paymentId: payment.id,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(502).json({ error: 'Gagal memeriksa status pembayaran ke Mayar.' });
  }
});
