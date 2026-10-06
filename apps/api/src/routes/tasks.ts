// Kanban tasks: generasi AI (fire-and-forget), list, update status.
import { logger, serializeError } from '../lib/logger.js';
import { Router } from 'express';
import { recordAudit } from '../lib/audit.js';
import { projectWhere, getProjectRole, hasRole } from '../lib/access.js';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { getUserPlan, checkQuota, incrementQuota } from '../lib/billing.js';
import { isStageLocked } from '../lib/stage.js';
import { PrdSchema, readPrdContent } from '../lib/ai/prd.js';
import { generateRoadmapFromPRD } from '../lib/ai/roadmap.js';
import { generateTasksFromRoadmap } from '../lib/ai/tasks.js';
import { BusinessFlowSchema } from '../lib/ai/schemas.js';
import { checkSpecConsistency } from '../lib/ai/product-spec.js';
import { enumerateFlowPaths, renderFlowScenarios } from '../lib/ai/flow-contract.js';
import { saveValidationReport, type Finding } from '../lib/ai/validation-report.js';
import { ensureProductSpec } from '../lib/prd-spec.js';
import { runTaskQualityGate } from '../lib/task-quality.js';
import { resolveStackContract } from '../lib/ai/stack-contract.js';
import { persistGeneratedTasks } from '../lib/task-persist.js';
import { enqueueAiJob, getLatestJob, hasActiveJob, isAiJobType, registerJobHandler, toClientStatus, cancelAiJob, NonRetryableJobError, rejectJobLimit } from '../lib/ai/job.js';

export const tasksRouter = Router();

registerJobHandler<{ isFirstGeneration?: boolean }>('tasks_generate', async ({ projectId, userId, payload }) => {
  const isFirstGeneration = payload?.isFirstGeneration === true;
  let currentProject = await prisma.project.findFirst({
    where: { id: projectId },
    include: {
      prd: true,
      stacks: true,
      roadmap: { include: { features: { include: { dependencies: true } } } },
    },
  });
  if (!currentProject) throw new NonRetryableJobError('Project tidak ditemukan saat proses latar belakang.');

  // Auto-generate roadmap jika belum ada tapi PRD ada
  if (currentProject.roadmap.length === 0) {
    if (!currentProject.prd) throw new NonRetryableJobError('PRD belum ada. Generate PRD dulu.');
    const parsedPrd = PrdSchema.parse(currentProject.prd.content);
    const roadmapData = await generateRoadmapFromPRD(parsedPrd, { projectId: currentProject.id });
    await prisma.roadmapPhase.deleteMany({ where: { projectId: currentProject.id } });

    const phaseMap = new Map<string, string>();
    for (const p of roadmapData.phases) {
      const created = await prisma.roadmapPhase.create({
        data: { projectId: currentProject.id, order: p.order, title: p.title, description: p.description, layer: p.layer },
      });
      for (const f of p.features) {
        const fcreated = await prisma.roadmapFeature.create({
          data: { phaseId: created.id, title: f.title, description: f.description },
        });
        phaseMap.set(f.id, fcreated.id);
      }
    }
    for (const p of roadmapData.phases) {
      for (const f of p.features) {
        if (f.dependsOn.length === 0) continue;
        const fromId = phaseMap.get(f.id);
        if (!fromId) continue;
        for (const dep of f.dependsOn) {
          const toId = phaseMap.get(dep);
          if (!toId) continue;
          await prisma.roadmapDependency.create({ data: { featureId: fromId, dependsOnId: toId } });
        }
      }
    }

    const refetched = await prisma.project.findFirst({
      where: { id: projectId },
      include: {
        prd: true,
        stacks: true,
        roadmap: { include: { features: { include: { dependencies: true } } } },
      },
    });
    if (refetched) currentProject = refetched;
  }

  if (currentProject.roadmap.length === 0) throw new NonRetryableJobError('Roadmap belum ada.');

  // Konversi Prisma ke shape yang dipahami AI generator.
  const featureIdMap = new Map<string, string>(); // dbId -> tmpId
  const featuresForAI: { id: string; title: string; description?: string; layer: string; dependsOn: string[] }[] = [];
  let tmpCounter = 1;
  for (const phase of currentProject.roadmap) {
    for (const f of phase.features) {
      const tmpId = `f${tmpCounter++}`;
      featureIdMap.set(f.id, tmpId);
      featuresForAI.push({
        id: tmpId,
        title: f.title,
        description: f.description ?? undefined,
        layer: phase.layer,
        dependsOn: f.dependencies.map((d) => featureIdMap.get(d.dependsOnId) ?? '').filter(Boolean),
      });
    }
  }
  const phasesForAI = currentProject.roadmap.map((p) => ({
    order: p.order,
    title: p.title,
    description: p.description ?? undefined,
    layer: p.layer as 'BOOTSTRAP' | 'DATABASE' | 'BACKEND' | 'FRONTEND' | 'INTEGRATION',
    features: featuresForAI
      .filter((f) => currentProject!.roadmap.find((rp) => rp.features.find((rf) => featureIdMap.get(rf.id) === f.id))?.id === p.id)
      .map((f) => ({ id: f.id, title: f.title, description: f.description, dependsOn: f.dependsOn })),
  }));

  // Spec terstruktur PRD (diekstrak otomatis untuk PRD lama) dan kontrak flow bisnis.
  const preFindings: Finding[] = [];
  const specResult = await ensureProductSpec(currentProject.id);
  const prdDoc = specResult?.prd ?? readPrdContent(currentProject.prd?.content);
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

  const flowRow = await prisma.businessFlow.findUnique({ where: { projectId: currentProject.id } });
  const parsedFlow = flowRow ? BusinessFlowSchema.safeParse(flowRow.content) : null;
  const flow = parsedFlow?.success ? parsedFlow.data : null;
  if (!flow) {
    preFindings.push({
      code: 'FLOW_MISSING',
      severity: 'info',
      message: 'Business flow belum tersedia atau tidak valid, skenario E2E diturunkan dari PRD saja.',
    });
  }
  const flowScenarios = flow ? renderFlowScenarios(flow, enumerateFlowPaths(flow)) : undefined;

  const stackContract = resolveStackContract(currentProject.stacks || []);

  const generated = await generateTasksFromRoadmap({
    roadmap: { phases: phasesForAI },
    projectName: currentProject.name,
    prd: prdDoc as any,
    projectId: currentProject.id,
    stack: stackContract,
    flowScenarios,
  });

  const gate = await runTaskQualityGate({ generated, prd: prdDoc, flow, projectId: currentProject.id });
  const validTasks = gate.tasks;
  const findings = [...preFindings, ...gate.findings];

  // Tulis ulang task secara atomik. Task yang sudah DONE adalah pekerjaan nyata di repo user,
  // jadi dipertahankan; task hasil generate yang kembar dengan task DONE dilewati.
  await prisma.$transaction(
    async (tx) => {
      const preserved = await tx.task.findMany({
        where: { projectId: currentProject!.id, status: 'DONE' },
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

      await tx.task.deleteMany({ where: { projectId: currentProject!.id, status: { not: 'DONE' } } });
      await persistGeneratedTasks(tx, currentProject!.id, fresh, featureIdMap, null, startOrder);
      await tx.project.update({
        where: { id: currentProject!.id },
        data: {
          wizardStep: 'board',
        },
      });
    },
    { timeout: 60000 }
  );

  try {
    await saveValidationReport(currentProject.id, 'tasks_generate', findings);
  } catch (err) {
    logger.error('Gagal menyimpan laporan validasi tasks', { scope: 'tasks/generate', error: serializeError(err) });
  }

  if (isFirstGeneration && userId) {
    await incrementQuota(userId);
  }
});


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

    if (await hasActiveJob(projectId, 'tasks_generate')) {
      return res.status(409).json({ error: 'Perancangan task sedang berlangsung. Mohon tunggu sejenak.' });
    }

    await enqueueAiJob({ projectId, type: 'tasks_generate', userId, payload: { isFirstGeneration } });

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
