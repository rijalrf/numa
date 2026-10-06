// SaaS Monetisasi & Midtrans Checkout / Webhook.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { PLANS } from '../lib/billing.js';
import { logger } from '../lib/logger.js';
import { recordAudit } from '../lib/audit.js';
import { WebhookBodySchema, amountMatches, classifyTransaction, verifySignature } from '../lib/midtrans.js';

export const billingRouter = Router();

const CheckoutBodySchema = z.object({
  plan: z.enum(['starter', 'pro']),
});

billingRouter.post('/api/billing/checkout', requireUser, async (req: AuthedRequest, res) => {
  const parsed = CheckoutBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Paket yang dipilih tidak valid.' });
  }

  const selectedPlan = parsed.data.plan;
  const config = PLANS[selectedPlan];
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  const isProd = process.env.MIDTRANS_IS_PRODUCTION === 'true';

  if (!serverKey) {
    return res.status(503).json({ error: 'Gateway pembayaran belum dikonfigurasi di server.' });
  }

  const orderId = `NUMA-${Date.now()}-${req.userId.slice(-6)}`;
  const snapUrl = isProd
    ? 'https://app.midtrans.com/snap/v1/transactions'
    : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

  const authHeader = `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`;

  const payload = {
    transaction_details: {
      order_id: orderId,
      gross_amount: config.price,
    },
    customer_details: {
      email: req.userEmail || `${req.userId}@numa.local`,
    },
    item_details: [
      {
        id: selectedPlan,
        price: config.price,
        quantity: 1,
        name: `Langganan Numa ${config.name} (1 Bulan)`,
      },
    ],
  };

  try {
    const snapRes = await fetch(snapUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify(payload),
    });

    if (!snapRes.ok) {
      const errText = await snapRes.text();
      logger.error('Midtrans menolak pembuatan transaksi', { status: snapRes.status, body: errText.slice(0, 500) });
      return res.status(502).json({ error: 'Gagal membuat transaksi ke Midtrans.' });
    }

    const snapData = (await snapRes.json()) as { token: string; redirect_url: string };

    await prisma.payment.create({
      data: {
        userId: req.userId,
        midtransId: orderId,
        amount: config.price,
        plan: selectedPlan,
        status: 'pending',
      },
    });

    res.json({
      orderId,
      token: snapData.token,
      redirectUrl: snapData.redirect_url,
    });
  } catch (err) {
    logger.error('Checkout gagal', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Terjadi kesalahan sistem saat proses checkout.' });
  }
});

billingRouter.post('/api/billing/webhook', async (req, res) => {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    return res.status(503).json({ error: 'Gateway pembayaran belum dikonfigurasi di server.' });
  }

  const parsed = WebhookBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Data webhook tidak valid.' });
  }
  const body = parsed.data;

  if (!verifySignature(body, serverKey)) {
    logger.warn('Signature webhook Midtrans tidak cocok', { orderId: body.order_id });
    return res.status(401).json({ error: 'Signature tidak cocok.' });
  }

  const payment = await prisma.payment.findUnique({ where: { midtransId: body.order_id } });
  if (!payment) {
    logger.warn('Order webhook Midtrans tidak ditemukan', { orderId: body.order_id });
    return res.status(404).json({ error: 'Order tidak ditemukan.' });
  }

  if (!amountMatches(body.gross_amount, payment.amount)) {
    logger.error('Nominal webhook Midtrans tidak sesuai', {
      orderId: body.order_id,
      expected: payment.amount,
      received: body.gross_amount,
    });
    await recordAudit({
      action: 'billing.webhook.amount_mismatch',
      actorType: 'system',
      actorUserId: payment.userId,
      targetType: 'payment',
      targetId: payment.id,
      metadata: { expected: payment.amount, received: body.gross_amount },
      req,
    });
    return res.status(400).json({ error: 'Nominal pembayaran tidak sesuai.' });
  }

  // Status success dan failed bersifat final: notifikasi ulang tidak boleh mengubah apa pun.
  if (payment.status !== 'pending') {
    return res.json({ ok: true, duplicate: true });
  }

  const outcome = classifyTransaction(body);

  if (outcome === 'success') {
    const targetPlan = (payment.plan === 'pro' ? 'pro' : 'starter') as 'starter' | 'pro';
    const config = PLANS[targetPlan];
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 hari

    const applied = await prisma.$transaction(async (tx) => {
      // Kondisi status pending membuat pengiriman paralel hanya diproses satu kali.
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: 'pending' },
        data: { status: 'success', paymentType: body.payment_type || 'midtrans', transactionAt: new Date() },
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
  } else if (outcome === 'failed') {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: 'pending' },
      data: { status: 'failed', paymentType: body.payment_type || 'midtrans' },
    });
  }

  res.json({ ok: true });
});
