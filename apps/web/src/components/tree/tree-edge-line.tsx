import type { TreeLine } from '@/lib/tree-layout';

type Props = {
  line: TreeLine;
};

export function TreeEdgeLine({ line }: Props) {
  const dx = (line.x2 - line.x1) * 0.5;
  const pathD = `M ${line.x1} ${line.y1} C ${line.x1 + dx} ${line.y1}, ${line.x2 - dx} ${line.y2}, ${line.x2} ${line.y2}`;

  return (
    <g>
      {/* Bayangan garis halus */}
      <path
        d={pathD}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        className="text-primary/10 dark:text-primary/15"
      />
      {/* Garis utama bezier */}
      <path
        d={pathD}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-border dark:text-border hover:text-primary transition-colors"
      />
      {/* Titik anchor di ujung anak */}
      <circle
        cx={line.x2}
        cy={line.y2}
        r="3.5"
        className="fill-primary stroke-background"
        strokeWidth="1.5"
      />
    </g>
  );
}
