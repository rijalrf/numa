// Polling job AI async via GET /api/projects/:id/ai-jobs.
// Interval 3 detik, berhenti saat status done/failed/idle lebih dari maxAttempts.
import { api } from './http';

export type AiJobStatus = 'idle' | 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export type AiJobResponse = {
  status: AiJobStatus | 'generating';
  error: string | null;
  result: any;
};

export type AiJobType =
  | 'tasks_generate'
  | 'cycle_analyze'
  | 'cycle_generate'
  | 'roadmap_generate'
  | 'survey_round'
  | 'survey_summary'
  | 'flow_generate'
  | 'techstack_recommend'
  | 'prd_generate'
  | 'prd_spec';

export type PollAiJobOptions = {
  intervalMs?: number;
  maxAttempts?: number;
  /** Dipanggil di setiap tick selama job belum selesai (mis. teks sementara di json.result). */
  onProgress?: (job: AiJobResponse) => void;
  onDone?: (result: any) => void;
  onFailed?: (error: string) => void;
  onTimeout?: () => void;
};

export function pollAiJob(
  projectId: string,
  type: AiJobType,
  opts: PollAiJobOptions = {}
): () => void {
  const intervalMs = opts.intervalMs ?? 3000;
  const maxAttempts = opts.maxAttempts ?? 120; // 6 menit
  let attempts = 0;

  const timer = setInterval(async () => {
    attempts++;
    try {
      const json = await api<AiJobResponse>(`/api/projects/${projectId}/ai-jobs?type=${type}`);

      opts.onProgress?.(json);

      if (json.status === 'done') {
        clearInterval(timer);
        opts.onDone?.(json.result);
        return;
      }
      if (json.status === 'failed' || json.status === 'cancelled') {
        clearInterval(timer);
        opts.onFailed?.(json.error || 'AI gagal memproses permintaan.');
        return;
      }
    } catch {
      // Polling sementara gagal, ulangi di tick berikutnya
    }

    if (attempts >= maxAttempts) {
      clearInterval(timer);
      opts.onTimeout?.();
    }
  }, intervalMs);

  return () => clearInterval(timer);
}
