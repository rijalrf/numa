import { STEP_ICON, STEP_TYPE_LABEL } from './flow-meta';
import type { FlowStep } from '@/lib/flow-layout';

const TYPES: FlowStep['type'][] = ['start', 'process', 'decision', 'end'];

export function FlowLegend() {
  return (
    <div className="absolute bottom-4 right-4 z-20 pointer-events-none text-xs text-muted-foreground bg-background/90 backdrop-blur-md px-3 py-2 rounded-md border border-border/70 shadow-xs flex flex-wrap items-center gap-x-3 gap-y-1.5 max-w-[60vw]">
      {TYPES.map((type) => {
        const Icon = STEP_ICON[type];
        return (
          <span key={type} className="flex items-center gap-1">
            <Icon className="h-3.5 w-3.5" />
            {STEP_TYPE_LABEL[type]}
          </span>
        );
      })}
      <span className="flex items-center gap-1.5">
        <svg width="26" height="6" aria-hidden="true">
          <line x1="0" y1="3" x2="26" y2="3" strokeWidth="1.5" strokeDasharray="6 4" className="stroke-muted-foreground" />
        </svg>
        Alur ulang (loop)
      </span>
    </div>
  );
}
