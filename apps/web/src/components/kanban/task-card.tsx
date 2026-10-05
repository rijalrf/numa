import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { TaskDetail } from '@/components/kanban/task-detail-dialog';

type Props = {
  task: TaskDetail;
  onClick: () => void;
};

export function TaskCard({ task, onClick }: Props) {
  const taskIdLabel = task.aiContext?.taskId || (task.order ? `#${task.order}` : undefined);

  return (
    <Card
      onClick={onClick}
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
        </div>
      </CardContent>
    </Card>
  );
}
