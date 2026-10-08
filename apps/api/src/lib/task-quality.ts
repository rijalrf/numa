// Quality gate untuk task hasil generate AI: normalisasi DAG, cakupan requirement/API, kebersihan,
// kontrak E2E (journey, atau flow legacy), dan audit keamanan. Semua temuan dikumpulkan sebagai Finding dan disimpan sebagai laporan.
import type { TaskGen } from './ai/tasks.js';
import type { PrdDoc } from './ai/prd.js';
import type { BusinessFlow } from './ai/schemas.js';
import { validateAndNormalizeDAG } from './ai/dag-validator.js';
import { validateApiCoverage } from './ai/api-coverage-validator.js';
import { validateCleanup } from './ai/cleanup-validator.js';
import { applyFlowContract } from './ai/flow-contract.js';
import { applyJourneyContract } from './ai/journey-contract.js';
import type { SpecJourney } from './ai/product-spec.js';
import { auditTasksSecurity } from './ai/security-audit.js';
import type { Finding } from './ai/validation-report.js';

const SECURITY_SEVERITY: Record<string, Finding['severity']> = {
  CRITICAL: 'error',
  HIGH: 'error',
  MEDIUM: 'warning',
  LOW: 'info',
};

export async function runTaskQualityGate(args: {
  generated: TaskGen[];
  prd: PrdDoc;
  flow?: BusinessFlow | null;
  /** Journey dari spec PRD; dipakai sebagai kontrak E2E bila flow (legacy) tidak ada. */
  journeys?: SpecJourney[];
  projectId: string;
  securityAudit?: boolean;
}): Promise<{ tasks: TaskGen[]; findings: Finding[]; healed: boolean }> {
  const findings: Finding[] = [];

  if (args.prd.requirementIndex.length > 0) {
    const covered = new Set(args.generated.flatMap((t) => t.requirement_ids ?? []));
    const uncovered = args.prd.requirementIndex.filter((r) => r.id.startsWith('FR-') && !covered.has(r.id));
    for (const r of uncovered) {
      findings.push({ code: 'REQ_UNCOVERED', severity: 'warning', message: `Requirement ${r.id} (${r.title}) belum dipetakan ke task mana pun.`, refs: [r.id] });
    }
  }

  const coverage = validateApiCoverage(args.generated, args.prd.apiEndpoints ?? []);
  for (const ep of coverage.uncovered) {
    findings.push({ code: 'API_NO_UI_CONSUMER', severity: 'warning', message: `Endpoint ${ep.method} ${ep.path} tidak memiliki antarmuka pemanggil di frontend.`, refs: [`${ep.method} ${ep.path}`] });
  }

  const dag = validateAndNormalizeDAG(args.generated);
  for (const w of dag.warnings) {
    findings.push({ code: 'DAG_ADJUSTED', severity: dag.healed ? 'warning' : 'info', message: w });
  }
  let tasks = dag.tasks;

  for (const w of validateCleanup(tasks).warnings) {
    findings.push({ code: 'TASK_HYGIENE', severity: 'info', message: w });
  }

  if (args.flow) {
    const contract = applyFlowContract(args.flow, tasks);
    tasks = contract.tasks;
    findings.push(...contract.findings);
  } else if (args.journeys) {
    const contract = applyJourneyContract(args.journeys, tasks);
    tasks = contract.tasks;
    findings.push(...contract.findings);
  }

  if (args.securityAudit !== false) {
    try {
      const audit = await auditTasksSecurity({ tasks, prd: args.prd, projectId: args.projectId });
      for (const f of audit.findings) {
        findings.push({
          code: `SEC_${f.category}`,
          severity: SECURITY_SEVERITY[f.severity] ?? 'warning',
          message: `[${f.taskId}] ${f.description} Rekomendasi: ${f.recommendation}`,
          refs: [f.taskId],
        });
      }
      const extra = new Map(audit.additionalAcceptanceCriteria.map((a) => [a.taskId, a.criteria]));
      tasks = tasks.map((t) => {
        const add = (t.taskId && extra.get(t.taskId)) || [];
        const fresh = add.filter((c) => !t.acceptanceCriteria.includes(c));
        return fresh.length > 0 ? { ...t, acceptanceCriteria: [...t.acceptanceCriteria, ...fresh] } : t;
      });
    } catch (err) {
      findings.push({ code: 'SEC_AUDIT_FAILED', severity: 'warning', message: `Audit keamanan task gagal dijalankan: ${(err as Error).message}` });
    }
  }

  return { tasks, findings, healed: dag.healed };
}
