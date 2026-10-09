// Langkah ringkasan dampak panel Minta Perubahan: user meninjau hasil analisis lalu mengonfirmasi perancangan task.
import { useState } from 'react';
import { FileCode, Loader2, Sparkles } from 'lucide-react';
import { AlertBanner } from '@/components/ui/alert-banner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CYCLE_SIZE_LABELS, CYCLE_TYPE_LABELS, type ProjectCycleItem } from '@/lib/cycle';
import type { SplitChoice } from '@/hooks/use-change-request';

const PRIORITY_LABELS: Record<string, string> = { HIGH: 'Tinggi', MEDIUM: 'Sedang', LOW: 'Rendah' };
const FILE_PREVIEW_LIMIT = 6;

type Props = {
  draft: ProjectCycleItem;
  /** Pesan bila perancangan sebelumnya gagal; user boleh mengonfirmasi ulang. */
  jobError: string | null;
  busy: boolean;
  onConfirm: (split: SplitChoice) => void;
  onCancel: () => void;
};

export function ChangeRequestSummary({ draft, jobError, busy, onConfirm, onCancel }: Props) {
  const impact = draft.impact ?? {};
  const split = impact.splitProposal?.partA && impact.splitProposal?.partB ? impact.splitProposal : null;
  const [choice, setChoice] = useState<SplitChoice>('single');

  const requirements = impact.newRequirements ?? [];
  const files = impact.impactedFiles ?? [];
  const featureCount = impact.impactedFeatureIds?.length ?? 0;

  const options: Array<{ value: SplitChoice; title: string; note?: string }> = split
    ? [
        { value: 'single', title: `Kerjakan sekaligus (sekitar ${impact.estimatedTasks ?? '?'} task)` },
        { value: 'a', title: `Bagian A dulu: ${split.partA}`, note: 'Bagian B disimpan sebagai draf berikutnya.' },
        { value: 'b', title: `Bagian B dulu: ${split.partB}`, note: 'Bagian A disimpan sebagai draf berikutnya.' },
      ]
    : [];

  const confirmLabel = choice === 'single' ? 'Rancang Task' : `Rancang Task Bagian ${choice.toUpperCase()}`;

  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        {jobError && <AlertBanner variant="destructive">{jobError}</AlertBanner>}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {impact.type && <Badge variant="outline" className="text-[10px]">{CYCLE_TYPE_LABELS[impact.type] ?? impact.type}</Badge>}
            {impact.size && <Badge variant="outline" className="text-[10px]">Skala {CYCLE_SIZE_LABELS[impact.size] ?? impact.size}</Badge>}
          </div>
          <p className="text-sm text-foreground leading-relaxed">{impact.summary}</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Perkiraan Task" value={impact.estimatedTasks ?? '-'} />
          <Stat label="Fitur Terdampak" value={featureCount} />
          <Stat label="Requirement Baru" value={requirements.length} />
        </div>

        {requirements.length > 0 && (
          <div className="rounded-md border border-border/80 p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground">PRD akan ditambah requirement berikut</p>
            <ul className="space-y-1.5">
              {requirements.map((r, i) => (
                <li key={`${r.id}-${i}`} className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-medium text-foreground">{r.title}</span>
                  <Badge variant="outline" className="ml-1.5 text-[10px] h-4 px-1.5">Prioritas {PRIORITY_LABELS[r.priority] ?? r.priority}</Badge>
                  {r.description && <span className="block">{r.description}</span>}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-muted-foreground">Nomor requirement ditetapkan otomatis setelah dikonfirmasi.</p>
          </div>
        )}

        {files.length > 0 && (
          <div className="rounded-md border border-border/80 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
              Berkas yang kemungkinan berubah ({files.length})
            </p>
            <div className="space-y-1 font-mono text-[11px] text-muted-foreground">
              {files.slice(0, FILE_PREVIEW_LIMIT).map((f) => (
                <div key={f} className="truncate bg-muted/30 px-1.5 py-0.5 rounded">{f}</div>
              ))}
              {files.length > FILE_PREVIEW_LIMIT && <div className="px-1.5">dan {files.length - FILE_PREVIEW_LIMIT} berkas lain</div>}
            </div>
          </div>
        )}

        {split && (
          <div className="rounded-md border border-border/80 p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground">Perubahan ini cukup besar</p>
            {impact.splitProposal?.reason && <p className="text-xs text-muted-foreground leading-relaxed">{impact.splitProposal.reason}</p>}
            <div className="space-y-1.5">
              {options.map((o) => (
                <label
                  key={o.value}
                  className={`flex items-start gap-2.5 p-2.5 rounded-md border text-xs cursor-pointer transition-colors ${
                    choice === o.value ? 'border-primary bg-primary/10 text-foreground' : 'border-border/70 hover:bg-muted/40 text-foreground/80'
                  }`}
                >
                  <input
                    type="radio"
                    name="cycle-split"
                    checked={choice === o.value}
                    onChange={() => setChoice(o.value)}
                    disabled={busy}
                    className="mt-0.5 h-3 w-3"
                  />
                  <span className="leading-relaxed">
                    {o.title}
                    {o.note && <span className="block text-[11px] text-muted-foreground">{o.note}</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border/80 p-4 shrink-0 bg-card flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy} className="h-8 text-xs font-medium">
          Batalkan Draf
        </Button>
        <Button type="button" size="sm" onClick={() => onConfirm(choice)} disabled={busy} className="h-8 text-xs font-medium gap-1.5">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          <span>{busy ? 'Memproses' : confirmLabel}</span>
        </Button>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border/80 bg-muted/20 p-2.5 space-y-0.5">
      <span className="text-[10px] text-muted-foreground uppercase font-semibold">{label}</span>
      <div className="text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
