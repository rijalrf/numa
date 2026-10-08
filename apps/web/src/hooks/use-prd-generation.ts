// Hook penyusunan PRD lewat antrean job: teks tersusun dibaca bertahap lewat polling,
// lalu spec terstruktur (journey) menyusul dari job terpisah.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/http';
import { pollAiJob, type AiJobResponse } from '@/lib/ai-job';
import type { PrdJourney } from '@/components/prd/journey-list';

export type SpecStatus = 'idle' | 'generating' | 'done' | 'failed';

type PrdResponse = {
  prd?: { content: any } | null;
  brd?: { content: any } | null;
  specStatus?: SpecStatus;
  specError?: string | null;
};

// Polling lebih rapat dari default (3 dtk) agar teks PRD terasa bertahap.
const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 240; // 6 menit

function contentToMarkdown(content: any): string {
  if (typeof content === 'string') return content;
  if (content?.markdown) return content.markdown;
  return JSON.stringify(content, null, 2);
}

export function usePrdGeneration(projectId: string | undefined, isLocked: boolean) {
  const [markdown, setMarkdown] = useState('');
  const [journeys, setJourneys] = useState<PrdJourney[]>([]);
  const [generating, setGenerating] = useState(false);
  const [specStatus, setSpecStatus] = useState<SpecStatus>('idle');
  const [specError, setSpecError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopPolling = useRef<(() => void) | null>(null);
  const stopSpecPolling = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      stopPolling.current?.();
      stopSpecPolling.current?.();
    },
    [],
  );

  const watchSpec = useCallback(
    (reload: () => Promise<boolean>) => {
      if (!projectId) return;
      setSpecStatus('generating');
      stopSpecPolling.current?.();
      stopSpecPolling.current = pollAiJob(projectId, 'prd_spec', {
        intervalMs: POLL_INTERVAL_MS,
        maxAttempts: POLL_MAX_ATTEMPTS,
        onDone: () => void reload(),
        onFailed: (err) => {
          setSpecStatus('failed');
          setSpecError(err);
        },
        onTimeout: () => {
          setSpecStatus('failed');
          setSpecError('Penyusunan spec memakan waktu lama.');
        },
      });
    },
    [projectId],
  );

  /** Muat PRD tersimpan. Mengembalikan true bila PRD ada. Memantau spec bila masih disusun. */
  const loadPrd = useCallback(async (): Promise<boolean> => {
    if (!projectId) return false;
    const json = await api<PrdResponse>(`/api/projects/${projectId}/prd`);
    const content = json.prd?.content ?? json.brd?.content;
    if (!content) return false;

    setMarkdown(contentToMarkdown(content));
    setJourneys(content?.spec?.journeys ?? []);
    setSpecStatus(json.specStatus ?? 'idle');
    setSpecError(json.specError ?? null);
    setGenerating(false);
    if (json.specStatus === 'generating') watchSpec(loadPrd);
    return true;
  }, [projectId, watchSpec]);

  const watchGeneration = useCallback(() => {
    if (!projectId) return;
    setGenerating(true);
    stopPolling.current?.();
    stopPolling.current = pollAiJob(projectId, 'prd_generate', {
      intervalMs: POLL_INTERVAL_MS,
      maxAttempts: POLL_MAX_ATTEMPTS,
      onProgress: (job) => {
        const partial = job.result?.markdown;
        if (typeof partial === 'string' && partial) setMarkdown(partial);
      },
      onDone: async () => {
        try {
          if (!(await loadPrd())) setError('PRD selesai disusun tetapi belum dapat dimuat. Muat ulang halaman.');
        } catch {
          setError('PRD selesai disusun tetapi gagal dimuat. Muat ulang halaman.');
        }
        setGenerating(false);
      },
      onFailed: (err) => {
        setGenerating(false);
        setError(err || 'AI gagal menghasilkan PRD.');
      },
      onTimeout: () => {
        setGenerating(false);
        setError('Penyusunan PRD memakan waktu lama. Muat ulang halaman untuk melihat hasilnya.');
      },
    });
  }, [projectId, loadPrd]);

  /** Mulai penyusunan PRD baru (idempoten di server: job yang sedang berjalan dipakai ulang). */
  const startGeneration = useCallback(async () => {
    if (!projectId || isLocked) return;
    setError(null);
    setMarkdown('');
    setJourneys([]);
    setSpecStatus('idle');
    setGenerating(true);
    try {
      await api(`/api/projects/${projectId}/prd/generate`, { method: 'POST' });
      watchGeneration();
    } catch (err: any) {
      setGenerating(false);
      setError(err?.message || 'Terjadi kesalahan saat menyusun PRD.');
    }
  }, [projectId, isLocked, watchGeneration]);

  /** Saat halaman terbuka tanpa PRD: lanjutkan job yang berjalan, tampilkan kegagalan terakhir, atau mulai baru. */
  const resumeOrStart = useCallback(async () => {
    if (!projectId || isLocked) return;
    const job = await api<AiJobResponse>(`/api/projects/${projectId}/ai-jobs?type=prd_generate`);
    if (job.status === 'queued' || job.status === 'running' || job.status === 'generating') {
      const partial = job.result?.markdown;
      if (typeof partial === 'string' && partial) setMarkdown(partial);
      watchGeneration();
    } else if (job.status === 'failed') {
      setError(job.error || 'AI gagal menghasilkan PRD.');
    } else {
      await startGeneration();
    }
  }, [projectId, isLocked, watchGeneration, startGeneration]);

  /** Minta ekstraksi ulang spec (spec gagal atau PRD lama). */
  const retrySpec = useCallback(async () => {
    if (!projectId) return;
    setSpecError(null);
    setSpecStatus('generating');
    try {
      await api(`/api/projects/${projectId}/prd/spec/extract`, { method: 'POST' });
      watchSpec(loadPrd);
    } catch (err: any) {
      setSpecStatus('failed');
      setSpecError(err?.message || 'Gagal memulai penyusunan spec.');
    }
  }, [projectId, watchSpec, loadPrd]);

  return {
    markdown,
    journeys,
    generating,
    specStatus,
    specError,
    error,
    loadPrd,
    resumeOrStart,
    startGeneration,
    retrySpec,
  };
}
