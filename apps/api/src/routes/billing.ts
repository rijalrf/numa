// SaaS Monetisasi & Midtrans Checkout / Webhook.
import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { PLANS } from '../lib/billing.js';

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
      console.error('[midtrans-error]', snapRes.status, errText);
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
    console.error('[checkout-error]', err);
    res.status(500).json({ error: 'Terjadi kesalahan sistem saat proses checkout.' });
  }
});

billingRouter.post('/api/billing/webhook', async (req, res) => {
  const {
    order_id,
    status_code,
    gross_amount,
    signature_key,
    transaction_status,
    payment_type,
    fraud_status,
  } = req.body || {};

  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey || !order_id || !signature_key) {
    return res.status(400).json({ error: 'Data webhook tidak valid atau server key belum diatur.' });
  }

  // Verifikasi signature Midtrans SHA512(order_id + status_code + gross_amount + ServerKey)
  const hash = crypto
    .createHash('sha512')
    .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
    .digest('hex');

  if (hash !== signature_key) {
    console.warn('[midtrans-webhook] Signature verification mismatch untuk order:', order_id);
    return res.status(401).json({ error: 'Signature tidak cocok.' });
  }

  const payment = await prisma.payment.findUnique({
    where: { midtransId: order_id },
  });

  if (!payment) {
    console.warn('[midtrans-webhook] Order tidak ditemukan:', order_id);
    return res.status(404).json({ error: 'Order tidak ditemukan.' });
  }

  const isSuccess =
    transaction_status === 'settlement' ||
    (transaction_status === 'capture' && fraud_status === 'accept');

  const isFailed =
    transaction_status === 'deny' ||
    transaction_status === 'cancel' ||
    transaction_status === 'expire';

  if (isSuccess) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'success',
        paymentType: payment_type || 'midtrans',
        transactionAt: new Date(),
      },
    });

    const targetPlan = (payment.plan in PLANS ? payment.plan : 'starter') as 'starter' | 'pro';
    const config = PLANS[targetPlan];
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 hari

    await prisma.subscription.upsert({
      where: { userId: payment.userId },
      create: {
        userId: payment.userId,
        plan: targetPlan,
        quotaUsed: 0,
        quotaMax: config.quotaMax,
        expiresAt,
      },
      update: {
        plan: targetPlan,
        quotaUsed: 0,
        quotaMax: config.quotaMax,
        expiresAt,
      },
    });
    console.log(`[billing] User ${payment.userId} berhasil di-upgrade ke paket ${targetPlan}`);
  } else if (isFailed) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'failed',
        paymentType: payment_type || 'midtrans',
      },
    });
  }

  res.json({ ok: true });
});
