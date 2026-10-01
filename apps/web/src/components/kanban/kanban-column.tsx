import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { TaskDetail } from '@/components/kanban/task-detail-dialog';
import { TaskCard } from '@/components/kanban/task-card';

type Props = {
  label: string;
  tasks: TaskDetail[];
  onTaskClick: (task: TaskDetail) => void;
};

export function KanbanColumn({ label, tasks, onTaskClick }: Props) {
  return (
    <Card className="border-border flex flex-col h-full overflow-hidden">
      <CardHeader className="pb-2 pt-3 px-3.5 border-b border-border/50 shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {label}
          </CardTitle>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
            {tasks.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-2.5 space-y-2.5 flex-1 min-h-0 overflow-y-auto no-scrollbar">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
        ))}
        {tasks.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6 italic select-none">
            Kosong
          </p>
        )}
      </CardContent>
    </Card>
  );
}
