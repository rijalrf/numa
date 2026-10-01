import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, CheckCircle2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getKindBadge, type ProcessedNode } from '@/lib/tree-layout';

type Props = {
  node: ProcessedNode;
  onSelect: (node: ProcessedNode) => void;
  onClose: () => void;
};

export function NodeDetailDialog({ node, onSelect, onClose }: Props) {
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-md shadow-2xl max-w-lg w-full p-6 space-y-4 relative animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tombol Tutup */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header Dialog */}
        <div className="space-y-1.5 pr-6">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn('text-xs font-semibold uppercase', getKindBadge(node.kind).color)}
            >
              {getKindBadge(node.kind).label}
            </Badge>
            <span className="text-xs text-muted-foreground font-mono">
              Order #{node.order}
            </span>
          </div>
          <h3 className="text-lg font-semibold text-foreground leading-snug">
            {node.label}
          </h3>
        </div>

        {/* Rincian Hierarki */}
        <div className="space-y-3.5 text-sm pt-3 border-t border-border">
          {node.parent ? (
            <div>
              <span className="text-xs font-medium text-muted-foreground block mb-1">
                Induk (Parent Node):
              </span>
              <div
                onClick={() => onSelect(node.parent!)}
                className="p-3 rounded-md bg-muted/40 hover:bg-muted/80 border border-border flex items-center justify-between cursor-pointer transition-colors"
              >
                <span className="text-xs font-medium text-foreground truncate mr-2">
                  {node.parent.label}
                </span>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {getKindBadge(node.parent.kind).label}
                </Badge>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              <span>Node ini adalah Root Aplikasi (puncak arsitektur).</span>
            </div>
          )}

          {/* Badges Requirement ID */}
          {node.requirementIds && node.requirementIds.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground block mb-1">
                Terkait Requirement PRD:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {node.requirementIds.map((reqId) => (
                  <Badge
                    key={reqId}
                    variant="outline"
                    className="font-mono text-xs bg-primary/10 text-primary border-primary/20"
                  >
                    {reqId}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Daftar Sub-komponen */}
          <div>
            <span className="text-xs font-medium text-muted-foreground block mb-1.5">
              Sub-Komponen Langsung ({node.children.length}):
            </span>
            {node.children.length > 0 ? (
              <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                {node.children.map((child) => (
                  <div
                    key={child.id}
                    onClick={() => onSelect(child)}
                    className="p-2.5 rounded-md bg-muted/20 hover:bg-muted/60 border border-border/60 text-xs flex items-center justify-between cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="font-medium text-foreground truncate">
                        {child.label}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {getKindBadge(child.kind).label}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic py-1">
                Tidak memiliki sub-komponen (node daun).
              </p>
            )}
          </div>

          <div className="rounded-md bg-muted/40 p-3 text-[11px] text-muted-foreground">
            Detail struktur ini bersifat <strong>read-only</strong>. Seluruh task pengerjaan otomatis tersedia pada Board Task dan dapat dijalankan melalui CLI <code>numa</code>.
          </div>
        </div>

        {/* Footer Dialog */}
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
