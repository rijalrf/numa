// Polling job AI async via GET /api/projects/:id/ai-jobs.
// Interval 3 detik, berhenti saat status done/failed/idle lebih dari maxAttempts.
import { api } from './http';

export type AiJobStatus = 'idle' | 'running' | 'done' | 'failed';

export type AiJobResponse = {
  status: AiJobStatus | 'generating';
  error: string | null;
  result: any;
};

export type AiJobType =
  | 'tasks_generate'
  | 'cycle_generate'
  | 'roadmap_generate'
  | 'survey_round'
  | 'survey_summary'
  | 'tree_generate'
  | 'techstack_recommend'
  | 'chat_finalize';

export type PollAiJobOptions = {
  intervalMs?: number;
  maxAttempts?: number;
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
  const maxAttempts = opts.maxAttempts ?? 60; // 3 menit
  let attempts = 0;

  const timer = setInterval(async () => {
    attempts++;
    try {
      const json = await api<AiJobResponse>(`/api/projects/${projectId}/ai-jobs?type=${type}`);

      if (json.status === 'done') {
        clearInterval(timer);
        opts.onDone?.(json.result);
        return;
      }
      if (json.status === 'failed') {
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
