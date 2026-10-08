// Quality gate untuk task hasil generate AI: normalisasi DAG, cakupan requirement/API, kebersihan,
// kontrak E2E (journey, atau flow legacy), dan kriteria keamanan baseline. Semua temuan dikumpulkan sebagai Finding dan disimpan sebagai laporan.
import type { TaskGen } from './ai/tasks.js';
import type { PrdDoc } from './ai/prd.js';
import type { BusinessFlow } from './ai/schemas.js';
import { validateAndNormalizeDAG } from './ai/dag-validator.js';
import { validateApiCoverage } from './ai/api-coverage-validator.js';
import { validateCleanup } from './ai/cleanup-validator.js';
import { applyFlowContract } from './ai/flow-contract.js';
import { applyJourneyContract } from './ai/journey-contract.js';
import type { SpecJourney } from './ai/product-spec.js';
import { applySecurityBaseline } from './ai/security-baseline.js';
import type { Finding } from './ai/validation-report.js';

export async function runTaskQualityGate(args: {
  generated: TaskGen[];
  prd: PrdDoc;
  flow?: BusinessFlow | null;
  /** Journey dari spec PRD; dipakai sebagai kontrak E2E bila flow (legacy) tidak ada. */
  journeys?: SpecJourney[];
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

  // Kriteria keamanan baseline disuntikkan deterministik (tanpa AI) agar task selalu siap dengan kriteria keamanan.
  // Audit AI (temuan spesifik per task) berjalan terpisah di background dan hanya menambah laporan.
  const baseline = applySecurityBaseline(tasks, args.prd.spec?.endpoints ?? args.prd.apiEndpoints ?? []);
  tasks = baseline.tasks;
  if (baseline.touched > 0) {
    findings.push({ code: 'SEC_BASELINE_APPLIED', severity: 'info', message: `Kriteria keamanan baseline ditambahkan ke ${baseline.touched} task.` });
  }

  return { tasks, findings, healed: dag.healed };
}
