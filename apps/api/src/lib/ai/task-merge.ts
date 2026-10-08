// Penggabungan task hasil generate per fase: nomor global, pemetaan depends_on, dan dependensi lintas fase.
import type { TaskGen } from './tasks.js';

export type MergeFeature = { id: string; dependsOn: string[] };
export type PhaseResult = {
  phase: { order: number; layer: string; features: MergeFeature[] };
  tasks: TaskGen[];
};

/** Awalan taskId sementara per fase (unik walau ada dua fase berlayer sama). */
export function phasePrefix(order: number): string {
  return `P${order}`;
}

/** Ringkasan fase lain sebagai konteks dependensi lintas fase di prompt. */
export function describeOtherPhases(
  phases: Array<{ order: number; title: string; layer: string; features: Array<{ id: string; title: string }> }>,
  currentOrder: number,
): string {
  return phases
    .filter((p) => p.order !== currentOrder)
    .map((p) => `- Fase ${p.order} [${p.layer}] ${p.title}: ${p.features.map((f) => `${f.title} (featureId: ${f.id})`).join('; ')}`)
    .join('\n');
}

const norm = (v: string) => v.trim().toLowerCase();

/**
 * Gabungkan task per fase menjadi satu daftar berurutan:
 * - taskId diberi nomor global TASK-001... mengikuti urutan fase lalu urutan task;
 * - depends_on ke taskId lokal fase diganti ke taskId global; depends_on ke featureId fitur lain
 *   diganti ke task terakhir fitur itu;
 * - task pertama tiap fitur otomatis bergantung pada task terakhir fitur prasyaratnya di roadmap
 *   (bila belum bergantung), sehingga urutan lintas fase tetap terjaga walau AI lupa menyebutnya.
 * Siklus atau ID tak dikenal dirapikan oleh validasi DAG sesudahnya.
 */
export function mergePhaseTasks(results: PhaseResult[]): TaskGen[] {
  const ordered = [...results].sort((a, b) => a.phase.order - b.phase.order);

  // Tahap 1: nomor global + peta ID lokal per fase
  type Slot = { task: TaskGen; newId: string; phaseIdx: number };
  const slots: Slot[] = [];
  const localMaps: Array<Map<string, string>> = [];
  ordered.forEach((r, phaseIdx) => {
    const local = new Map<string, string>();
    const tasks = [...r.tasks].sort((a, b) => a.order - b.order);
    for (const task of tasks) {
      const newId = `TASK-${String(slots.length + 1).padStart(3, '0')}`;
      if (task.taskId) local.set(norm(task.taskId), newId);
      slots.push({ task, newId, phaseIdx });
    }
    localMaps.push(local);
  });

  const featureTasks = new Map<string, string[]>(); // featureId (lowercase) -> taskId global berurutan
  for (const s of slots) {
    const key = norm(s.task.featureId);
    featureTasks.set(key, [...(featureTasks.get(key) ?? []), s.newId]);
  }
  const lastOf = (featureId: string) => {
    const ids = featureTasks.get(norm(featureId));
    return ids?.[ids.length - 1];
  };
  const featureOfTask = new Map(slots.map((s) => [s.newId, norm(s.task.featureId)]));

  // Tahap 2: petakan depends_on
  const resolved = new Map<string, string[]>();
  for (const s of slots) {
    const deps: string[] = [];
    for (const raw of s.task.depends_on ?? []) {
      const token = norm(raw);
      if (!token) continue;
      const target = localMaps[s.phaseIdx].get(token) ?? lastOf(token) ?? raw.trim();
      if (target !== s.newId && !deps.includes(target)) deps.push(target);
    }
    resolved.set(s.newId, deps);
  }

  // Tahap 3: dependensi lintas fitur dari roadmap (hanya task pertama tiap fitur)
  const roadmapDeps = new Map<string, string[]>();
  for (const r of ordered) for (const f of r.phase.features) roadmapDeps.set(norm(f.id), f.dependsOn.map(norm));
  for (const [featureKey, ids] of featureTasks) {
    const first = ids[0];
    const deps = resolved.get(first)!;
    for (const depFeature of roadmapDeps.get(featureKey) ?? []) {
      if (depFeature === featureKey) continue;
      const last = lastOf(depFeature);
      if (!last) continue;
      const alreadyDepends = deps.some((d) => featureOfTask.get(d) === depFeature);
      if (!alreadyDepends) deps.push(last);
    }
  }

  return slots.map((s, i) => ({
    ...s.task,
    taskId: s.newId,
    order: i + 1,
    depends_on: resolved.get(s.newId)!,
  }));
}

/** Jalankan fungsi async untuk semua item dengan batas konkurensi, mempertahankan urutan hasil. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: 'fulfilled', value: await fn(items[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}
