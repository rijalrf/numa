// Antrean job AI tahan restart. Status disimpan di tabel AiJob; frontend polling via GET.
//
// Alur: route memanggil enqueueAiJob (baris 'queued' + payload) -> worker mengklaim secara atomik
// (FOR UPDATE SKIP LOCKED, aman untuk banyak instance) -> handler terdaftar dijalankan dengan heartbeat.
// Job 'running' tanpa heartbeat lebih dari STALE_HEARTBEAT_MS (mis. proses mati) dikembalikan ke antrean
// sampai maxAttempts, lalu ditandai failed.
import { logger, serializeError } from '../logger.js';
import { prisma } from '../prisma.js';

export const AI_JOB_TYPES = [
  'tasks_generate',
  'cycle_generate',
  'roadmap_generate',
  'survey_round',
  'survey_summary',
  'flow_generate',
  'techstack_recommend',
] as const;

export type AiJobType = (typeof AI_JOB_TYPES)[number];
export type AiJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export function isAiJobType(value: string): value is AiJobType {
  return (AI_JOB_TYPES as readonly string[]).includes(value);
}

const ACTIVE_STATUSES: AiJobStatus[] = ['queued', 'running'];

export const JOB_CONCURRENCY = Math.max(1, Number(process.env.AI_JOB_CONCURRENCY) || 4);
const POLL_INTERVAL_MS = 3_000;
const SWEEP_INTERVAL_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 20_000;
export const STALE_HEARTBEAT_MS = 90_000;
export const JOB_TIMEOUT_MS = 10 * 60 * 1000;

/** Lempar dari handler untuk kegagalan yang tidak berguna bila diulang (data hilang, tidak valid, dsb). */
export class NonRetryableJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableJobError';
  }
}

export type JobContext<P = any> = {
  jobId: string;
  projectId: string;
  userId: string | null;
  payload: P;
  attempt: number;
  /** Aborted saat job dibatalkan atau melewati batas waktu. */
  signal: AbortSignal;
  /** Lempar bila job sudah dibatalkan; panggil di antara langkah mahal. */
  assertActive(): void;
};

export type JobHandler<P = any> = (ctx: JobContext<P>) => Promise<unknown>;

const handlers = new Map<AiJobType, JobHandler>();

export function registerJobHandler<P = any>(type: AiJobType, handler: JobHandler<P>) {
  handlers.set(type, handler as JobHandler);
}

/** Jeda sebelum percobaan ulang: 5 detik, 15 detik, 45 detik, maksimal 2 menit. */
export function retryBackoffMs(attempt: number): number {
  return Math.min(5_000 * 3 ** Math.max(0, attempt - 1), 120_000);
}

export function isHeartbeatStale(lastBeat: Date, now = Date.now()): boolean {
  return now - lastBeat.getTime() > STALE_HEARTBEAT_MS;
}

export async function getLatestJob(projectId: string, type: AiJobType) {
  return prisma.aiJob.findFirst({
    where: { projectId, type },
    orderBy: { createdAt: 'desc' },
  });
}

export async function hasActiveJob(projectId: string, type: AiJobType) {
  const count = await prisma.aiJob.count({ where: { projectId, type, status: { in: ACTIVE_STATUSES } } });
  return count > 0;
}

/** Status untuk klien polling: queued dan running sama-sama berarti sedang diproses. */
export function toClientStatus(status: string | undefined | null): string {
  if (!status) return 'idle';
  return status === 'running' || status === 'queued' ? 'generating' : status;
}

export type EnqueueArgs = {
  projectId: string;
  type: AiJobType;
  userId?: string | null;
  payload?: unknown;
  maxAttempts?: number;
};

export const MAX_ACTIVE_JOBS_PER_USER = Math.max(1, Number(process.env.AI_MAX_ACTIVE_JOBS_PER_USER) || 5);

export class JobLimitError extends Error {
  status = 429;
  constructor() {
    super(`Terlalu banyak proses AI yang sedang berjalan atau antre (maksimal ${MAX_ACTIVE_JOBS_PER_USER}). Tunggu hingga ada yang selesai.`);
    this.name = 'JobLimitError';
  }
}

/** Bila err adalah JobLimitError, balas 429 dan kembalikan true; selain itu caller menangani sendiri. */
export function rejectJobLimit(res: { status(code: number): { json(body: unknown): unknown } }, err: unknown): boolean {
  if (!(err instanceof JobLimitError)) return false;
  res.status(429).json({ error: err.message, code: 'job_limit_reached' });
  return true;
}

/** Masukkan job ke antrean. Caller hanya menunggu pembuatan baris; eksekusi di worker. */
export async function enqueueAiJob(args: EnqueueArgs) {
  if (args.userId) {
    const active = await prisma.aiJob.count({ where: { userId: args.userId, status: { in: ACTIVE_STATUSES } } });
    if (active >= MAX_ACTIVE_JOBS_PER_USER) throw new JobLimitError();
  }
  const job = await prisma.aiJob.create({
    data: {
      projectId: args.projectId,
      type: args.type,
      userId: args.userId ?? null,
      payload: args.payload === undefined ? undefined : (args.payload as any),
      maxAttempts: args.maxAttempts ?? 2,
      status: 'queued',
    },
  });
  void drainQueue();
  return job;
}

/** Batalkan job aktif project+type. Job running dihentikan secara kooperatif (hasil dibuang). */
export async function cancelAiJob(projectId: string, type: AiJobType): Promise<number> {
  const result = await prisma.aiJob.updateMany({
    where: { projectId, type, status: { in: ACTIVE_STATUSES } },
    data: { status: 'cancelled', error: 'Dibatalkan pengguna.', finishedAt: new Date() },
  });
  return result.count;
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

const running = new Map<string, AbortController>();
let pollTimer: NodeJS.Timeout | null = null;
let sweepTimer: NodeJS.Timeout | null = null;
let draining = false;
let stopping = false;

async function claimNextJob() {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "AiJob"
    SET "status" = 'running',
        "startedAt" = NOW(),
        "heartbeatAt" = NOW(),
        "attempts" = "attempts" + 1
    WHERE "id" = (
      SELECT "id" FROM "AiJob"
      WHERE "status" = 'queued' AND "runAfter" <= NOW()
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING "id"`;
  if (rows.length === 0) return null;
  return prisma.aiJob.findUnique({ where: { id: rows[0].id } });
}

export async function drainQueue() {
  if (draining || stopping) return;
  draining = true;
  try {
    while (running.size < JOB_CONCURRENCY && !stopping) {
      const job = await claimNextJob();
      if (!job) break;
      void runJob(job);
    }
  } catch (err) {
    logger.error('Gagal mengklaim job', { scope: 'ai-job', error: serializeError(err) });
  } finally {
    draining = false;
  }
}

type ClaimedJob = NonNullable<Awaited<ReturnType<typeof claimNextJob>>>;

async function finishIfRunning(jobId: string, data: Record<string, unknown>) {
  // Hanya menimpa status 'running': job yang dibatalkan/dikembalikan ke antrean tidak ikut tertimpa.
  await prisma.aiJob.updateMany({ where: { id: jobId, status: 'running' }, data });
}

async function runJob(job: ClaimedJob) {
  const controller = new AbortController();
  running.set(job.id, controller);

  const handler = handlers.get(job.type as AiJobType);
  const heartbeat = setInterval(async () => {
    try {
      const fresh = await prisma.aiJob.findUnique({ where: { id: job.id }, select: { status: true } });
      if (!fresh || fresh.status !== 'running') {
        controller.abort();
        return;
      }
      await prisma.aiJob.update({ where: { id: job.id }, data: { heartbeatAt: new Date() } });
    } catch {
      // gagal heartbeat sesaat tidak menghentikan job; sweeper yang memutuskan
    }
  }, HEARTBEAT_INTERVAL_MS);

  let timeout: NodeJS.Timeout | undefined;
  try {
    if (!handler) throw new NonRetryableJobError(`Handler untuk job '${job.type}' tidak terdaftar.`);

    const ctx: JobContext = {
      jobId: job.id,
      projectId: job.projectId,
      userId: job.userId,
      payload: job.payload,
      attempt: job.attempts,
      signal: controller.signal,
      assertActive() {
        if (controller.signal.aborted) throw new NonRetryableJobError('Job dibatalkan.');
      },
    };

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new NonRetryableJobError('Proses melewati batas waktu 10 menit.'));
      }, JOB_TIMEOUT_MS);
    });

    const result = await Promise.race([handler(ctx), timeoutPromise]);
    await finishIfRunning(job.id, {
      status: 'done',
      result: result === undefined ? undefined : (result as any),
      error: null,
      finishedAt: new Date(),
    });
  } catch (err: any) {
    const message = err?.message || 'AI gagal memproses permintaan.';
    const retryable = !(err instanceof NonRetryableJobError) && err?.name !== 'AiBudgetExceededError' && job.attempts < job.maxAttempts && !stopping;
    logger.error('Job AI gagal', {
      scope: 'ai-job',
      jobId: job.id,
      type: job.type,
      projectId: job.projectId,
      attempt: job.attempts,
      maxAttempts: job.maxAttempts,
      willRetry: retryable,
      error: message,
    });
    try {
      if (retryable) {
        await finishIfRunning(job.id, {
          status: 'queued',
          error: message,
          runAfter: new Date(Date.now() + retryBackoffMs(job.attempts)),
        });
      } else {
        await finishIfRunning(job.id, { status: 'failed', error: message, finishedAt: new Date() });
      }
    } catch (dbErr) {
      logger.error('Gagal menyimpan status job', { scope: 'ai-job', jobId: job.id, error: serializeError(dbErr) });
    }
  } finally {
    clearInterval(heartbeat);
    if (timeout) clearTimeout(timeout);
    running.delete(job.id);
    void drainQueue();
  }
}

/** Kembalikan job 'running' tanpa heartbeat ke antrean (atau failed bila percobaan habis). */
export async function sweepStaleJobs(): Promise<{ requeued: number; failed: number }> {
  const cutoff = new Date(Date.now() - STALE_HEARTBEAT_MS);
  const stale = await prisma.aiJob.findMany({
    where: {
      status: 'running',
      OR: [{ heartbeatAt: { lt: cutoff } }, { heartbeatAt: null, startedAt: { lt: cutoff } }, { heartbeatAt: null, startedAt: null, createdAt: { lt: cutoff } }],
    },
    select: { id: true, attempts: true, maxAttempts: true },
  });

  let requeued = 0;
  let failed = 0;
  for (const job of stale) {
    if (running.has(job.id)) continue; // masih dikerjakan proses ini
    if (job.attempts < job.maxAttempts) {
      const res = await prisma.aiJob.updateMany({
        where: { id: job.id, status: 'running' },
        data: { status: 'queued', error: 'Proses terhenti (server restart). Diulang otomatis.', runAfter: new Date() },
      });
      requeued += res.count;
    } else {
      const res = await prisma.aiJob.updateMany({
        where: { id: job.id, status: 'running' },
        data: {
          status: 'failed',
          error: 'Proses terhenti (server restart atau timeout). Silakan coba lagi.',
          finishedAt: new Date(),
        },
      });
      failed += res.count;
    }
  }
  if (requeued + failed > 0) logger.warn('Sweeper memperbaiki job macet', { scope: 'ai-job', requeued, failed });
  return { requeued, failed };
}

/** True bila worker antrean aktif di proses ini (dipakai /ready). */
export function isJobWorkerRunning(): boolean {
  return pollTimer !== null && !stopping;
}

export function startJobWorker() {
  if (pollTimer) return;
  stopping = false;
  void sweepStaleJobs().catch((err) => logger.error('Sweeper gagal', { scope: 'ai-job', error: serializeError(err) }));
  void drainQueue();
  pollTimer = setInterval(() => void drainQueue(), POLL_INTERVAL_MS);
  sweepTimer = setInterval(() => {
    void sweepStaleJobs().catch((err) => logger.error('Sweeper gagal', { scope: 'ai-job', error: serializeError(err) }));
  }, SWEEP_INTERVAL_MS);
}

/** Hentikan worker; job yang sedang berjalan di proses ini dikembalikan ke antrean agar instance lain melanjutkan. */
export async function stopJobWorker() {
  stopping = true;
  if (pollTimer) clearInterval(pollTimer);
  if (sweepTimer) clearInterval(sweepTimer);
  pollTimer = null;
  sweepTimer = null;
  const ids = [...running.keys()];
  for (const id of ids) running.get(id)?.abort();
  if (ids.length > 0) {
    await prisma.aiJob
      .updateMany({
        where: { id: { in: ids }, status: 'running' },
        data: { status: 'queued', runAfter: new Date(), attempts: { decrement: 1 }, error: 'Server dihentikan, diantrekan ulang.' },
      })
      .catch(() => {});
  }
}
