import { useMemo, useState } from 'react';
import type { FlowNodeBox, SwimlaneLayout } from '@/lib/flow-layout';
import { FlowEdgePath } from './flow-edge-path';
import { FlowNodeCard } from './flow-node-card';
import { SwimlaneLane } from './swimlane-lane';

type Props = {
  layout: SwimlaneLayout;
  activeLaneId: string | null;
  onToggleLane: (laneId: string) => void;
  onSelectNode: (node: FlowNodeBox) => void;
};

// Isi kanvas swimlane. Pan dan zoom ditangani wrapper halaman (useTreePanZoom).
export function SwimlaneCanvas({ layout, activeLaneId, onToggleLane, onSelectNode }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const nodeLane = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n.laneId])), [layout.nodes]);

  return (
    <>
      {layout.lanes.map((lane) => (
        <SwimlaneLane
          key={lane.id}
          lane={lane}
          height={layout.height}
          headerHeight={layout.headerHeight}
          active={activeLaneId === lane.id}
          dimmed={activeLaneId !== null && activeLaneId !== lane.id}
          onToggle={onToggleLane}
        />
      ))}

      <svg
        className="absolute inset-0 pointer-events-none"
        width={layout.width}
        height={layout.height}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground/70" />
          </marker>
          <marker id="flow-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary" />
          </marker>
        </defs>
        {layout.edges.map((edge) => (
          <FlowEdgePath
            key={edge.id}
            edge={edge}
            highlighted={hoveredId !== null && (edge.from === hoveredId || edge.to === hoveredId)}
            dimmed={
              activeLaneId !== null &&
              nodeLane.get(edge.from) !== activeLaneId &&
              nodeLane.get(edge.to) !== activeLaneId
            }
          />
        ))}
      </svg>

      {layout.nodes.map((node) => (
        <FlowNodeCard
          key={node.id}
          node={node}
          dimmed={activeLaneId !== null && node.laneId !== activeLaneId}
          onClick={onSelectNode}
          onHover={setHoveredId}
        />
      ))}
    </>
  );
}
