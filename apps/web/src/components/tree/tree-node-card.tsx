import { cn } from '@/lib/utils';
import { Laptop, Sparkles, Layers } from 'lucide-react';
import { getKindBadge, type ProcessedNode } from '@/lib/tree-layout';

type Props = {
  node: ProcessedNode;
  nodeWidth: number;
  nodeHeight: number;
  onClick: (node: ProcessedNode) => void;
};

export function TreeNodeCard({ node, nodeWidth, nodeHeight, onClick }: Props) {
  const badge = getKindBadge(node.kind);
  const isApp = node.kind === 'app';
  const isFeature = node.kind === 'feature';

  return (
    <div
      onClick={() => onClick(node)}
      style={{
        position: 'absolute',
        left: `${node.x}px`,
        top: `${node.y - nodeHeight / 2}px`,
        width: `${nodeWidth}px`,
        height: `${nodeHeight}px`,
      }}
      className={cn(
        'tree-node-card cursor-pointer rounded-md p-3 flex flex-col justify-between transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]',
        isApp
          ? 'bg-gradient-to-br from-primary to-primary/90 text-primary-foreground border border-primary/50 shadow-md shadow-primary/20 ring-1 ring-primary/30'
          : isFeature
          ? 'bg-card hover:bg-accent/40 text-card-foreground border-2 border-primary/40 hover:border-primary shadow-xs hover:shadow-md'
          : 'bg-card hover:bg-accent/40 text-card-foreground border border-border hover:border-primary/50 shadow-2xs hover:shadow-sm'
      )}
      title={`${badge.label}: ${node.label}`}
    >
      {/* Header Kartu Node */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {isApp ? (
            <Laptop className="h-3.5 w-3.5 shrink-0 opacity-90" />
          ) : isFeature ? (
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
          ) : (
            <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span
            className={cn(
              'text-[10px] uppercase font-semibold tracking-wider truncate',
              isApp ? 'text-primary-foreground/90' : 'text-primary'
            )}
          >
            {badge.label}
          </span>
        </div>

        {node.children.length > 0 && (
          <span
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded-md font-mono font-medium',
              isApp
                ? 'bg-primary-foreground/20 text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {node.children.length} sub
          </span>
        )}
      </div>

      {/* Judul Node */}
      <div
        className={cn(
          'text-xs font-semibold leading-snug line-clamp-2 break-words',
          isApp ? 'text-primary-foreground' : 'text-foreground'
        )}
      >
        {node.label}
      </div>

      {/* Badges Requirement ID */}
      {node.requirementIds && node.requirementIds.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {node.requirementIds.slice(0, 2).map((reqId) => (
            <span
              key={reqId}
              className={cn(
                'text-[9px] font-mono px-1 py-0.5 rounded-md font-semibold',
                isApp
                  ? 'bg-primary-foreground/20 text-primary-foreground'
                  : 'bg-primary/10 text-primary border border-primary/20'
              )}
            >
              {reqId}
            </span>
          ))}
          {node.requirementIds.length > 2 && (
            <span
              className={cn(
                'text-[9px] font-mono font-medium',
                isApp ? 'text-primary-foreground/80' : 'text-muted-foreground'
              )}
            >
              +{node.requirementIds.length - 2}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
