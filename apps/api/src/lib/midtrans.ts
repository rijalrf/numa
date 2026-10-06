// Logika murni notifikasi Midtrans: validasi body, signature, dan klasifikasi status.
import crypto from 'node:crypto';
import { z } from 'zod';

export const WebhookBodySchema = z.object({
  order_id: z.string().min(1).max(100),
  status_code: z.string().min(1).max(10),
  gross_amount: z.string().min(1).max(30),
  signature_key: z.string().min(1).max(256),
  transaction_status: z.string().min(1).max(50),
  payment_type: z.string().max(50).optional(),
  fraud_status: z.string().max(50).optional(),
});

export type WebhookBody = z.infer<typeof WebhookBodySchema>;

/** SHA512(order_id + status_code + gross_amount + serverKey), dibandingkan constant-time. */
export function verifySignature(body: WebhookBody, serverKey: string): boolean {
  const expected = crypto
    .createHash('sha512')
    .update(`${body.order_id}${body.status_code}${body.gross_amount}${serverKey}`)
    .digest();
  let given: Buffer;
  try {
    given = Buffer.from(body.signature_key, 'hex');
  } catch {
    return false;
  }
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export type TransactionOutcome = 'success' | 'failed' | 'pending';

export function classifyTransaction(body: Pick<WebhookBody, 'transaction_status' | 'fraud_status'>): TransactionOutcome {
  const { transaction_status: status, fraud_status: fraud } = body;
  if (status === 'settlement' || (status === 'capture' && fraud === 'accept')) return 'success';
  if (status === 'deny' || status === 'cancel' || status === 'expire') return 'failed';
  return 'pending';
}

/** Midtrans mengirim nominal sebagai string desimal, mis. "49000.00". Cocokkan dengan nominal tersimpan. */
export function amountMatches(grossAmount: string, expected: number): boolean {
  const value = Number(grossAmount);
  return Number.isFinite(value) && Math.round(value) === expected && Math.abs(value - expected) < 0.01;
}
