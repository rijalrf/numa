// Daftar langkah perancangan task di halaman Board: selesai, sedang berjalan, dan menunggu.
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { NumaLoader } from '@/components/ui/numa-loader';
import type { GenerationProgress as Progress, GenerationStep } from '@/hooks/use-project-tasks';

const STEPS: Array<{ key: GenerationStep; label: string }> = [
  { key: 'spec', label: 'Menyiapkan spesifikasi PRD' },
  { key: 'roadmap', label: 'Menyusun roadmap fitur' },
  { key: 'tasks', label: 'Merancang task per fase' },
  { key: 'validate', label: 'Memvalidasi task' },
  { key: 'save', label: 'Menyimpan task' },
];

export function GenerationProgress({ progress }: { progress: Progress | null }) {
  const currentIdx = progress ? STEPS.findIndex((s) => s.key === progress.step) : -1;

  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center gap-8">
      <NumaLoader
        label="Sedang merancang task..."
        sublabel="AI menyusun daftar task dari spesifikasi PRD. Biasanya kurang dari satu menit."
      />
      <ol className="w-full max-w-sm space-y-2.5 text-sm" aria-label="Langkah perancangan task">
        {STEPS.map((step, idx) => {
          const state = idx < currentIdx ? 'done' : idx === currentIdx ? 'active' : 'pending';
          const count =
            state === 'active' && step.key === 'tasks' && progress?.total ? ` (${progress.done ?? 0}/${progress.total} fase)` : '';
          return (
            <li key={step.key} className="flex items-center gap-2.5" aria-current={state === 'active' ? 'step' : undefined}>
              {state === 'done' && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
              {state === 'active' && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
              {state === 'pending' && <Circle className="h-4 w-4 text-muted-foreground/50 shrink-0" />}
              <span className={state === 'pending' ? 'text-muted-foreground' : 'text-foreground'}>
                {step.label}
                {count}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
