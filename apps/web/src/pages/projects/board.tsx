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
      label: 'Perintah Eksekusi',
      onClick: () => setExecutionDialogOpen(true),
      hideIcon: true,
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
        <div className="w-full h-[calc(100vh-230px)] min-h-[560px] overflow-x-auto no-scrollbar">
          <div className="grid grid-cols-6 gap-3.5 h-full min-w-[1150px]">
            {[1, 2, 3, 4, 5, 6].map((colIdx) => (
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
      {/* Action Bar Atas */}
      <div className="flex items-center justify-between gap-3">
        {!tasks.length && !generating ? (
          <Button onClick={generateTasks} size="sm" className="gap-2">
            Generate Tasks
          </Button>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-3 ml-auto">
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
            onClick={() => loadTasks('manual')}
            disabled={refreshing || loading}
            className="gap-1.5 font-medium h-8"
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

      {/* Papan Kanban Terpadu (User Story + Status Task) */}
      <div
        className={`w-full overflow-x-auto no-scrollbar ${
          metrics && metrics.totalCalls > 0
            ? 'h-[calc(100vh-320px)] min-h-[520px]'
            : 'h-[calc(100vh-230px)] min-h-[560px]'
        }`}
      >
        <div className="grid grid-cols-6 gap-3.5 h-full min-w-[1150px]">
          {/* Kolom 1: User Story */}
          <Card className="border-border flex flex-col h-full overflow-hidden">
            <CardHeader className="pb-2 pt-3 px-3.5 border-b border-border/50 shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  USER STORY
                </CardTitle>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                  {userStories.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-2.5 space-y-2.5 flex-1 min-h-0 overflow-y-auto no-scrollbar">
              {/* Daftar User Story */}
              {userStories.map((story) => {
                const storyTasks = tasks.filter((t) => t.aiContext?.userStoryId === story.id);
                const doneCount = storyTasks.filter((t) => t.status === 'DONE').length;
                const cleanAction = story.action.replace(/^saya\s+ingin\s+/i, '');

                return (
                  <Card
                    key={story.id}
                    onClick={() => setSelectedStoryForModal(story)}
                    className="cursor-pointer hover:shadow-md hover:border-primary/50 transition-all border-border bg-card"
                  >
                    <CardHeader className="p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-[10px] font-bold text-primary">
                          {story.id}
                        </span>
                      </div>
                      <p className="text-xs text-foreground/90 font-medium leading-snug line-clamp-3">
                        Saya ingin {cleanAction}, sehingga {story.benefit}.
                      </p>
                      <div className="pt-1 flex items-center justify-start border-t border-border/40">
                        <span className="font-mono text-[10px] text-muted-foreground font-semibold">
                          {doneCount}/{storyTasks.length} tasks
                        </span>
                      </div>
                    </CardHeader>
                  </Card>
                );
              })}

              {userStories.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6 italic select-none">
                  Kosong
                </p>
              )}
            </CardContent>
          </Card>

          {/* Kolom 2-6: Status Kanban */}
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
                    const storyId = task.aiContext?.userStoryId;

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
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                              {task.layer}
                            </Badge>
                            {storyId && (
                              <span className="font-mono text-[10px] font-bold text-primary">
                                {storyId}
                              </span>
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
