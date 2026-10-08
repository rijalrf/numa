// Kanban tasks: generasi AI (fire-and-forget), list, update status.
import { logger, serializeError } from '../lib/logger.js';
import { Router } from 'express';
import { recordAudit } from '../lib/audit.js';
import { projectWhere, getProjectRole, hasRole } from '../lib/access.js';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { getUserPlan, checkQuota, incrementQuota } from '../lib/billing.js';
import { isStageLocked } from '../lib/stage.js';
import { readPrdContent } from '../lib/ai/prd.js';
import { generateRoadmapFromPRD } from '../lib/ai/roadmap.js';
import { generateTasksByPhase } from '../lib/ai/tasks.js';
import { appendFindings, saveValidationReport, type Finding } from '../lib/ai/validation-report.js';
import { auditTasksSecurity, toReportFindings, type AuditableTask } from '../lib/ai/security-audit.js';
import { saveRoadmap } from '../lib/roadmap-store.js';
import { BusinessFlowSchema } from '../lib/ai/schemas.js';
import { checkSpecConsistency } from '../lib/ai/product-spec.js';
import { enumerateFlowPaths, renderFlowScenarios } from '../lib/ai/flow-contract.js';
import { buildJourneyScenarios, renderJourneyScenarios } from '../lib/ai/journey-contract.js';
import { ensureProductSpec } from '../lib/prd-spec.js';
import { runTaskQualityGate } from '../lib/task-quality.js';
import { resolveStackContract } from '../lib/ai/stack-contract.js';
import { persistGeneratedTasks } from '../lib/task-persist.js';
import { enqueueAiJobOnce, getLatestJob, isAiJobType, registerJobHandler, reportJobProgress, toClientStatus, cancelAiJob, NonRetryableJobError, rejectJobLimit } from '../lib/ai/job.js';

export const tasksRouter = Router();

/**
 * Tier model untuk generate task per fase. 'cheap' = model tanpa reasoning (OPENAI_MODEL_CHEAP):
 * output task terstruktur tidak butuh reasoning dan jauh lebih cepat; kualitas dijaga oleh quality gate.
 */
const TASK_GENERATION_TIER = 'cheap' as const;

registerJobHandler<{ isFirstGeneration?: boolean }>('tasks_generate', async ({ jobId, projectId, userId, payload, assertActive }) => {
  const isFirstGeneration = payload?.isFirstGeneration === true;
  // Langkah yang sedang berjalan ditulis ke hasil job; halaman Board menampilkannya lewat polling.
  const progress = (step: 'spec' | 'roadmap' | 'tasks' | 'validate' | 'save', label: string, done?: number, total?: number) =>
    reportJobProgress(jobId, { step, label, done, total });

  const loadProject = () =>
    prisma.project.findFirst({
      where: { id: projectId },
      include: {
        prd: true,
        stacks: true,
        roadmap: { orderBy: { order: 'asc' }, include: { features: { include: { dependencies: true } } } },
      },
    });

  let currentProject = await loadProject();
  if (!currentProject) throw new NonRetryableJobError('Project tidak ditemukan saat proses latar belakang.');
  if (!currentProject.prd) throw new NonRetryableJobError('PRD belum ada. Generate PRD dulu.');

  // Spec terstruktur PRD (disusun di background setelah PRD tersimpan; diekstrak langsung untuk PRD lama) dan kontrak flow bisnis.
  await progress('spec', 'Menyiapkan spesifikasi PRD');
  const preFindings: Finding[] = [];
  const specResult = await ensureProductSpec(projectId);
  const prdDoc = specResult?.prd ?? readPrdContent(currentProject.prd.content);
  if (!prdDoc.spec) {
    preFindings.push({
      code: 'SPEC_MISSING',
      severity: 'warning',
      message: `Spec terstruktur PRD tidak tersedia (${specResult?.error ?? 'PRD lama'}). Model data dan endpoint tidak dipakai generator task.`,
    });
  } else {
    for (const w of checkSpecConsistency(prdDoc.spec)) {
      preFindings.push({ code: 'SPEC_INCONSISTENT', severity: 'info', message: w });
    }
  }
  const stackContract = resolveStackContract(currentProject.stacks || []);

  // Roadmap otomatis bila belum ada (input spec, disimpan atomik).
  if (currentProject.roadmap.length === 0) {
    assertActive();
    await progress('roadmap', 'Menyusun roadmap fitur');
    await saveRoadmap(projectId, await generateRoadmapFromPRD(prdDoc, { projectId, stack: stackContract }));
    currentProject = (await loadProject()) ?? currentProject;
  }
  if (currentProject.roadmap.length === 0) throw new NonRetryableJobError('Roadmap belum ada.');

  // Konversi Prisma ke shape yang dipahami AI generator: id sementara f1..fN, dependsOn dipetakan dua tahap
  // agar dependensi ke fitur yang muncul belakangan tidak hilang.
  const featureIdMap = new Map<string, string>(); // dbId -> tmpId
  let tmpCounter = 1;
  for (const phase of currentProject.roadmap) {
    for (const f of phase.features) featureIdMap.set(f.id, `f${tmpCounter++}`);
  }
  const phasesForAI = currentProject.roadmap.map((p) => ({
    order: p.order,
    title: p.title,
    description: p.description ?? undefined,
    layer: p.layer as 'BOOTSTRAP' | 'DATABASE' | 'BACKEND' | 'FRONTEND' | 'INTEGRATION',
    features: p.features.map((f) => ({
      id: featureIdMap.get(f.id)!,
      title: f.title,
      description: f.description ?? undefined,
      dependsOn: f.dependencies.map((d) => featureIdMap.get(d.dependsOnId) ?? '').filter(Boolean),
    })),
  }));

  // Flow (legacy, hanya backend) dipakai bila ada; selain itu skenario E2E disusun dari journey di spec PRD.
  const flowRow = await prisma.businessFlow.findUnique({ where: { projectId } });
  const parsedFlow = flowRow ? BusinessFlowSchema.safeParse(flowRow.content) : null;
  const flow = parsedFlow?.success ? parsedFlow.data : null;
  const journeys = prdDoc.spec?.journeys;
  const e2eScenarios = flow
    ? renderFlowScenarios(flow, enumerateFlowPaths(flow))
    : journeys?.length
      ? renderJourneyScenarios(buildJourneyScenarios(journeys).scenarios)
      : undefined;

  assertActive();
  const totalPhases = phasesForAI.length;
  await progress('tasks', 'Merancang task per fase', 0, totalPhases);
  const generated = await generateTasksByPhase(
    {
      roadmap: { phases: phasesForAI },
      projectName: currentProject.name,
      prd: prdDoc as any,
      projectId,
      stack: stackContract,
      e2eScenarios,
      tier: TASK_GENERATION_TIER,
    },
    { onPhaseDone: (done, total) => void progress('tasks', 'Merancang task per fase', done, total) },
  );

  assertActive();
  await progress('validate', 'Memvalidasi task');
  const gate = await runTaskQualityGate({ generated, prd: prdDoc, flow, journeys });
  const validTasks = gate.tasks;
  const findings = [...preFindings, ...gate.findings];

  // Tulis ulang task secara atomik. Task yang sudah DONE adalah pekerjaan nyata di repo user,
  // jadi dipertahankan; task hasil generate yang kembar dengan task DONE dilewati.
  await progress('save', 'Menyimpan task');
  await prisma.$transaction(
    async (tx) => {
      const preserved = await tx.task.findMany({
        where: { projectId, status: 'DONE' },
        select: { title: true, order: true, aiContext: true },
      });
      const norm = (v: string) => v.trim().toLowerCase();
      const doneTitles = new Set(preserved.map((t) => norm(t.title)));
      const doneTaskIds = new Set(
        preserved
          .map((t) => (t.aiContext as { taskId?: string } | null)?.taskId)
          .filter((v): v is string => typeof v === 'string')
          .map(norm)
      );
      const fresh = validTasks.filter(
        (t) => !doneTitles.has(norm(t.title)) && !(t.taskId && doneTaskIds.has(norm(t.taskId)))
      );
      const startOrder = preserved.reduce((max, t) => Math.max(max, t.order), 0) + 1;

      await tx.task.deleteMany({ where: { projectId, status: { not: 'DONE' } } });
      await persistGeneratedTasks(tx, projectId, fresh, featureIdMap, null, startOrder);
      await tx.project.update({
        where: { id: projectId },
        data: {
          wizardStep: 'board',
        },
      });
    },
    { timeout: 60000 }
  );

  try {
    const report = await saveValidationReport(projectId, 'tasks_generate', findings);
    await enqueueSecurityAudit(projectId, userId, report.id, null);
  } catch (err) {
    logger.error('Gagal menyimpan laporan validasi tasks', { scope: 'tasks/generate', error: serializeError(err) });
  }

  if (isFirstGeneration && userId) {
    await incrementQuota(userId);
  }
  return { step: 'done', count: validTasks.length };
});

/**
 * Audit keamanan AI di background: hanya menambah temuan ke laporan validasi dan tidak mengubah task
 * (kriteria keamanan baseline sudah disuntikkan deterministik saat generate).
 */
registerJobHandler<{ reportId: string; cycleId?: string | null }>('security_audit', async ({ projectId, payload, assertActive }) => {
  if (!payload?.reportId) throw new NonRetryableJobError('Laporan validasi tidak ditentukan.');
  const [project, rows] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, include: { prd: true } }),
    prisma.task.findMany({ where: { projectId, cycleId: payload.cycleId ?? null }, orderBy: { order: 'asc' } }),
  ]);
  if (!project?.prd) throw new NonRetryableJobError('PRD belum ada.');
  if (rows.length === 0) return { findings: 0 };

  const tasks: AuditableTask[] = rows.map((t) => {
    const ctx = (t.aiContext ?? {}) as Record<string, any>;
    return {
      taskId: ctx.taskId ?? t.id,
      title: t.title,
      layer: t.layer as AuditableTask['layer'],
      files_to_create: ctx.files_to_create ?? [],
      files_to_modify: ctx.files_to_modify ?? [],
      apiContracts: (t.apiContracts ?? []) as AuditableTask['apiContracts'],
      consumesApis: ctx.consumesApis ?? [],
      acceptanceCriteria: (t.acceptanceCriteria ?? []) as string[],
    };
  });

  const audit = await auditTasksSecurity({ tasks, prd: readPrdContent(project.prd.content), projectId });
  assertActive();
  await appendFindings(payload.reportId, toReportFindings(audit.findings));
  return { findings: audit.findings.length };
});

/** Antrekan audit keamanan background; kegagalan hanya dicatat dan tidak menggagalkan generate. */
export async function enqueueSecurityAudit(projectId: string, userId: string | null, reportId: string, cycleId: string | null) {
  try {
    await enqueueAiJobOnce({ projectId, type: 'security_audit', userId, payload: { reportId, cycleId }, maxAttempts: 1 });
  } catch (err) {
    logger.warn('Audit keamanan background tidak dijadwalkan', { scope: 'tasks/generate', projectId, error: serializeError(err) });
  }
}

tasksRouter.post('/api/projects/:id/tasks/generate', requireUser, async (req: AuthedRequest, res) => {
  const projectId = req.params.id;
  const userId = req.userId;

  try {
    const { plan } = await getUserPlan(userId);
    if (plan === 'free') {
      return res.status(403).json({
        error: 'Paket Free hanya dapat mengakses hingga pembuatan PRD. Silakan upgrade paket untuk membuat task board dan mengeksekusi agen.',
        code: 'plan_upgrade_required',
        plan,
        upgradeUrl: '/pricing',
      });
    }

    const project = await prisma.project.findFirst({
      where: projectWhere(userId, projectId),
      select: { id: true, wizardStep: true },
    });
    if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

    const existingTasksCount = await prisma.task.count({ where: { projectId } });
    if (existingTasksCount > 0 && isStageLocked(project.wizardStep, 'board')) {
      return res.status(403).json({ error: 'Tasks telah selesai dibuat dan terkunci (Read-Only).' });
    }

    const isFirstGeneration = existingTasksCount === 0;
    if (isFirstGeneration) {
      const quotaCheck = await checkQuota(userId);
      if (!quotaCheck.allowed) {
        return res.status(403).json({
          error: 'Kuota proyek Anda telah habis. Silakan upgrade paket untuk melanjutkan.',
          plan: quotaCheck.plan,
          quotaUsed: quotaCheck.quotaUsed,
          quotaMax: quotaCheck.quotaMax,
          upgradeUrl: '/pricing',
        });
      }
    }

    // Idempoten di level DB: klik ganda atau generate yang sedang berjalan tidak membuat job kedua.
    await enqueueAiJobOnce({ projectId, type: 'tasks_generate', userId, payload: { isFirstGeneration } });

    res.json({
      ok: true,
      status: 'generating',
      message: 'Perancangan task sedang diproses di latar belakang.',
    });
  } catch (err: any) {
    if (rejectJobLimit(res, err)) return;
    res.status(500).json({ error: 'Gagal memulai perancangan task.', detail: err?.message });
  }
});

tasksRouter.get('/api/projects/:id/tasks', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const whereClause: any = { projectId: project.id };
  const cycleQuery = req.query.cycleId;
  if (cycleQuery !== undefined) {
    if (cycleQuery === 'null' || cycleQuery === '') {
      whereClause.cycleId = null;
    } else if (cycleQuery !== 'all') {
      whereClause.cycleId = String(cycleQuery);
    }
  }

  const tasks = await prisma.task.findMany({
    where: whereClause,
    include: {
      dependsOn: {
        include: {
          dependsOn: { select: { id: true, title: true, status: true, order: true } },
        },
      },
    },
    orderBy: { order: 'asc' },
  });

  const genJob = await getLatestJob(project.id, 'tasks_generate');

  res.json({
    tasks,
    // Map status AiJob ke label yang dipakai frontend polling
    generationStatus: toClientStatus(genJob?.status),
    generationError: genJob?.error ?? null,
  });
});

// Status job AI async (polling generic untuk semua job).
tasksRouter.get('/api/projects/:id/ai-jobs', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
    select: { id: true },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const type = String(req.query.type ?? '');
  if (!isAiJobType(type)) {
    return res.status(400).json({ error: 'Tipe job AI tidak valid.' });
  }

  const job = await getLatestJob(project.id, type);
  res.json({
    status: job?.status ?? 'idle',
    error: job?.error ?? null,
    result: job?.result ?? null,
    attempts: job?.attempts ?? 0,
  });
});

// Batalkan job AI yang sedang antre atau berjalan (hasil job berjalan dibuang).
tasksRouter.post('/api/projects/:id/ai-jobs/cancel', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
    select: { id: true },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const type = String(req.body?.type ?? '');
  if (!isAiJobType(type)) return res.status(400).json({ error: 'Tipe job AI tidak valid.' });

  const cancelled = await cancelAiJob(project.id, type);
  res.json({ ok: true, cancelled });
});

tasksRouter.patch('/api/tasks/:taskId', requireUser, async (req: AuthedRequest, res) => {
  const { z } = await import('zod');
  const schema = z.object({
    status: z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'BLOCKED']).optional(),
    blockedReason: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data tidak valid.' });
  const task = await prisma.task.findUnique({ where: { id: req.params.taskId }, include: { project: true } });
  const role = task ? await getProjectRole(req.userId, task.projectId) : null;
  if (!task || role === null) return res.status(404).json({ error: 'Task tidak ditemukan.' });
  if (!hasRole(role, 'member')) return res.status(403).json({ error: 'Peran Anda tidak memiliki izin untuk aksi ini.', code: 'insufficient_role' });
  const updated = await prisma.task.update({
    where: { id: task.id },
    data: {
      ...parsed.data,
      completedAt: parsed.data.status === 'DONE' ? new Date() : task.completedAt,
    },
  });

  if (task.cycleId && parsed.data.status === 'DONE') {
    const remaining = await prisma.task.count({
      where: { cycleId: task.cycleId, status: { not: 'DONE' } },
    });
    if (remaining === 0) {
      await prisma.projectCycle.update({
        where: { id: task.cycleId },
        data: { status: 'DONE' },
      });
    }
  }

  if (parsed.data.status && parsed.data.status !== task.status) {
    await recordAudit({
      action: 'task.status_change',
      actorUserId: req.userId,
      projectId: task.projectId,
      orgId: task.project.orgId,
      targetType: 'Task',
      targetId: task.id,
      metadata: { from: task.status, to: parsed.data.status },
      req,
    });
  }
  res.json({ task: updated });
});

// Laporan quality gate terbaru hasil generate task (cakupan requirement, API, flow, keamanan).
tasksRouter.get('/api/projects/:id/validation-reports', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
    select: { id: true },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
  const reports = await prisma.validationReport.findMany({
    where: { projectId: project.id, ...(kind ? { kind } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  res.json({ reports });
});
