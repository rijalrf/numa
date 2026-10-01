// State dan logika task project: muat, generate, polling, dan riwayat siklus
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/http';
import type { TaskDetail } from '@/components/kanban/task-detail-dialog';
import type { ProjectCycleItem } from '@/components/cycle/cycle-bar';

type Task = TaskDetail;

export type LoadTasksMode = 'initial' | 'manual' | 'silent';

export function useProjectTasks(projectId: string | undefined) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [cycles, setCycles] = useState<ProjectCycleItem[]>([]);
  const [activeCycleId, setActiveCycleId] = useState<string | null | 'all'>('all');
  const [initialTaskCounts, setInitialTaskCounts] = useState<{ total: number; done: number }>({ total: 0, done: 0 });

  const isGeneratingRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Bersihkan timer polling saat unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const pollForGeneratedTasks = useCallback(() => {
    if (!projectId) return;
    if (pollTimerRef.current) return; // sudah polling — jangan reset timer
    isGeneratingRef.current = true;

    setGenerating(true);
    setError(null);
    let attempts = 0;
    const maxAttempts = 60; // 3 menit (polling tiap 3 detik)

    pollTimerRef.current = setInterval(async () => {
      attempts++;
      try {
        const json = await api<{
          tasks: Task[];
          generationStatus?: 'idle' | 'generating' | 'done' | 'failed';
          generationError?: string | null;
        }>(`/api/projects/${projectId}/tasks`);

        if (json.generationStatus === 'failed') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          isGeneratingRef.current = false;
          setGenerating(false);
          setLoading(false);
          setError(json.generationError || 'AI gagal menghasilkan task.');
          return;
        }

        if (json.tasks && json.tasks.length > 0) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          isGeneratingRef.current = false;
          setTasks(json.tasks);
          setSuccessMessage(`${json.tasks.length} task berhasil dirancang.`);
          setGenerating(false);
          setLoading(false);
          setError(null);
          return;
        }

        if (json.generationStatus === 'done') {
          // Job selesai tapi tidak ada task tersimpan — jangan polling terus
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          isGeneratingRef.current = false;
          setGenerating(false);
          setLoading(false);
          setTasks([]);
          setError('Perancangan task selesai tanpa menghasilkan task. Coba generate ulang.');
          return;
        }
      } catch {
        // Polling sementara gagal, ulangi di tick berikutnya
      }

      if (attempts >= maxAttempts) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
        isGeneratingRef.current = false;
        setGenerating(false);
        setLoading(false);
        setError('Proses perancangan task memakan waktu lebih lama dari biasanya. Silakan periksa ulang beberapa saat lagi.');
      }
    }, 3000);
  }, [projectId]);

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
      setGenerating(false);
      isGeneratingRef.current = false;
      return;
    }
    pollForGeneratedTasks();
  }, [projectId, pollForGeneratedTasks]);

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
    cycles,
    activeCycleId,
    setActiveCycleId,
    initialTaskCounts,
    generateTasks,
    loadTasks,
    loadCycles,
  };
}
