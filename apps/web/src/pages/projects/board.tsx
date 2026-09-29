// Board page: papan Kanban task implementasi project dengan kolom User Story & kolom card.
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/lib/http';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  X,
  History,
  GitCommit,
} from 'lucide-react';
import { useWizardNav } from '@/components/layout/wizard-nav';
import { ExecutionDialog } from '@/components/execution/execution-dialog';
import { PricingDialog } from '@/components/billing/pricing-dialog';
import {
  TaskDetailDialog,
  type TaskDetail,
} from '@/components/kanban/task-detail-dialog';
import { CycleBar, type ProjectCycleItem } from '@/components/cycle/cycle-bar';
import { CycleDetailDialog } from '@/components/cycle/cycle-detail-dialog';
import { ChangeRequestPanel } from '@/components/cycle/change-request-panel';

type Task = TaskDetail;

export function BoardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [executionDialogOpen, setExecutionDialogOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [projectName, setProjectName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // State Change Cycle
  const [cycles, setCycles] = useState<ProjectCycleItem[]>([]);
  const [activeCycleId, setActiveCycleId] = useState<string | null | 'all'>('all');
  const [initialTaskCounts, setInitialTaskCounts] = useState<{ total: number; done: number }>({ total: 0, done: 0 });
  const [viewCycleId, setViewCycleId] = useState<string | null>(null);
  const [changePanelOpen, setChangePanelOpen] = useState(false);

  const isGeneratingRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Bersihkan timer polling saat unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const handleTaskStatusChange = (taskId: string, newStatus: Task['status']) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );
    if (selectedTask && selectedTask.id === taskId) {
      setSelectedTask((prev) => (prev ? { ...prev, status: newStatus } : null));
    }
  };

  useEffect(() => {
    if (!projectId) return;
    api<{ project?: { name?: string } }>(`/api/projects/${projectId}`)
      .then((res) => {
        if (res.project?.name) setProjectName(res.project.name);
      })
      .catch(() => {});
  }, [projectId]);

  const handleBackToTree = async () => {
    if (!projectId) return;
    try {
      await api(`/api/projects/${projectId}/wizard-step`, {
        method: 'POST',
        body: JSON.stringify({ step: 'tree' }),
      });
      navigate(`/projects/${projectId}/tree`);
    } catch {
      navigate(`/projects/${projectId}/tree`);
    }
  };

  useWizardNav({
    back: {
      label: 'Kembali',
      onClick: handleBackToTree,
    },
    next:
      !loading && !generating && tasks.length > 0
        ? {
            label: 'Perintah Eksekusi',
            onClick: () => setExecutionDialogOpen(true),
            hideIcon: true,
          }
        : null,
  });

  const pollForGeneratedTasks = useCallback(() => {
    if (!projectId) return;
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    setGenerating(true);
    setError(null);
    let attempts = 0;
    const maxAttempts = 60; // 3 menit (polling tiap 3 detik)

    pollTimerRef.current = setInterval(async () => {
      attempts++;
      try {
        const json = await api<{ tasks: Task[] }>(`/api/projects/${projectId}/tasks`);
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

    try {
      const res = await api<{
        ok: boolean;
        count?: number;
        tasks?: Task[];
        error?: string;
      }>(`/api/projects/${projectId}/tasks/generate`, {
        method: 'POST',
      });

      if (res.tasks && res.tasks.length > 0) {
        setTasks(res.tasks);
        setSuccessMessage(`${res.tasks.length} task berhasil dirancang.`);
        setError(null);
      } else {
        const refreshJson = await api<{ tasks: Task[] }>(
          `/api/projects/${projectId}/tasks`
        );
        const fetchedTasks = refreshJson.tasks || [];
        setTasks(fetchedTasks);
        if (fetchedTasks.length > 0) {
          setSuccessMessage(`${fetchedTasks.length} task berhasil dirancang.`);
          setError(null);
        }
      }
      isGeneratingRef.current = false;
      setGenerating(false);
      setLoading(false);
    } catch (err: any) {
      console.error('Error generating tasks:', err);
      if (err?.status === 409) {
        // Generasi sedang berjalan di server — aktifkan polling otomatis
        pollForGeneratedTasks();
      } else {
        isGeneratingRef.current = false;
        setGenerating(false);
        setLoading(false);
        const msg = err instanceof Error ? err.message : 'Gagal menghasilkan task.';
        setError(`Gagal merancang task: ${msg}`);
      }
    }
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
    async (mode: 'initial' | 'manual' | 'silent' = 'initial') => {
      if (!projectId) return;
      if (mode === 'manual') setRefreshing(true);

      try {
        const cycleParam = activeCycleId !== undefined ? `?cycleId=${activeCycleId}` : '';
        const json = await api<{ tasks: Task[] }>(
          `/api/projects/${projectId}/tasks${cycleParam}`
        );
        if (json.tasks && json.tasks.length > 0) {
          setTasks(json.tasks);
          setError(null);
        } else if (mode === 'initial') {
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
    [projectId, generateTasks, activeCycleId]
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

  // Polling saat auto refresh aktif (tiap 5 detik)
  useEffect(() => {
    if (!autoRefresh || !projectId) return;
    const timer = setInterval(() => {
      loadTasks('silent');
      loadCycles();
    }, 5000);
    return () => clearInterval(timer);
  }, [autoRefresh, projectId, loadTasks, loadCycles]);

  const columns: Array<{ status: string; label: string }> = [
    { status: 'TODO', label: 'To Do' },
    { status: 'IN_PROGRESS', label: 'In Progress' },
    { status: 'BLOCKED', label: 'Blocked' },
    { status: 'DONE', label: 'Done' },
  ];

  const selectedCycleObj = typeof activeCycleId === 'string' && activeCycleId !== 'all'
    ? cycles.find((c) => c.id === activeCycleId)
    : null;
  const isArchiveView = selectedCycleObj?.status === 'DONE';

  const displayedTasks = tasks;

  if (generating || loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse px-1">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>{generating ? 'Sedang merancang task dengan AI...' : 'Memuat papan task...'}</span>
        </div>
        <div className="w-full h-[calc(100vh-230px)] min-h-[560px] overflow-x-auto no-scrollbar">
          <div className="grid grid-cols-4 gap-3.5 h-full min-w-[900px]">
            {[1, 2, 3, 4].map((colIdx) => (
              <Card key={colIdx} className="h-full flex flex-col">
                <CardHeader className="shrink-0">
                  <div className="h-5 bg-muted w-2/3 rounded animate-pulse" />
                </CardHeader>
                <CardContent className="space-y-3 flex-1 overflow-hidden">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 bg-muted rounded animate-pulse" />
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Banner Error jika terjadi kesalahan */}
      {error && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-md border border-destructive/30 bg-destructive/10 text-xs text-destructive">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="truncate">{error}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {error.includes('Kuota proyek') ? (
              <Button
                size="sm"
                onClick={() => setPricingOpen(true)}
                className="h-7 px-3 text-xs font-medium gap-1"
              >
                <Sparkles className="h-3 w-3" />
                Upgrade Paket
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => loadTasks('manual')}
                  disabled={generating}
                  className="h-7 text-xs gap-1 border-destructive/30 hover:bg-destructive/10 text-destructive"
                >
                  <RefreshCw className="h-3 w-3" />
                  Periksa Ulang
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={generateTasks}
                  disabled={generating}
                  className="h-7 text-xs"
                >
                  {generating ? 'Memproses...' : 'Coba Lagi'}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Banner Sukses saat task berhasil dirancang */}
      {successMessage && (
        <div className="flex items-center justify-between gap-3 p-2.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-400">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-muted-foreground hover:text-foreground p-0.5 rounded-md transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Banner Arsip jika melihat siklus yang sudah selesai */}
      {isArchiveView && selectedCycleObj && (
        <div className="flex items-center justify-between gap-2 p-2.5 rounded-md border border-border/80 bg-muted/40 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>
              Menampilkan arsip Siklus #{selectedCycleObj.number} ({selectedCycleObj.title}) — berstatus selesai (hanya baca).
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setActiveCycleId('all')}
            className="h-6 px-2 text-xs font-medium"
          >
            Tampilkan Semua
          </Button>
        </div>
      )}

      {/* Action Bar Atas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Cycle Bar & Pengalih Siklus */}
        <div className="flex items-center gap-2">
          <CycleBar
            cycles={cycles}
            activeCycleId={activeCycleId}
            onSelectCycle={(id) => setActiveCycleId(id)}
            initialTaskCounts={initialTaskCounts}
          />
          {selectedCycleObj && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setViewCycleId(selectedCycleObj.id)}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
            >
              <History className="h-3.5 w-3.5" />
              <span>Detail Siklus</span>
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3 ml-auto sm:ml-0">
          {/* Toggle Auto Refresh */}
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            <span>Auto Refresh</span>
            <button
              type="button"
              role="switch"
              aria-checked={autoRefresh}
              onClick={() => setAutoRefresh((prev) => !prev)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                autoRefresh ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-md ring-0 transition duration-200 ease-in-out ${
                  autoRefresh ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </label>

          <Button
            size="sm"
            onClick={() => setChangePanelOpen(true)}
            className="gap-1.5 font-medium h-8"
          >
            <GitCommit className="h-3.5 w-3.5" />
            <span>Minta Perubahan</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              loadTasks('manual');
              loadCycles();
            }}
            disabled={refreshing || loading}
            className="gap-1.5 font-medium h-8"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Memuat...' : 'Refresh'}</span>
          </Button>
        </div>
      </div>

      {/* Tampilan Empty State jika tasks kosong */}
      {!tasks.length ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed rounded-md bg-card/50 space-y-4 min-h-[420px]">
          <div className="h-12 w-12 rounded-md bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Layers className="h-6 w-6" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h3 className="text-base font-semibold text-foreground">Belum Ada Task yang Dirancang</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Task implementasi belum tersedia untuk proyek ini. Klik tombol di bawah agar AI Numa menyusun daftar task dengan bounded context dan acceptance criteria berdasarkan dokumen PRD & diagram arsitektur.
            </p>
          </div>
          <Button onClick={generateTasks} className="gap-2">
            <Sparkles className="h-4 w-4" />
            Generate Tasks Sekarang
          </Button>
        </div>
      ) : (
        /* Papan Kanban Status Task */
        <div className="w-full overflow-x-auto no-scrollbar h-[calc(100vh-230px)] min-h-[560px]">
          <div className="grid grid-cols-4 gap-3.5 h-full min-w-[900px]">
            {/* Kolom 1-4: Status Kanban */}
            {columns.map((col) => {
              const colTasks = displayedTasks.filter((t) => t.status === col.status);
              return (
                <Card key={col.status} className="border-border flex flex-col h-full overflow-hidden">
                  <CardHeader className="pb-2 pt-3 px-3.5 border-b border-border/50 shrink-0">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {col.label}
                      </CardTitle>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                        {colTasks.length}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-2.5 space-y-2.5 flex-1 min-h-0 overflow-y-auto no-scrollbar">
                    {colTasks.map((task) => {
                      const taskIdLabel = task.aiContext?.taskId || (task.order ? `#${task.order}` : undefined);
                      const reqIds = task.aiContext?.requirement_ids;

                      return (
                        <Card
                          key={task.id}
                          onClick={() => setSelectedTask(task)}
                          className="cursor-pointer hover:shadow-md hover:border-primary/50 transition-all border-border bg-card"
                        >
                          <CardHeader className="pb-1.5 pt-2.5 px-3">
                            {taskIdLabel && (
                              <div className="mb-1">
                                <span className="font-mono text-[10px] text-muted-foreground font-semibold">
                                  {taskIdLabel}
                                </span>
                              </div>
                            )}
                            <CardTitle className="text-xs font-semibold leading-snug">{task.title}</CardTitle>
                          </CardHeader>
                          <CardContent className="px-3 pb-2.5 pt-0">
                            {task.description && (
                              <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                                {task.description}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                                {task.layer}
                              </Badge>
                              {reqIds && reqIds.length > 0 && (
                                <div className="flex flex-wrap gap-1 items-center">
                                  {reqIds.slice(0, 2).map((r) => (
                                    <span key={r} className="font-mono text-[9px] font-bold text-primary bg-primary/10 px-1 py-0.5 rounded border border-primary/20">
                                      {r}
                                    </span>
                                  ))}
                                  {reqIds.length > 2 && (
                                    <span className="font-mono text-[9px] text-muted-foreground">
                                      +{reqIds.length - 2}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                    {colTasks.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-6 italic select-none">
                        Kosong
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <ExecutionDialog
        projectId={projectId!}
        projectName={projectName}
        isOpen={executionDialogOpen}
        onClose={() => setExecutionDialogOpen(false)}
      />

      <TaskDetailDialog
        task={selectedTask}
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onStatusChange={handleTaskStatusChange}
      />

      <PricingDialog
        isOpen={pricingOpen}
        onClose={() => setPricingOpen(false)}
        title="Tingkatkan Kuota Proyek Anda"
        description="Batas kuota proyek untuk paket Anda saat ini telah tercapai. Upgrade ke paket yang lebih tinggi untuk merancang dan mengeksekusi lebih banyak proyek."
      />

      <CycleDetailDialog
        projectId={projectId!}
        cycleId={viewCycleId}
        onClose={() => setViewCycleId(null)}
      />

      <ChangeRequestPanel
        projectId={projectId!}
        isOpen={changePanelOpen}
        onClose={() => setChangePanelOpen(false)}
      />
    </div>
  );
}
