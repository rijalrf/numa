import { createPortal } from 'react-dom';
import { X, ChevronRight, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { FlowEdge, FlowLane, FlowStep } from '@/lib/flow-layout';
import { LANE_ICON, LANE_KIND_LABEL, STEP_TYPE_LABEL } from './flow-meta';

type Props = {
  step: FlowStep;
  lanes: FlowLane[];
  steps: FlowStep[];
  edges: FlowEdge[];
  onSelect: (stepId: string) => void;
  onClose: () => void;
};

export function FlowStepDialog({ step, lanes, steps, edges, onSelect, onClose }: Props) {
  const stepById = new Map(steps.map((s) => [s.id, s]));
  const laneById = new Map(lanes.map((l) => [l.id, l]));
  const lane = laneById.get(step.laneId);
  const LaneIcon = lane ? LANE_ICON[lane.kind] : null;

  const previous = edges.filter((e) => e.to === step.id);
  const next = edges.filter((e) => e.from === step.id);

  const renderLinks = (list: FlowEdge[], direction: 'from' | 'to', emptyText: string) =>
    list.length === 0 ? (
      <p className="text-xs text-muted-foreground italic py-1">{emptyText}</p>
    ) : (
      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
        {list.map((edge) => {
          const other = stepById.get(direction === 'from' ? edge.from : edge.to);
          if (!other) return null;
          return (
            <div
              key={`${edge.from}-${edge.to}`}
              onClick={() => onSelect(other.id)}
              className="p-2.5 rounded-md bg-muted/20 hover:bg-muted/60 border border-border/60 text-xs flex items-center justify-between cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0 pr-2">
                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="font-medium text-foreground truncate">{other.label}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {edge.label && (
                  <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                    {edge.label}
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground">{laneById.get(other.laneId)?.name}</span>
              </div>
            </div>
          );
        })}
      </div>
    );

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-md shadow-2xl max-w-lg w-full p-6 space-y-4 relative animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="space-y-1.5 pr-6">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-semibold uppercase">
              {STEP_TYPE_LABEL[step.type]}
            </Badge>
            {lane && LaneIcon && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <LaneIcon className="h-3.5 w-3.5" />
                {lane.name} ({LANE_KIND_LABEL[lane.kind]})
              </span>
            )}
          </div>
          <h3 className="text-lg font-semibold text-foreground leading-snug">{step.label}</h3>
        </div>

        <div className="space-y-3.5 text-sm pt-3 border-t border-border">
          <div>
            <span className="text-xs font-medium text-muted-foreground block mb-1.5">
              Langkah Sebelumnya ({previous.length}):
            </span>
            {renderLinks(previous, 'from', 'Tidak ada langkah sebelumnya (titik awal proses).')}
          </div>

          <div>
            <span className="text-xs font-medium text-muted-foreground block mb-1.5">
              Langkah Berikutnya ({next.length}):
            </span>
            {renderLinks(next, 'to', 'Tidak ada langkah lanjutan (titik akhir proses).')}
          </div>

          {step.requirementIds && step.requirementIds.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground block mb-1.5">
                Requirement Terkait:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {step.requirementIds.map((reqId) => (
                  <Badge key={reqId} variant="outline" className="font-mono text-xs bg-primary/10 text-primary border-primary/20">
                    {reqId}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-md bg-muted/40 p-3 text-[11px] text-muted-foreground flex items-start gap-2">
            <ArrowRight className="h-3.5 w-3.5 shrink-0 mt-px" />
            <span>
              Diagram alur bisnis bersifat <strong>read-only</strong>. Task pengerjaan tersedia pada Board Task.
            </span>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-border">
          <Button size="sm" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
