import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, GitCommit, FileCode, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { api } from '../../lib/http';

interface CycleDetailDialogProps {
  projectId: string;
  cycleId: string | null;
  onClose: () => void;
}

const typeLabels: Record<string, string> = {
  FEATURE: 'Fitur Baru',
  BUGFIX: 'Perbaikan Bug',
  REFACTOR: 'Refaktor Kode',
  MIXED: 'Campuran',
};

const sizeLabels: Record<string, string> = {
  SMALL: 'Kecil',
  MEDIUM: 'Menengah',
  LARGE: 'Besar',
};

export function CycleDetailDialog({ projectId, cycleId, onClose }: CycleDetailDialogProps) {
  const [cycle, setCycle] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cycleId) return;
    let mounted = true;
    setLoading(true);
    api(`/api/projects/${projectId}/cycles/${cycleId}`)
      .then((res: any) => {
        if (mounted && res?.cycle) {
          setCycle(res.cycle);
        }
      })
      .catch((err) => {
        console.error('Gagal mengambil detail siklus:', err);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [projectId, cycleId]);

  if (!cycleId) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in-0">
      <div className="relative w-full max-w-xl bg-card border border-border rounded-lg shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <GitCommit className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              {cycle ? `Siklus #${cycle.number}: ${cycle.title}` : 'Detail Siklus Perubahan'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
            aria-label="Tutup dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-xs">Memuat detail siklus...</span>
          </div>
        ) : cycle ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-md border border-border/80 bg-muted/20 p-2.5 space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Status</span>
                <div>
                  <Badge
                    variant={cycle.status === 'DONE' ? 'success' : 'default'}
                    className="text-[10px] h-4"
                  >
                    {cycle.status === 'DONE' ? 'Selesai' : cycle.status === 'OPEN' ? 'Terbuka' : 'Draf'}
                  </Badge>
                </div>
              </div>
              <div className="rounded-md border border-border/80 bg-muted/20 p-2.5 space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Tipe</span>
                <div className="text-xs font-semibold text-foreground">
                  {typeLabels[cycle.type] || cycle.type}
                </div>
              </div>
              <div className="rounded-md border border-border/80 bg-muted/20 p-2.5 space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Skala</span>
                <div className="text-xs font-semibold text-foreground">
                  {sizeLabels[cycle.size] || cycle.size}
                </div>
              </div>
              <div className="rounded-md border border-border/80 bg-muted/20 p-2.5 space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Jumlah Task</span>
                <div className="text-xs font-semibold text-foreground">
                  {cycle.tasks?.length ?? 0} task
                </div>
              </div>
            </div>

            <div className="rounded-md border border-border/80 bg-muted/10 p-3 space-y-1 text-xs">
              <span className="font-semibold text-foreground">Permintaan Asli</span>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{cycle.request}</p>
            </div>

            {cycle.impact?.summary && (
              <div className="rounded-md border border-border/80 p-3 space-y-1 text-xs">
                <span className="font-semibold text-foreground">Analisis Dampak</span>
                <p className="text-muted-foreground leading-relaxed">{cycle.impact.summary}</p>
              </div>
            )}

            {Array.isArray(cycle.impact?.impactedFiles) && cycle.impact.impactedFiles.length > 0 && (
              <div className="rounded-md border border-border/80 p-3 space-y-1.5 text-xs">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
                  Berkas Terdampak ({cycle.impact.impactedFiles.length})
                </span>
                <div className="max-h-28 overflow-y-auto space-y-1 pr-1 font-mono text-[11px] text-muted-foreground">
                  {cycle.impact.impactedFiles.map((f: string, i: number) => (
                    <div key={i} className="truncate bg-muted/30 px-1.5 py-0.5 rounded">
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {cycle.prdDelta?.summary && (
              <div className="rounded-md border border-border/80 bg-primary/5 p-3 space-y-1 text-xs">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  Pembaruan PRD
                </span>
                <p className="text-muted-foreground">{cycle.prdDelta.summary}</p>
              </div>
            )}

            <div className="flex items-center justify-end pt-2">
              <Button type="button" size="sm" onClick={onClose} className="text-xs h-8">
                Tutup
              </Button>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-muted-foreground">
            Data siklus tidak ditemukan.
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
