// Daftar journey pengguna dari spec PRD: jalur utama dan jalur gagal yang bercabang darinya.
import { GitBranch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export type PrdJourney = {
  name: string;
  steps: string[];
  requirementIds?: string[];
  kind?: 'main' | 'failure';
  branchFrom?: { journey: string; stepIndex: number };
};

type Props = { journeys: PrdJourney[] };

const norm = (v: string) => v.trim().toLowerCase();

function RequirementChips({ ids }: { ids?: string[] }) {
  if (!ids || ids.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {ids.map((id) => (
        <Badge key={id} variant="outline" className="font-mono text-[11px] px-2 py-0">
          {id}
        </Badge>
      ))}
    </div>
  );
}

export function JourneyList({ journeys }: Props) {
  const mains = journeys.filter((j) => (j.kind ?? 'main') === 'main');
  const failures = journeys.filter((j) => j.kind === 'failure');
  const failuresOf = (main: PrdJourney) =>
    failures.filter((f) => f.branchFrom && norm(f.branchFrom.journey) === norm(main.name));
  const orphans = failures.filter((f) => !f.branchFrom || !mains.some((m) => norm(m.name) === norm(f.branchFrom!.journey)));

  if (journeys.length === 0) return null;

  return (
    <section className="space-y-4 border-t border-border pt-6" aria-labelledby="journey-heading">
      <div className="space-y-1">
        <h2 id="journey-heading" className="text-base font-semibold">
          Journey Pengguna
        </h2>
        <p className="text-xs text-muted-foreground">
          Alur ini menjadi dasar skenario uji end-to-end pada task integrasi, termasuk jalur gagal.
        </p>
      </div>

      {mains.map((main) => (
        <div key={main.name} className="rounded-md border border-border bg-card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{main.name}</h3>
            <RequirementChips ids={main.requirementIds} />
          </div>
          <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground marker:font-mono marker:text-xs">
            {main.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>

          {failuresOf(main).map((f) => (
            <div key={f.name} className="rounded-md border border-dashed border-border bg-muted/40 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{f.name}</span>
                </div>
                <RequirementChips ids={f.requirementIds} />
              </div>
              <p className="text-xs text-muted-foreground">
                Bercabang dari langkah {f.branchFrom!.stepIndex}: {main.steps[f.branchFrom!.stepIndex - 1] ?? '-'}
              </p>
              <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground marker:font-mono marker:text-xs">
                {f.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      ))}

      {orphans.map((f) => (
        <div key={f.name} className="rounded-md border border-dashed border-border bg-muted/40 p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{f.name}</span>
            </div>
            <RequirementChips ids={f.requirementIds} />
          </div>
          <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground marker:font-mono marker:text-xs">
            {f.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}
