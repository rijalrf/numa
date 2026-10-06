// Business flow sebagai kontrak: jalur flow menjadi skenario E2E untuk task INTEGRATION,
// dan step lane sistem diperiksa cakupannya terhadap requirement yang dipetakan task.
import type { BusinessFlow } from './schemas.js';
import type { TaskGen } from './tasks.js';

export type FlowPath = {
  /** Label step berurutan dari start sampai end, label edge keputusan disisipkan. */
  labels: string[];
  stepIds: string[];
  requirementIds: string[];
};

const MAX_PATHS = 12;

/** Enumerasi jalur start -> end. Siklus dipotong (step yang sudah ada di jalur tidak dikunjungi ulang). */
export function enumerateFlowPaths(flow: BusinessFlow, maxPaths = MAX_PATHS): FlowPath[] {
  const stepById = new Map(flow.steps.map((s) => [s.id, s]));
  const outgoing = new Map<string, BusinessFlow['edges']>();
  for (const e of flow.edges) outgoing.set(e.from, [...(outgoing.get(e.from) ?? []), e]);

  const start = flow.steps.find((s) => s.type === 'start');
  if (!start) return [];

  const paths: FlowPath[] = [];
  const walk = (stepId: string, trail: string[], labels: string[]) => {
    if (paths.length >= maxPaths) return;
    const step = stepById.get(stepId);
    if (!step || trail.includes(stepId)) return;
    const nextTrail = [...trail, stepId];
    const nextLabels = [...labels, step.label];
    if (step.type === 'end') {
      const reqs = new Set<string>();
      for (const id of nextTrail) for (const r of stepById.get(id)?.requirementIds ?? []) reqs.add(r);
      paths.push({ labels: nextLabels, stepIds: nextTrail, requirementIds: [...reqs] });
      return;
    }
    for (const edge of outgoing.get(stepId) ?? []) {
      const branch = step.type === 'decision' && edge.label ? [`[${edge.label}]`] : [];
      walk(edge.to, nextTrail, [...nextLabels, ...branch]);
    }
  };
  walk(start.id, [], []);
  return paths;
}

export function describePath(path: FlowPath): string {
  return path.labels.join(' -> ');
}

/** Teks skenario untuk disuntikkan ke prompt generator task. */
export function renderFlowScenarios(flow: BusinessFlow, paths: FlowPath[]): string {
  return [
    `Proses: ${flow.processName}`,
    ...paths.map((p, i) => `S${i + 1}. ${describePath(p)}${p.requirementIds.length ? ` (requirement: ${p.requirementIds.join(', ')})` : ''}`),
  ].join('\n');
}

export type FlowFinding = { code: string; severity: 'error' | 'warning' | 'info'; message: string; refs?: string[] };

const E2E_TITLE = /(test|e2e|journey|verif)/i;

/**
 * Menyuntikkan skenario E2E ke task INTEGRATION (deterministik) dan memeriksa cakupan step lane sistem.
 * Mengembalikan task yang sudah diperkaya beserta temuan.
 */
export function applyFlowContract(
  flow: BusinessFlow,
  tasks: TaskGen[],
): { tasks: TaskGen[]; findings: FlowFinding[]; paths: FlowPath[] } {
  const findings: FlowFinding[] = [];
  const paths = enumerateFlowPaths(flow);
  if (paths.length === 0) {
    findings.push({ code: 'FLOW_NO_PATH', severity: 'warning', message: 'Flow tidak memiliki jalur start ke end yang dapat dijadikan skenario E2E.' });
  }

  const coveredReqs = new Set(tasks.flatMap((t) => t.requirement_ids ?? []));
  const systemLaneIds = new Set(flow.lanes.filter((l) => l.kind === 'system').map((l) => l.id));
  for (const step of flow.steps) {
    if (!systemLaneIds.has(step.laneId) || step.type === 'start' || step.type === 'end') continue;
    if (step.requirementIds.length === 0) {
      findings.push({ code: 'FLOW_STEP_NO_REQUIREMENT', severity: 'info', message: `Step sistem "${step.label}" tidak terhubung ke requirement PRD.`, refs: [step.id] });
      continue;
    }
    const missing = step.requirementIds.filter((r) => !coveredReqs.has(r));
    if (missing.length > 0) {
      findings.push({
        code: 'FLOW_STEP_UNCOVERED',
        severity: 'warning',
        message: `Step sistem "${step.label}" membutuhkan ${missing.join(', ')} yang belum dipetakan ke task mana pun.`,
        refs: [step.id, ...missing],
      });
    }
  }

  const integration = tasks.filter((t) => t.layer === 'INTEGRATION');
  if (integration.length === 0) {
    if (paths.length > 0) {
      findings.push({ code: 'FLOW_NO_INTEGRATION_TASK', severity: 'error', message: 'Tidak ada task INTEGRATION untuk memuat skenario E2E dari flow.' });
    }
    return { tasks, findings, paths };
  }

  const target = integration.find((t) => E2E_TITLE.test(t.title)) ?? integration[integration.length - 1];
  const scenarioCriteria = paths.map((p, i) => `Skenario E2E S${i + 1} berhasil dijalankan end-to-end: ${describePath(p)}`);
  const pathReqs = [...new Set(paths.flatMap((p) => p.requirementIds))];

  const enriched = tasks.map((t) =>
    t === target
      ? {
          ...t,
          acceptanceCriteria: [...t.acceptanceCriteria, ...scenarioCriteria],
          requirement_ids: [...new Set([...(t.requirement_ids ?? []), ...pathReqs])],
        }
      : t,
  );
  return { tasks: enriched, findings, paths };
}
