// Error yang pesannya aman ditampilkan ke klien. Error lain dibalas generik oleh error handler.
export class HttpError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export type ClientError = { status: number; body: { error: string; code?: string; issues?: { path: string; message: string }[] } };

/** Petakan error apa pun ke respons klien. Pesan internal tidak pernah ikut keluar kecuali error ditandai aman. */
export function toClientError(err: unknown): ClientError {
  if (err instanceof HttpError) {
    return { status: err.status, body: { error: err.message, ...(err.code ? { code: err.code } : {}) } };
  }
  const name = (err as { name?: string })?.name;
  if (name === 'ZodError') {
    const issues = ((err as { issues?: { path: (string | number)[]; message: string }[] }).issues ?? []).slice(0, 10).map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    return { status: 400, body: { error: 'Data yang dikirim tidak valid.', issues } };
  }
  if (name === 'AiBudgetExceededError') {
    return { status: 429, body: { error: (err as Error).message, code: 'ai_budget_exceeded' } };
  }
  const type = (err as { type?: string })?.type;
  if (type === 'entity.too.large') return { status: 413, body: { error: 'Ukuran data yang dikirim terlalu besar.' } };
  if (type === 'entity.parse.failed') return { status: 400, body: { error: 'Format JSON tidak valid.' } };
  const status = (err as { status?: number })?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return { status, body: { error: 'Permintaan tidak dapat diproses.' } };
  }
  return { status: 500, body: { error: 'Terjadi kesalahan internal server.' } };
}
