import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  X,
  BookOpen,
  CheckCircle2,
  Clock,
  Layers,
  CheckSquare,
  ArrowRight,
  ListTodo,
} from 'lucide-react';
import type { TaskDetail, UserStory } from './task-detail-dialog';

interface UserStoryTasksDialogProps {
  story: UserStory | null;
  tasks: TaskDetail[];
  isOpen: boolean;
  onClose: () => void;
  onSelectTask?: (task: TaskDetail) => void;
}

export function UserStoryTasksDialog({
  story,
  tasks,
  isOpen,
  onClose,
  onSelectTask,
}: UserStoryTasksDialogProps) {
  if (!isOpen || !story) return null;

  const doneCount = tasks.filter((t) => t.status === 'DONE').length;
  const inProgressCount = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
  const percent = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;

  const getStatusBadgeVariant = (status: TaskDetail['status']) => {
    switch (status) {
      case 'DONE':
        return 'success';
      case 'IN_PROGRESS':
        return 'warning';
      case 'BLOCKED':
        return 'outline';
      default:
        return 'outline';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-5 my-8 text-foreground transition-all">
        {/* Header Dialog */}
        <div className="flex items-start justify-between gap-4 border-b border-border/80 pb-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-xs font-mono font-bold bg-primary/10 text-primary border-primary/20">
                <BookOpen className="h-3 w-3 mr-1" />
                {story.id}
              </Badge>
              <Badge variant="outline" className="text-xs font-semibold">
                Sebagai {story.persona}
              </Badge>
            </div>
            <h2 className="text-base font-bold leading-snug">
              Saya ingin {story.action.replace(/^saya\s+ingin\s+/i, '')}, sehingga {story.benefit}.
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-muted shrink-0"
            aria-label="Tutup dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress & Statistik Task */}
        <div className="p-3.5 rounded-xl bg-muted/20 border border-border space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-muted-foreground flex items-center gap-1.5">
              <ListTodo className="h-3.5 w-3.5 text-primary" /> Progress Penyelesaian Task
            </span>
            <span className="font-mono font-bold text-foreground">
              {doneCount}/{tasks.length} Task Selesai ({percent}%)
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="bg-emerald-500 h-full transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground pt-1">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" /> {doneCount} Selesai
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-amber-500" /> {inProgressCount} Dalam Proses
            </span>
            <span className="flex items-center gap-1">
              {tasks.length - doneCount - inProgressCount} Menunggu / Todo
            </span>
          </div>
        </div>

        {/* Kriteria Penerimaan User Story (Opsional) */}
        {story.acceptanceCriteria && story.acceptanceCriteria.length > 0 && (
          <div className="space-y-1.5 bg-muted/10 border border-border/60 p-3 rounded-xl">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <CheckSquare className="h-3 w-3 text-primary" /> Kriteria Penerimaan Story:
            </span>
            <ul className="space-y-1 text-xs text-foreground/90 pl-1">
              {story.acceptanceCriteria.map((ac, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-primary font-bold leading-none mt-1">-</span>
                  <span>{ac}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Daftar Task Terkait */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Daftar Task Terkait ({tasks.length})
            </h3>
            <span className="text-[11px] text-muted-foreground">
              Klik task untuk melihat detail instruksi
            </span>
          </div>

          <div className="space-y-2 max-h-[45vh] overflow-y-auto no-scrollbar pr-1">
            {tasks.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
                Belum ada task yang dikaitkan ke User Story ini.
              </div>
            ) : (
              tasks.map((task) => {
                const taskIdLabel = task.aiContext?.taskId || (task.order ? `#${task.order}` : task.id.slice(0, 8));
                return (
                  <div
                    key={task.id}
                    onClick={() => {
                      if (onSelectTask) {
                        onSelectTask(task);
                      }
                    }}
                    className="p-3 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-muted/30 cursor-pointer transition-all flex items-center justify-between gap-3 group"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {taskIdLabel}
                        </span>
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                          <Layers className="h-2.5 w-2.5 mr-1" />
                          {task.layer}
                        </Badge>
                        <Badge
                          variant={getStatusBadgeVariant(task.status)}
                          className="text-[10px] py-0 px-1.5"
                        >
                          {task.status}
                        </Badge>
                      </div>
                      <h4 className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                        {task.title}
                      </h4>
                      {task.description && (
                        <p className="text-[11px] text-muted-foreground line-clamp-1">
                          {task.description}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 shrink-0 text-muted-foreground group-hover:text-primary"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border/80 pt-3 flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>
    </div>
  );
}
