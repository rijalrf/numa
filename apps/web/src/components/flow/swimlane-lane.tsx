import { cn } from '@/lib/utils';
import type { LaneBox } from '@/lib/flow-layout';
import { LANE_ICON } from './flow-meta';

type Props = {
  lane: LaneBox;
  height: number;
  headerHeight: number;
  active: boolean;
  dimmed: boolean;
  onToggle: (laneId: string) => void;
};

// Kolom latar satu persona beserta header yang bisa diklik untuk menyorot lane
export function SwimlaneLane({ lane, height, headerHeight, active, dimmed, onToggle }: Props) {
  const Icon = LANE_ICON[lane.kind];

  return (
    <div
      className={cn(
        'absolute top-0 border-x border-border/60 transition-opacity',
        lane.index % 2 === 0 ? 'bg-muted/25' : 'bg-muted/10',
        dimmed && 'opacity-60'
      )}
      style={{ left: lane.x, width: lane.width, height }}
    >
      <button
        type="button"
        onClick={() => onToggle(lane.id)}
        title={active ? 'Tampilkan semua persona' : `Sorot lane ${lane.name}`}
        className={cn(
          'tree-node-card w-full flex items-center justify-center gap-2 border-b border-border text-sm font-semibold cursor-pointer transition-colors',
          active ? 'bg-primary/15 text-primary' : 'bg-card/90 text-foreground hover:bg-accent/50'
        )}
        style={{ height: headerHeight }}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{lane.name}</span>
      </button>
    </div>
  );
}
