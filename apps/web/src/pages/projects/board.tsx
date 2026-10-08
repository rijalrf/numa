// Board page: papan Kanban task implementasi project dengan kolom User Story & kolom card.
import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, downloadFile } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { AlertBanner } from '@/components/ui/alert-banner';
import { NumaLoader } from '@/components/ui/numa-loader';
import {
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  History,
  GitCommit,
  Download,
} from 'lucide-react';
import { useWizardNav } from '@/components/layout/wizard-nav';
import { ExecutionDialog } from '@/components/execution/execution-dialog';
import { PricingDialog } from '@/components/billing/pricing-dialog';
import {
  TaskDetailDialog,
  type TaskDetail,
} from '@/components/kanban/task-detail-dialog';
import { KanbanColumn } from '@/components/kanban/kanban-column';
import { CheckpointBanner } from '@/components/kanban/checkpoint-banner';
import { CycleBar } from '@/components/cycle/cycle-bar';
import { CycleDetailDialog } from '@/components/cycle/cycle-detail-dialog';
import { ChangeRequestPanel } from '@/components/cycle/change-request-panel';
import { useProjectTasks } from '@/hooks/use-project-tasks';

export function BoardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [executionDialogOpen, setExecutionDialogOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [projectName, setProjectName] = useState('');
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [viewCycleId, setViewCycleId] = useState<string | null>(null);
  const [changePanelOpen, setChangePanelOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const {
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
  } = useProjectTasks(projectId);

  const handleTaskStatusChange = (taskId: string, newStatus: TaskDetail['status']) => {
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

  const handleBackToPrd = async () => {
    if (!projectId) return;
    try {
      await api(`/api/projects/${projectId}/wizard-step`, {
        method: 'POST',
        body: JSON.stringify({ step: 'prd' }),
      });
      navigate(`/projects/${projectId}/prd`);
    } catch {
      navigate(`/projects/${projectId}/prd`);
    }
  };

  const handleDownloadZip = async () => {
    if (!projectId) return;
    setDownloadingZip(true);
    setDownloadError(null);
    try {
      await downloadFile(`/api/projects/${projectId}/export.zip`, `${projectName || 'Proyek'}_paket.zip`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengunduh Paket Lengkap.';
      setDownloadError(msg);
    } finally {
      setDownloadingZip(false);
    }
  };

  const extraNav = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleDownloadZip}
          disabled={downloadingZip || loading || generating || !tasks.length}
          className="gap-1.5 font-medium h-8"
        >
          {downloadingZip ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          <span>{downloadingZip ? 'Mengunduh...' : 'Unduh Paket'}</span>
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setChangePanelOpen(true)}
          className="gap-1.5 font-medium h-8"
        >
          <GitCommit className="h-3.5 w-3.5" />
          <span>Minta Perubahan</span>
        </Button>
      </div>
    ),
    [downloadingZip, loading, generating, tasks.length, projectId, projectName]
  );

  useWizardNav(
    loading || generating
      ? null
      : {
          back: {
            label: 'Kembali',
            onClick: handleBackToPrd,
          },
          next:
            tasks.length > 0
              ? {
                  label: 'AI Agent Prompt',
                  onClick: () => setExecutionDialogOpen(true),
                  hideIcon: true,
                }
              : null,
          extra: extraNav,
        }
  );

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
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center">
        <NumaLoader
          label={generating ? 'Sedang merancang task...' : 'Memuat papan task...'}
          sublabel={generating ? 'AI sedang menyusun daftar task berdasarkan diagram arsitektur' : undefined}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Checkpoint menunggu persetujuan; dimuat ulang setiap jumlah task DONE berubah */}
      {projectId && (
        <CheckpointBanner
          projectId={projectId}
          refreshKey={tasks.filter((t) => t.status === 'DONE').length}
        />
      )}

      {/* Banner Error jika terjadi kesalahan */}
      {error && (
        <AlertBanner variant="destructive" className="gap-3 p-3">
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
        </AlertBanner>
      )}

      {/* Banner Pesan Error Unduhan ZIP */}
      {downloadError && (
        <AlertBanner
          variant="destructive"
          className="p-3 gap-2"
          onDismiss={() => setDownloadError(null)}
          dismissLabel="Tutup pesan error"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{downloadError}</span>
            {downloadError.includes('upgrade') && (
              <button
                type="button"
                onClick={() => setPricingOpen(true)}
                className="underline font-semibold ml-1 hover:text-foreground cursor-pointer"
              >
                Lihat Paket
              </button>
            )}
          </div>
        </AlertBanner>
      )}

      {/* Banner Sukses saat task berhasil dirancang */}
      {successMessage && (
        <AlertBanner
          variant="success"
          className="gap-3 p-2.5"
          onDismiss={() => setSuccessMessage(null)}
        >
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            <span>{successMessage}</span>
          </div>
        </AlertBanner>
      )}

      {/* Banner Arsip jika melihat siklus yang sudah selesai */}
      {isArchiveView && selectedCycleObj && (
        <AlertBanner variant="info" className="gap-2 p-2.5">
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
        </AlertBanner>
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
                <KanbanColumn
                  key={col.status}
                  label={col.label}
                  tasks={colTasks}
                  onTaskClick={setSelectedTask}
                />
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
