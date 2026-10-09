// State alur Minta Perubahan: muat status siklus, polling job analisis/generate, dan aksi user.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/http';
import { deriveChangeRequestState, type ChangeRequestState, type CyclesSnapshot } from '@/lib/cycle';

const POLL_INTERVAL_MS = 2000;
// Sama dengan batas waktu job di server (10 menit); setelah itu panel menampilkan "masih diproses", bukan gagal.
const POLL_MAX_ATTEMPTS = 300;

export type SplitChoice = 'single' | 'a' | 'b';

type Options = {
  projectId: string;
  isOpen: boolean;
  /** Dipanggil sekali saat siklus yang dikonfirmasi selesai dirancang (siklus berstatus OPEN). */
  onFinished: (cycleId: string) => void;
};

export function useChangeRequest({ projectId, isOpen, onFinished }: Options) {
  const [snapshot, setSnapshot] = useState<CyclesSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  // Siklus yang sedang dirancang; saat statusnya berubah dari DRAFT, alur dianggap selesai.
  const trackedRef = useRef<string | null>(null);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const refresh = useCallback(async () => {
    try {
      const next = await api<CyclesSnapshot>(`/api/projects/${projectId}/cycles`);
      setSnapshot(next);

      const state = deriveChangeRequestState(next);
      if (state.phase === 'generating' && state.draft) trackedRef.current = state.draft.id;

      const tracked = trackedRef.current;
      if (tracked) {
        const cycle = next.cycles.find((c) => c.id === tracked);
        if (cycle && cycle.status !== 'DRAFT') {
          trackedRef.current = null;
          onFinishedRef.current(tracked);
        } else if (!cycle || (next.jobs.generate.status === 'failed' && next.jobs.generate.cycleId === tracked)) {
          trackedRef.current = null;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat status perubahan.');
    }
  }, [projectId]);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setTimedOut(false);
    void refresh();
  }, [isOpen, refresh]);

  const state: ChangeRequestState | null = snapshot ? deriveChangeRequestState(snapshot) : null;
  const phase = state?.phase;

  useEffect(() => {
    if (!isOpen || (phase !== 'analyzing' && phase !== 'generating')) return;
    setTimedOut(false);
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (attempts > POLL_MAX_ATTEMPTS) {
        clearInterval(timer);
        setTimedOut(true);
        return;
      }
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isOpen, phase, refresh]);

  // Jalankan aksi ke server; apa pun hasilnya, status dimuat ulang agar tampilan mengikuti server
  // (mis. 409 "draf sudah ada" langsung memunculkan draf itu).
  const run = useCallback(
    async (action: () => Promise<unknown>, onSuccess?: () => void) => {
      setBusy(true);
      setError(null);
      try {
        await action();
        onSuccess?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Permintaan gagal diproses.');
      } finally {
        await refresh();
        setBusy(false);
      }
    },
    [refresh]
  );

  const base = `/api/projects/${projectId}`;

  const submitRequest = useCallback(
    (request: string) =>
      run(() => api(`${base}/change-request`, { method: 'POST', body: JSON.stringify({ request }) })),
    [run, base]
  );

  const retryAnalysis = useCallback(
    (cycleId: string) => run(() => api(`${base}/cycles/${cycleId}/analyze`, { method: 'POST' })),
    [run, base]
  );

  const submitClarification = useCallback(
    (cycleId: string, answers: Array<{ questionId: string; answer: string }>) =>
      run(() => api(`${base}/cycles/${cycleId}/clarify`, { method: 'POST', body: JSON.stringify({ answers }) })),
    [run, base]
  );

  const confirm = useCallback(
    (cycleId: string, split: SplitChoice) =>
      run(
        () => api(`${base}/cycles/${cycleId}/generate`, { method: 'POST', body: JSON.stringify({ confirm: true, split }) }),
        () => {
          trackedRef.current = cycleId;
        }
      ),
    [run, base]
  );

  const cancelDraft = useCallback(
    (cycleId: string) => run(() => api(`${base}/cycles/${cycleId}`, { method: 'DELETE' })),
    [run, base]
  );

  return {
    state,
    loaded: snapshot !== null,
    busy,
    error,
    dismissError: () => setError(null),
    timedOut,
    refresh,
    submitRequest,
    retryAnalysis,
    submitClarification,
    confirm,
    cancelDraft,
  };
}
