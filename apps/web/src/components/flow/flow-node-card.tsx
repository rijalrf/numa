import { cn } from '@/lib/utils';
import type { FlowNodeBox } from '@/lib/flow-layout';
import { STEP_ICON, STEP_TYPE_LABEL } from './flow-meta';

type Props = {
  node: FlowNodeBox;
  dimmed: boolean;
  onClick: (node: FlowNodeBox) => void;
  onHover: (nodeId: string | null) => void;
};

const SHAPE: Record<FlowNodeBox['type'], string> = {
  start: 'rounded-full bg-emerald-500/10 border border-emerald-500/40 hover:border-emerald-500',
  end: 'rounded-full bg-muted border border-border hover:border-muted-foreground/60',
  decision: 'rounded-md border-2 border-amber-500/50 bg-amber-500/10 hover:border-amber-500',
  process: 'rounded-md bg-card border border-border hover:border-primary/50',
};

const ACCENT: Record<FlowNodeBox['type'], string> = {
  start: 'text-emerald-600 dark:text-emerald-400',
  end: 'text-muted-foreground',
  decision: 'text-amber-600 dark:text-amber-400',
  process: 'text-primary',
};

export function FlowNodeCard({ node, dimmed, onClick, onHover }: Props) {
  const Icon = STEP_ICON[node.type];
  const requirementCount = node.requirementIds?.length ?? 0;
  const isPill = node.type === 'start' || node.type === 'end';

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick(node);
      }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      style={{ position: 'absolute', left: node.x, top: node.y, width: node.width, height: node.height }}
      title={`${STEP_TYPE_LABEL[node.type]}: ${node.label}`}
      className={cn(
        'tree-node-card cursor-pointer px-3.5 py-2 flex flex-col justify-center gap-1 text-card-foreground shadow-2xs',
        'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]',
        SHAPE[node.type],
        isPill && 'items-center text-center',
        dimmed && 'opacity-30'
      )}
    >
      <div className={cn('flex items-center gap-1.5', ACCENT[node.type])}>
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="text-[10px] uppercase font-semibold tracking-wider">{STEP_TYPE_LABEL[node.type]}</span>
        {requirementCount > 0 && (
          <span className="text-[10px] px-1.5 rounded-md font-mono bg-primary/10 text-primary border border-primary/20">
            {requirementCount} req
          </span>
        )}
      </div>
      <p className="text-xs font-medium leading-snug line-clamp-2">{node.label}</p>
    </div>
  );
}
