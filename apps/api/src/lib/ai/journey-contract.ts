// Journey di spec PRD sebagai kontrak: jalur utama dan jalur gagal menjadi skenario E2E untuk task INTEGRATION,
// dan requirement yang dirujuk journey diperiksa cakupannya terhadap task.
import type { SpecJourney } from './product-spec.js';
import type { TaskGen } from './tasks.js';
import type { Finding } from './validation-report.js';

export type JourneyScenario = {
  name: string;
  kind: 'main' | 'failure';
  /** Langkah berurutan; untuk jalur gagal: langkah journey utama sampai titik cabang, lalu langkah jalur gagal. */
  steps: string[];
  requirementIds: string[];
};

const MAX_SCENARIOS = 12;
const E2E_TITLE = /(test|e2e|journey|verif)/i;

const norm = (v: string) => v.trim().toLowerCase();

/** Menyusun skenario dari journey. Jalur gagal yang cabangnya tidak valid tetap dipakai sebagai skenario mandiri. */
export function buildJourneyScenarios(
  journeys: SpecJourney[],
  maxScenarios = MAX_SCENARIOS,
): { scenarios: JourneyScenario[]; findings: Finding[] } {
  const findings: Finding[] = [];
  const mains = journeys.filter((j) => j.kind === 'main');
  const mainByName = new Map(mains.map((j) => [norm(j.name), j]));

  const scenarios: JourneyScenario[] = mains.map((j) => ({
    name: j.name,
    kind: 'main',
    steps: j.steps,
    requirementIds: j.requirementIds,
  }));

  for (const f of journeys.filter((j) => j.kind === 'failure')) {
    const parent = f.branchFrom ? mainByName.get(norm(f.branchFrom.journey)) : undefined;
    if (f.branchFrom && parent && f.branchFrom.stepIndex <= parent.steps.length) {
      scenarios.push({
        name: f.name,
        kind: 'failure',
        steps: [...parent.steps.slice(0, f.branchFrom.stepIndex), ...f.steps],
        requirementIds: [...new Set([...parent.requirementIds, ...f.requirementIds])],
      });
    } else {
      findings.push({
        code: 'JOURNEY_BRANCH_INVALID',
        severity: 'info',
        message: `Journey gagal "${f.name}" tidak punya titik cabang yang valid; dipakai sebagai skenario mandiri.`,
      });
      scenarios.push({ name: f.name, kind: 'failure', steps: f.steps, requirementIds: f.requirementIds });
    }
  }

  return { scenarios: scenarios.slice(0, maxScenarios), findings };
}

export function describeScenario(s: JourneyScenario): string {
  return s.steps.join(' -> ');
}

/** Teks skenario untuk disuntikkan ke prompt generator task. */
export function renderJourneyScenarios(scenarios: JourneyScenario[]): string {
  return scenarios
    .map(
      (s, i) =>
        `S${i + 1}. [${s.kind === 'main' ? 'utama' : 'gagal'}] ${s.name}: ${describeScenario(s)}${
          s.requirementIds.length ? ` (requirement: ${s.requirementIds.join(', ')})` : ''
        }`,
    )
    .join('\n');
}

/**
 * Menyuntikkan skenario E2E ke task INTEGRATION (deterministik) dan memeriksa cakupan requirement tiap journey
 * terhadap task. Mengembalikan task yang sudah diperkaya beserta temuan (tidak pernah memblokir pembuatan task,
 * kecuali tidak adanya task INTEGRATION yang dicatat sebagai error).
 */
export function applyJourneyContract(
  journeys: SpecJourney[],
  tasks: TaskGen[],
): { tasks: TaskGen[]; findings: Finding[]; scenarios: JourneyScenario[] } {
  const { scenarios, findings } = buildJourneyScenarios(journeys);

  if (scenarios.length === 0) {
    findings.push({ code: 'JOURNEY_NONE', severity: 'info', message: 'Spec PRD tidak memiliki journey; skenario E2E diturunkan dari PRD saja.' });
    return { tasks, findings, scenarios };
  }
  if (!scenarios.some((s) => s.kind === 'failure')) {
    findings.push({ code: 'JOURNEY_NO_FAILURE_PATH', severity: 'info', message: 'Spec PRD tidak memiliki journey gagal; skenario E2E hanya memuat jalur berhasil.' });
  }

  const coveredReqs = new Set(tasks.flatMap((t) => t.requirement_ids ?? []));
  for (const j of journeys) {
    const missing = j.requirementIds.filter((r) => !coveredReqs.has(r) && r.startsWith('FR-'));
    if (missing.length > 0) {
      findings.push({
        code: 'JOURNEY_REQ_UNCOVERED',
        severity: 'warning',
        message: `Journey "${j.name}" membutuhkan ${missing.join(', ')} yang belum dipetakan ke task mana pun.`,
        refs: missing,
      });
    }
  }

  const integration = tasks.filter((t) => t.layer === 'INTEGRATION');
  if (integration.length === 0) {
    findings.push({ code: 'JOURNEY_NO_INTEGRATION_TASK', severity: 'error', message: 'Tidak ada task INTEGRATION untuk memuat skenario E2E dari journey.' });
    return { tasks, findings, scenarios };
  }

  const target = integration.find((t) => E2E_TITLE.test(t.title)) ?? integration[integration.length - 1];
  const criteria = scenarios.map((s, i) =>
    s.kind === 'main'
      ? `Skenario E2E S${i + 1} berhasil dijalankan end-to-end: ${describeScenario(s)}`
      : `Skenario kegagalan S${i + 1} ditangani sesuai edge case PRD (pesan atau perilaku yang benar, tanpa crash): ${describeScenario(s)}`,
  );
  const scenarioReqs = [...new Set(scenarios.flatMap((s) => s.requirementIds).filter((r) => r.startsWith('FR-')))];

  const enriched = tasks.map((t) =>
    t === target
      ? {
          ...t,
          acceptanceCriteria: [...t.acceptanceCriteria, ...criteria],
          requirement_ids: [...new Set([...(t.requirement_ids ?? []), ...scenarioReqs])],
        }
      : t,
  );
  return { tasks: enriched, findings, scenarios };
}
