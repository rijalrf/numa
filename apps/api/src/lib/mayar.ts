// Klien dan logika murni Mayar.id (Headless API V2): konfigurasi, panggilan API, token webhook, klasifikasi status.
import crypto from 'node:crypto';
import { z } from 'zod';

const BASE_URL_PRODUCTION = 'https://api.mayar.id/hl/v2';
const BASE_URL_SANDBOX = 'https://api.mayar.io/hl/v2';
const REQUEST_TIMEOUT_MS = 15_000;

export type MayarConfig = {
  apiKey: string;
  baseUrl: string;
  /** Token yang dikirim Mayar di header webhook; kosong bila belum diatur. */
  webhookToken: string;
};

/** Konfigurasi dari env. Null bila API key belum diisi (pembayaran dinonaktifkan). */
export function getMayarConfig(env: NodeJS.ProcessEnv = process.env): MayarConfig | null {
  const apiKey = env.MAYAR_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: env.MAYAR_IS_PRODUCTION === 'true' ? BASE_URL_PRODUCTION : BASE_URL_SANDBOX,
    webhookToken: env.MAYAR_WEBHOOK_TOKEN?.trim() ?? '',
  };
}

/** Error dari API Mayar. Pesan tidak memuat API key. */
export class MayarError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'MayarError';
  }
}

const EnvelopeSchema = z.object({
  statusCode: z.number().optional(),
  messages: z.string().optional(),
  message: z.string().optional(),
  data: z.unknown().optional(),
});

async function mayarRequest<T>(
  config: MayarConfig,
  method: 'GET' | 'POST',
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new MayarError(0, `Gagal menghubungi Mayar: ${err instanceof Error ? err.message : String(err)}`);
  }

  const raw: unknown = await res.json().catch(() => null);
  const envelope = EnvelopeSchema.safeParse(raw);
  const messages = envelope.success ? (envelope.data.messages ?? envelope.data.message ?? '') : '';
  if (!res.ok || (envelope.success && envelope.data.statusCode !== undefined && envelope.data.statusCode >= 400)) {
    throw new MayarError(res.status, messages || `Mayar menjawab HTTP ${res.status}`);
  }

  const data = envelope.success ? envelope.data.data : undefined;
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new MayarError(res.status, 'Format respons Mayar tidak dikenali.');
  return parsed.data;
}

const CreatedPaymentSchema = z.object({
  id: z.string().min(1),
  transactionId: z.string().min(1),
  link: z.string().url(),
});
export type CreatedPayment = z.infer<typeof CreatedPaymentSchema>;

export type CreatePaymentInput = {
  name: string;
  amount: number;
  email?: string;
  description?: string;
  redirectUrl?: string;
  expiredAt: Date;
  extraData?: Record<string, string>;
};

/** Membuat Single Payment Request. Respons memuat id, transactionId, dan link bayar. */
export function createPaymentRequest(config: MayarConfig, input: CreatePaymentInput): Promise<CreatedPayment> {
  return mayarRequest(config, 'POST', '/payments/create', CreatedPaymentSchema, {
    ...input,
    expiredAt: input.expiredAt.toISOString(),
  });
}

const TransactionSchema = z
  .object({
    id: z.string(),
    amount: z.coerce.number(),
    status: z.string(),
    paymentMethod: z.string().nullish(),
  })
  .passthrough();
export type MayarTransaction = z.infer<typeof TransactionSchema>;

/** Detail transaksi: sumber kebenaran status dan nominal (payload webhook tidak dipercaya). */
export function getTransaction(config: MayarConfig, transactionId: string): Promise<MayarTransaction> {
  return mayarRequest(config, 'GET', `/transactions/${encodeURIComponent(transactionId)}`, TransactionSchema);
}

export type PaymentOutcome = 'success' | 'pending' | 'expired';

export function classifyMayarStatus(status: string): PaymentOutcome {
  const value = status.trim().toLowerCase();
  if (value === 'paid' || value === 'success' || value === 'settled') return 'success';
  if (value === 'closed' || value === 'expired' || value === 'cancelled' || value === 'canceled') return 'expired';
  return 'pending';
}

/** Perbandingan constant-time setelah trim kedua sisi (token tersalin sering membawa spasi atau newline). */
export function verifyWebhookToken(given: string | undefined, expected: string): boolean {
  const want = expected.trim();
  if (!want || !given) return false;
  const a = crypto.createHash('sha256').update(given.trim()).digest();
  const b = crypto.createHash('sha256').update(want).digest();
  return crypto.timingSafeEqual(a, b);
}

const IdSchema = z.string().min(1).max(100).optional();

// Skema sengaja longgar: bentuk payload webhook tidak dijamin dokumentasi, jadi hanya dipakai untuk mencari pembayaran.
export const WebhookBodySchema = z
  .object({
    event: z.string().max(100).optional(),
    'event.received': z.string().max(100).optional(),
    data: z
      .object({
        id: IdSchema,
        transactionId: IdSchema,
        paymentLinkId: IdSchema,
      })
      .passthrough(),
  })
  .passthrough();

export type WebhookBody = z.infer<typeof WebhookBodySchema>;

export function webhookEventName(body: WebhookBody): string | undefined {
  return body.event ?? body['event.received'];
}

/** Kandidat id (transaksi atau payment request) dari payload untuk mencari pembayaran lokal. */
export function webhookCandidateIds(body: WebhookBody): string[] {
  const { id, transactionId, paymentLinkId } = body.data;
  return [...new Set([transactionId, id, paymentLinkId].filter((v): v is string => typeof v === 'string'))];
}
