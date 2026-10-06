import { cn } from '@/lib/utils';
import type { FlowEdgePath as EdgePath, Point } from '@/lib/flow-layout';

type Props = {
  edge: EdgePath;
  highlighted: boolean;
  dimmed: boolean;
};

const RADIUS = 8;

// Path ortogonal dengan sudut membulat
export function roundedPath(points: Point[], radius = RADIUS): string {
  const pts = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const lenIn = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const lenOut = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(radius, lenIn / 2, lenOut / 2);
    const start = { x: cur.x + ((prev.x - cur.x) / lenIn) * r, y: cur.y + ((prev.y - cur.y) / lenIn) * r };
    const end = { x: cur.x + ((next.x - cur.x) / lenOut) * r, y: cur.y + ((next.y - cur.y) / lenOut) * r };
    d += ` L ${start.x} ${start.y} Q ${cur.x} ${cur.y} ${end.x} ${end.y}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

export function FlowEdgePath({ edge, highlighted, dimmed }: Props) {
  const labelWidth = edge.label ? Math.max(edge.label.length * 6.5 + 14, 32) : 0;

  return (
    <g className={cn('transition-opacity', dimmed && 'opacity-20')}>
      <path
        d={roundedPath(edge.points)}
        fill="none"
        strokeWidth={highlighted ? 2.5 : 1.5}
        strokeDasharray={edge.isBack ? '6 4' : undefined}
        markerEnd={highlighted ? 'url(#flow-arrow-active)' : 'url(#flow-arrow)'}
        className={highlighted ? 'stroke-primary' : 'stroke-muted-foreground/60'}
      />
      {edge.label && (
        <g>
          <rect
            x={edge.labelPos.x - labelWidth / 2}
            y={edge.labelPos.y - 9}
            width={labelWidth}
            height={18}
            rx={5}
            className={cn('fill-background', highlighted ? 'stroke-primary' : 'stroke-border')}
            strokeWidth={1}
          />
          <text
            x={edge.labelPos.x}
            y={edge.labelPos.y + 4}
            textAnchor="middle"
            className="fill-foreground text-[10px] font-semibold"
          >
            {edge.label}
          </text>
        </g>
      )}
    </g>
  );
}
