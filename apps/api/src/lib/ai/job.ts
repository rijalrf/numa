// Job AI async: status disimpan di tabel AiJob, frontend polling via GET.
// Satu job aktif per (projectId, type) — generasi bertabrakan ditolak oleh caller.
import { prisma } from '../prisma.js';

export type AiJobType =
  | 'tasks_generate'
  | 'cycle_generate'
  | 'roadmap_generate'
  | 'survey_round'
  | 'survey_summary'
  | 'tree_generate'
  | 'techstack_recommend'
  | 'chat_finalize';

const STALE_MS = 10 * 60 * 1000; // job running > 10 menit dianggap mati (mis. server restart)

// Tandai job running yang sudah stale jadi failed sebelum query status.
async function failStaleJobs(projectId: string, type: AiJobType) {
  await prisma.aiJob.updateMany({
    where: {
      projectId,
      type,
      status: 'running',
      createdAt: { lt: new Date(Date.now() - STALE_MS) },
    },
    data: {
      status: 'failed',
      error: 'Proses terhenti (server restart atau timeout). Silakan coba lagi.',
      finishedAt: new Date(),
    },
  });
}

export async function getLatestJob(projectId: string, type: AiJobType) {
  await failStaleJobs(projectId, type);
  return prisma.aiJob.findFirst({
    where: { projectId, type },
    orderBy: { createdAt: 'desc' },
  });
}

export async function hasActiveJob(projectId: string, type: AiJobType) {
  await failStaleJobs(projectId, type);
  const count = await prisma.aiJob.count({ where: { projectId, type, status: 'running' } });
  return count > 0;
}

// Buat row job segera (anti race double-start), jalankan fn di latar belakang.
// Caller await pembuatan row saja — fn tidak ditunggu.
export async function startAiJob(
  projectId: string,
  type: AiJobType,
  fn: () => Promise<unknown>
) {
  const job = await prisma.aiJob.create({
    data: { projectId, type, status: 'running' },
  });

  void (async () => {
    try {
      const result = await fn();
      await prisma.aiJob.update({
        where: { id: job.id },
        data: {
          status: 'done',
          result: result === undefined ? undefined : (result as any),
          finishedAt: new Date(),
        },
      });
    } catch (err: any) {
      console.error(`[ai-job] ${type} gagal untuk project ${projectId}:`, err);
      await prisma.aiJob
        .update({
          where: { id: job.id },
          data: {
            status: 'failed',
            error: err?.message || 'AI gagal memproses permintaan.',
            finishedAt: new Date(),
          },
        })
        .catch(() => {});
    }
  })();

  return job;
}
