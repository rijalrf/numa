// Board page: papan Kanban task implementasi project dengan kolom User Story & kolom card.
import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/lib/http';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  RefreshCw,
  Activity,
  Zap,
  Clock,
  CheckCircle2,
  BookOpen,
} from 'lucide-react';
import { useWizardNav } from '@/components/layout/wizard-nav';
import { ExecutionDialog } from '@/components/execution/execution-dialog';
import {
  TaskDetailDialog,
  type TaskDetail,
  type UserStory,
} from '@/components/kanban/task-detail-dialog';
import { UserStoryTasksDialog } from '@/components/kanban/user-story-tasks-dialog';

type AiMetricsSummary = {
  totalCalls: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  avgLatencyMs: number;
  successRate: number;
};

type Task = TaskDetail;

export function BoardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [userStories, setUserStories] = useState<UserStory[]>([]);
  const [selectedStoryForModal, setSelectedStoryForModal] = useState<UserStory | null>(null);
  const [metrics, setMetrics] = useState<AiMetricsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [executionDialogOpen, setExecutionDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [projectName, setProjectName] = useState('');

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
      label: 'Kembali ke Diagram Struktur',
      onClick: handleBackToTree,
    },
    next: {
      label: 'Panduan Eksekusi',
      onClick: () => setExecutionDialogOpen(true),
    },
  });

  const loadMetrics = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await api<{ summary: AiMetricsSummary }>(`/api/projects/${projectId}/ai-metrics`);
      if (res.summary) setMetrics(res.summary);
    } catch {}
  }, [projectId]);

  const loadTasks = useCallback(
    async (mode: 'initial' | 'manual' | 'silent' = 'initial') => {
      if (!projectId) return;
      if (mode === 'manual') setRefreshing(true);

      try {
        const json = await api<{ tasks: Task[]; userStories?: UserStory[] }>(
          `/api/projects/${projectId}/tasks`
        );
        if (json.tasks && json.tasks.length > 0) {
          setTasks(json.tasks);
          if (json.userStories) setUserStories(json.userStories);
        } else if (mode === 'initial') {
          await generateTasks();
        }
        loadMetrics();
      } catch (err) {
        console.error('Gagal load tasks:', err);
      } finally {
        if (mode === 'initial') setLoading(false);
        if (mode === 'manual') setRefreshing(false);
      }
    },
    [projectId, loadMetrics]
  );

  // Load tasks on mount
  useEffect(() => {
    loadTasks('initial');
  }, [loadTasks]);

  // Polling saat auto refresh aktif (tiap 5 detik)
  useEffect(() => {
    if (!autoRefresh || !projectId) return;
    const timer = setInterval(() => {
      loadTasks('silent');
    }, 5000);
    return () => clearInterval(timer);
  }, [autoRefresh, projectId, loadTasks]);

  const generateTasks = async () => {
    if (!projectId) return;
    setGenerating(true);

    try {
      await api(`/api/projects/${projectId}/tasks/generate`, {
        method: 'POST',
      });
      const refreshJson = await api<{ tasks: Task[]; userStories?: UserStory[] }>(
        `/api/projects/${projectId}/tasks`
      );
      setTasks(refreshJson.tasks || []);
      if (refreshJson.userStories) setUserStories(refreshJson.userStories);
    } catch (err) {
      console.error('Error generating tasks:', err);
    } finally {
      setGenerating(false);
      setLoading(false);
    }
  };

  const columns: Array<{ status: string; label: string }> = [
    { status: 'TODO', label: 'To Do' },
    { status: 'IN_PROGRESS', label: 'In Progress' },
    { status: 'REVIEW', label: 'Review' },
    { status: 'DONE', label: 'Done' },
    { status: 'BLOCKED', label: 'Blocked' },
  ];

  const displayedTasks = tasks;

  if (loading || generating) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          <div className="w-full lg:w-80 shrink-0">
            <Card>
              <CardHeader>
                <div className="h-5 bg-muted w-2/3 rounded animate-pulse" />
              </CardHeader>
              <CardContent className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 bg-muted rounded animate-pulse" />
                ))}
              </CardContent>
            </Card>
          </div>
          <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-4 w-full">
            {columns.map((col) => (
              <Card key={col.status}>
                <CardHeader>
                  <div className="h-5 bg-muted w-1/2 rounded animate-pulse" />
                </CardHeader>
                <CardContent className="space-y-3">
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
      {/* Action Bar Atas */}
      <div className="flex items-center justify-between gap-3">
        {!tasks.length && !generating ? (
          <Button onClick={generateTasks} size="sm" className="gap-2">
            Generate Tasks
          </Button>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2 ml-auto">
          <Button
            size="sm"
            variant={autoRefresh ? 'default' : 'outline'}
            onClick={() => setAutoRefresh((prev) => !prev)}
            className="gap-1.5 font-medium"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground'
              }`}
            />
            <span>Auto Refresh: {autoRefresh ? 'Aktif (5s)' : 'Mati'}</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => loadTasks('manual')}
            disabled={refreshing || loading}
            className="gap-1.5 font-medium"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Memuat...' : 'Refresh'}</span>
          </Button>
        </div>
      </div>

      {/* Widget Observabilitas AI (Bab 39) */}
      {metrics && metrics.totalCalls > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Panggilan AI</span>
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <div className="text-xl font-bold mt-1 font-mono">{metrics.totalCalls}</div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Total Token</span>
              <Zap className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-xl font-bold mt-1 font-mono">{metrics.totalTokens.toLocaleString('id-ID')}</div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Rata-rata Latensi</span>
              <Clock className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-xl font-bold mt-1 font-mono">{(metrics.avgLatencyMs / 1000).toFixed(1)}s</div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Tingkat Keberhasilan</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-xl font-bold mt-1 font-mono">{metrics.successRate}%</div>
          </Card>
        </div>
      )}

      {/* Layout Utama: Kolom User Story & Kolom Card Kanban */}
      <div className="flex flex-col xl:flex-row gap-4 items-stretch xl:h-[calc(100vh-210px)] xl:min-h-[600px]">
        {/* Kolom User Story (Sisi Kiri) */}
        <div className="w-full xl:w-80 shrink-0 h-full">
          <Card className="border-border shadow-xs flex flex-col h-full">
            <CardHeader className="pb-3 border-b border-border/60 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm font-bold">User Story</CardTitle>
                </div>
                <Badge variant="outline" className="text-[11px] font-mono">
                  {userStories.length} story
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Induk kebutuhan. Klik story untuk melihat daftar task.
              </p>
            </CardHeader>
            <CardContent className="p-3 space-y-2.5 flex-1 min-h-0 overflow-y-auto no-scrollbar">
              {/* Daftar User Story */}
              {userStories.map((story) => {
                const storyTasks = tasks.filter((t) => t.aiContext?.userStoryId === story.id);
                const doneCount = storyTasks.filter((t) => t.status === 'DONE').length;
                const percent =
                  storyTasks.length > 0 ? Math.round((doneCount / storyTasks.length) * 100) : 0;
                const cleanAction = story.action.replace(/^saya\s+ingin\s+/i, '');

                return (
                  <div
                    key={story.id}
                    onClick={() => setSelectedStoryForModal(story)}
                    className="p-3 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-muted/20 cursor-pointer transition-all space-y-2 group shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-xs font-bold text-primary group-hover:underline">
                        {story.id}
                      </span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-muted/40">
                        {story.persona}
                      </Badge>
                    </div>
                    <p className="text-xs text-foreground/90 font-medium leading-snug line-clamp-2">
                      Saya ingin {cleanAction}, sehingga {story.benefit}.
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/50">
                      <span className="text-primary font-medium text-[11px] group-hover:underline">
                        Lihat {storyTasks.length} task &rarr;
                      </span>
                      <span>
                        {doneCount}/{storyTasks.length} ({percent}%)
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full transition-all duration-300"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              {userStories.length === 0 && (
                <div className="p-4 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
                  Belum ada data User Story di BRD.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Kolom Card (Papan Kanban di Sebelah Kanan Kolom User Story) */}
        <div className="flex-1 min-w-0 w-full h-full">
          {/* Kolom Card Status Kanban */}
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3.5 h-full">
            {columns.map((col) => {
              const colTasks = displayedTasks.filter((t) => t.status === col.status);
              return (
                <Card key={col.status} className="border-border flex flex-col h-full">
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
                      const pendingDeps = (task.dependsOn ?? []).filter((d) => d.dependsOn.status !== 'DONE');
                      const isBlocked = pendingDeps.length > 0;
                      const taskIdLabel = task.aiContext?.taskId || (task.order ? `#${task.order}` : undefined);
                      const storyId = task.aiContext?.userStoryId;

                      return (
                        <Card
                          key={task.id}
                          onClick={() => setSelectedTask(task)}
                          className="cursor-pointer hover:shadow-md hover:border-primary/50 transition-all border-border bg-card"
                        >
                          <CardHeader className="pb-1.5 pt-2.5 px-3">
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {taskIdLabel && (
                                  <span className="font-mono text-[10px] text-muted-foreground font-semibold">
                                    {taskIdLabel}
                                  </span>
                                )}
                                {storyId && (
                                  <Badge
                                    variant="outline"
                                    className="font-mono text-[9px] px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/25 font-bold flex items-center gap-1"
                                  >
                                    <BookOpen className="h-2.5 w-2.5 shrink-0" />
                                    <span>US: {storyId}</span>
                                  </Badge>
                                )}
                              </div>
                              {task.aiContext?.requirement_ids && task.aiContext.requirement_ids.length > 0 && (
                                <span className="font-mono text-[9px] text-primary">
                                  {task.aiContext.requirement_ids[0]}
                                </span>
                              )}
                            </div>
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
                              {col.status === 'TODO' && isBlocked && (
                                <Badge variant="warning" className="text-[9px] px-1.5 py-0">
                                  Tunggu #{pendingDeps.map((d) => d.dependsOn.order).join(', ')}
                                </Badge>
                              )}
                              {col.status === 'TODO' && !isBlocked && (task.dependsOn ?? []).length > 0 && (
                                <Badge variant="success" className="text-[9px] px-1.5 py-0">
                                  Siap
                                </Badge>
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
      </div>

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
        userStories={userStories}
      />

      <UserStoryTasksDialog
        story={selectedStoryForModal}
        tasks={
          selectedStoryForModal
            ? tasks.filter((t) => t.aiContext?.userStoryId === selectedStoryForModal.id)
            : []
        }
        isOpen={!!selectedStoryForModal}
        onClose={() => setSelectedStoryForModal(null)}
        onSelectTask={(task) => {
          setSelectedStoryForModal(null);
          setSelectedTask(task);
        }}
      />
    </div>
  );
}
