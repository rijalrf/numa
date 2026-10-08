// State dan logika task project: muat, generate, polling, dan riwayat siklus
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/http';
import { pollAiJob } from '@/lib/ai-job';
import type { TaskDetail } from '@/components/kanban/task-detail-dialog';
import type { ProjectCycleItem } from '@/components/cycle/cycle-bar';

type Task = TaskDetail;

/** Langkah yang sedang dikerjakan job tasks_generate (dibaca dari hasil sementara job). */
export type GenerationStep = 'spec' | 'roadmap' | 'tasks' | 'validate' | 'save';
export type GenerationProgress = { step: GenerationStep; label: string; done?: number; total?: number };

// Polling mengikuti status job (bukan jumlah percobaan). Batas 10 menit sama dengan batas waktu job di server;
// setelah itu Board menampilkan "masih diproses" dan tombol periksa ulang, bukan pesan gagal.
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 300;

export type LoadTasksMode = 'initial' | 'manual' | 'silent';

export function useProjectTasks(projectId: string | undefined) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [stillProcessing, setStillProcessing] = useState(false);

  const [cycles, setCycles] = useState<ProjectCycleItem[]>([]);
  const [activeCycleId, setActiveCycleId] = useState<string | null | 'all'>('all');
  const [initialTaskCounts, setInitialTaskCounts] = useState<{ total: number; done: number }>({ total: 0, done: 0 });

  const isGeneratingRef = useRef(false);
  const stopPollingRef = useRef<(() => void) | null>(null);

  // Hentikan polling saat unmount
  useEffect(() => {
    return () => stopPollingRef.current?.();
  }, []);

  const finishGeneration = useCallback(() => {
    stopPollingRef.current = null;
    isGeneratingRef.current = false;
    setGenerating(false);
    setLoading(false);
    setProgress(null);
  }, []);

  const pollForGeneratedTasks = useCallback(() => {
    if (!projectId) return;
    if (stopPollingRef.current) return; // sudah polling — jangan mulai poller kedua
    isGeneratingRef.current = true;

    setGenerating(true);
    setStillProcessing(false);
    setError(null);

    stopPollingRef.current = pollAiJob(projectId, 'tasks_generate', {
      intervalMs: POLL_INTERVAL_MS,
      maxAttempts: POLL_MAX_ATTEMPTS,
      onProgress: (job) => {
        if (job.result?.step) setProgress(job.result as GenerationProgress);
      },
      onDone: async () => {
        finishGeneration();
        try {
          const json = await api<{ tasks: Task[] }>(`/api/projects/${projectId}/tasks`);
          if (json.tasks && json.tasks.length > 0) {
            setTasks(json.tasks);
            setSuccessMessage(`${json.tasks.length} task berhasil dirancang.`);
            setError(null);
          } else {
            // Job selesai tapi tidak ada task tersimpan
            setTasks([]);
            setError('Perancangan task selesai tanpa menghasilkan task. Coba generate ulang.');
          }
        } catch {
          setError('Task selesai dirancang tetapi gagal dimuat. Silakan periksa ulang.');
        }
      },
      onFailed: (err) => {
        finishGeneration();
        setError(err || 'AI gagal menghasilkan task.');
      },
      onTimeout: () => {
        // Job masih bisa berjalan di server: bukan kegagalan.
        finishGeneration();
        setStillProcessing(true);
      },
    });
  }, [projectId, finishGeneration]);

  const generateTasks = useCallback(async () => {
    if (!projectId || isGeneratingRef.current) return;
    isGeneratingRef.current = true;
    setGenerating(true);
    setError(null);
    setSuccessMessage(null);

    // Trigger generasi di backend; status dipantau lewat polling GET ke database.
    try {
      const resp = await api(`/api/projects/${projectId}/tasks/generate`, { method: 'POST' });
      // POST sukses (termasuk 200 "generating") — mulai polling
      void resp;
    } catch (err: any) {
      // Gagal start (403 plan, 409 lock, 500): tampilkan error asli, jangan polling.
      console.warn('POST tasks/generate gagal:', err);
      setError(err?.message || 'Gagal memulai perancangan task.');
      finishGeneration();
      return;
    }
    pollForGeneratedTasks();
  }, [projectId, pollForGeneratedTasks, finishGeneration]);

  const loadCycles = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await api<{
        cycles: ProjectCycleItem[];
        initialTaskCounts: { total: number; done: number };
      }>(`/api/projects/${projectId}/cycles`);

      setCycles(res.cycles || []);
      if (res.initialTaskCounts) setInitialTaskCounts(res.initialTaskCounts);
    } catch (err) {
      console.error('Gagal memuat riwayat siklus:', err);
    }
  }, [projectId]);

  useEffect(() => {
    loadCycles();
  }, [loadCycles]);

  const loadTasks = useCallback(
    async (mode: LoadTasksMode = 'initial') => {
      if (!projectId) return;
      if (mode === 'manual') setRefreshing(true);

      try {
        const cycleParam = activeCycleId !== undefined ? `?cycleId=${activeCycleId}` : '';
        const json = await api<{
          tasks: Task[];
          generationStatus?: 'idle' | 'generating' | 'done' | 'failed';
          generationError?: string | null;
        }>(
          `/api/projects/${projectId}/tasks${cycleParam}`
        );
        if (json.tasks && json.tasks.length > 0) {
          setTasks(json.tasks);
          setError(null);
        } else if (json.generationStatus === 'generating') {
          pollForGeneratedTasks();
        } else if (json.generationStatus === 'failed') {
          setError(json.generationError || 'AI gagal menghasilkan task.');
        } else if (mode === 'initial' && json.generationStatus !== 'done') {
          // Hanya auto-generate bila belum pernah berhasil generate (status idle)
          if (!isGeneratingRef.current) {
            await generateTasks();
          }
        } else {
          setTasks([]);
        }
      } catch (err) {
        console.error('Gagal load tasks:', err);
        if (mode !== 'silent') {
          const msg = err instanceof Error ? err.message : 'Gagal memuat task.';
          setError(`Gagal memuat task: ${msg}`);
        }
      } finally {
        if (mode === 'initial') setLoading(false);
        if (mode === 'manual') setRefreshing(false);
      }
    },
    [projectId, generateTasks, activeCycleId, pollForGeneratedTasks]
  );

  // Load tasks on mount
  useEffect(() => {
    loadTasks('initial');
  }, [loadTasks]);

  // Muat ulang task saat pemilih siklus berubah
  useEffect(() => {
    if (!loading) {
      loadTasks('manual');
    }
  }, [activeCycleId]);

  return {
    tasks,
    setTasks,
    loading,
    generating,
    refreshing,
    error,
    successMessage,
    setSuccessMessage,
    progress,
    stillProcessing,
    cycles,
    activeCycleId,
    setActiveCycleId,
    initialTaskCounts,
    generateTasks,
    loadTasks,
    loadCycles,
  };
}
