// Quality gate untuk task hasil generate AI: normalisasi DAG, cakupan requirement/API, kebersihan,
// kontrak E2E (journey, atau flow legacy), kepemilikan file, kontrak UI shell, serta baseline keamanan dan desain. Semua temuan dikumpulkan sebagai Finding dan disimpan sebagai laporan.
import type { TaskGen } from './ai/tasks.js';
import type { PrdDoc } from './ai/prd.js';
import type { BusinessFlow } from './ai/schemas.js';
import { validateAndNormalizeDAG } from './ai/dag-validator.js';
import { findUiApiWithoutBackend, validateApiCoverage } from './ai/api-coverage-validator.js';
import { validateCleanup } from './ai/cleanup-validator.js';
import { applyFlowContract } from './ai/flow-contract.js';
import { applyJourneyContract } from './ai/journey-contract.js';
import type { SpecDesign, SpecJourney } from './ai/product-spec.js';
import type { StackContract } from './ai/stack-contract.js';
import { applyDesignBaseline } from './ai/design-baseline.js';
import { enforceFileOwnership, findSimilarFileNames } from './ai/file-ownership.js';
import { isEndpointFile, resolveUiShellContract } from './ai/ui-shell-contract.js';
import { applySecurityBaseline } from './ai/security-baseline.js';
import type { Finding } from './ai/validation-report.js';

export async function runTaskQualityGate(args: {
  generated: TaskGen[];
  prd: PrdDoc;
  flow?: BusinessFlow | null;
  /** Journey dari spec PRD; dipakai sebagai kontrak E2E bila flow (legacy) tidak ada. */
  journeys?: SpecJourney[];
  /** Stack terpilih: menentukan kontrak UI shell (file bersama, pola file endpoint). */
  stack?: StackContract;
  /** Arah desain dari spec PRD; dipakai kriteria token dan font di baseline desain. */
  design?: SpecDesign;
  /** Siklus perubahan: codebase sudah ada, jadi baseline fondasi dan pemeriksaan endpoint lintas spec dilewati. */
  cycle?: boolean;
  /** File yang sudah dibuat task selesai (siklus perubahan); task baru yang membuatnya diubah menjadi modifikasi. */
  existingFiles?: string[];
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

  // Kepemilikan file dijalankan sebelum validasi DAG: depends_on baru yang membuat siklus dirapikan oleh validator DAG.
  const contract = resolveUiShellContract(args.stack);
  const ownership = enforceFileOwnership(args.generated, { contract, existingFiles: args.existingFiles });
  findings.push(...ownership.findings, ...findSimilarFileNames(ownership.tasks));

  if (!args.cycle) {
    const specEndpoints = args.prd.spec?.endpoints ?? args.prd.apiEndpoints ?? [];
    for (const m of findUiApiWithoutBackend(ownership.tasks, specEndpoints)) {
      findings.push({
        code: 'UI_API_NO_BACKEND',
        severity: 'warning',
        message: `Task FRONTEND "${m.title}" memanggil ${m.method} ${m.path}, tetapi endpoint itu tidak ada di spec maupun di task BACKEND mana pun.`,
        refs: [`${m.method} ${m.path}`],
      });
    }
  }
  for (const t of ownership.tasks) {
    if (t.layer !== 'FRONTEND') continue;
    const endpointFiles = (t.files_to_create ?? []).filter((f) => isEndpointFile(contract, f));
    if (endpointFiles.length > 0) {
      findings.push({
        code: 'FRONTEND_CREATES_API',
        severity: 'warning',
        message: `Task FRONTEND "${t.title}" membuat file endpoint API (${endpointFiles.join(', ')}). Endpoint harus dibuat task BACKEND.`,
        refs: endpointFiles,
      });
    }
  }

  const dag = validateAndNormalizeDAG(ownership.tasks);
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

  // Baseline desain: kriteria Fondasi UI dan komponen, depends_on ke Fondasi UI, serta pemeriksaan tampilan di DoD.
  const design = applyDesignBaseline(tasks, { design: args.design, cycle: args.cycle });
  tasks = design.tasks;
  findings.push(...design.findings);

  return { tasks, findings, healed: dag.healed };
}
