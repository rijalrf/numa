// Change Cycle: permintaan perubahan, analisis dampak, klarifikasi, dan generasi task siklus.
// Alur: change-request (DRAFT + job cycle_analyze) -> [clarify bila VAGUE] -> generate (job cycle_generate) -> siklus OPEN.
import { logger, serializeError } from '../lib/logger.js';
import { Router } from 'express';
import { snapshotArtifact } from '../lib/artifact-version.js';
import { projectWhere } from '../lib/access.js';
import { recordAudit } from '../lib/audit.js';
import { toClientError } from '../lib/http-error.js';
import { ChangeRequestBodySchema, ClarifyBodySchema, CycleGenerateBodySchema } from '../lib/request-schemas.js';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { getUserPlan } from '../lib/billing.js';
import { readPrdContent } from '../lib/ai/prd.js';
import { runTaskQualityGate } from '../lib/task-quality.js';
import { saveValidationReport, type Finding } from '../lib/ai/validation-report.js';
import { enqueueSecurityAudit } from './tasks.js';
import {
  analyzeChangeRequest,
  assignRequirementIds,
  mergePrdDelta,
  nextFunctionalRequirementNumber,
  remapSpecDeltaIds,
  summarizeCompletedTasks,
  MAX_CLARIFY_ROUNDS,
  type CycleRoadmapFeature,
  type ImpactResult,
} from '../lib/ai/cycle.js';
import { generateTasksFromRoadmap } from '../lib/ai/tasks.js';
import { resolveStackContract } from '../lib/ai/stack-contract.js';
import { persistGeneratedTasks } from '../lib/task-persist.js';
import {
  enqueueAiJobOnce,
  cancelAiJob,
  getLatestJob,
  hasActiveJob,
  registerJobHandler,
  toClientStatus,
  NonRetryableJobError,
  rejectJobLimit,
} from '../lib/ai/job.js';
import type { RoadmapData } from '../lib/ai/roadmap.js';

export const cyclesRouter = Router();

type CycleAnalyzePayload = {
  cycleId: string;
};

type CycleGeneratePayload = {
  cycleId: string;
  splitMode: 'single' | 'a' | 'b';
  overrideTitle?: string;
};

type ClarifyEntry = { question: string; answer: string; round?: number };

/** Hasil analisis tersimpan bila objek impact memuat ringkasan (default skema selalu mengisinya). */
function isAnalyzed(impact: unknown): impact is ImpactResult {
  return typeof impact === 'object' && impact !== null && typeof (impact as { summary?: unknown }).summary === 'string';
}

function readClarifyEntries(raw: unknown): ClarifyEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is ClarifyEntry =>
      typeof e === 'object' && e !== null && typeof (e as ClarifyEntry).question === 'string' && typeof (e as ClarifyEntry).answer === 'string'
  );
}

/** Jumlah putaran jawaban klarifikasi yang sudah dikirim (entri tanpa nomor putaran dianggap putaran 1). */
function clarifyRoundCount(entries: ClarifyEntry[]): number {
  return entries.reduce((max, e) => Math.max(max, e.round ?? 1), 0);
}

function listRoadmapFeatures(roadmap: Array<{ title: string; order: number; features: Array<{ id: string; title: string }> }>): CycleRoadmapFeature[] {
  return [...roadmap]
    .sort((a, b) => a.order - b.order)
    .flatMap((p) => p.features.map((f) => ({ id: f.id, title: f.title, phase: p.title })));
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === 'P2002';
}

registerJobHandler<CycleAnalyzePayload>('cycle_analyze', async ({ projectId, payload, assertActive }) => {
  const project = await prisma.project.findFirst({
    where: { id: projectId },
    include: { prd: true, roadmap: { include: { features: true } } },
  });
  if (!project) throw new NonRetryableJobError('Project tidak ditemukan saat proses latar belakang.');
  const cycle = await prisma.projectCycle.findFirst({
    where: { id: payload.cycleId, projectId, status: 'DRAFT' },
  });
  if (!cycle) throw new NonRetryableJobError('Draft siklus tidak ditemukan.');

  const doneTasks = await prisma.task.findMany({
    where: { projectId, status: 'DONE' },
    orderBy: { order: 'asc' },
    select: { title: true, layer: true, aiContext: true },
  });
  const clarifyEntries = readClarifyEntries(cycle.clarify);

  const impact = await analyzeChangeRequest({
    projectId,
    request: cycle.request,
    prd: project.prd?.content ? readPrdContent(project.prd.content) : null,
    repoSummary: project.repoSummary,
    completedTasks: summarizeCompletedTasks(doneTasks),
    roadmapFeatures: listRoadmapFeatures(project.roadmap),
    clarifyAnswers: clarifyEntries,
    allowClarification: clarifyRoundCount(clarifyEntries) < MAX_CLARIFY_ROUNDS,
  });
  assertActive();

  // Draft bisa saja dibatalkan selagi analisis berjalan; hasilnya dibuang.
  const saved = await prisma.projectCycle.updateMany({
    where: { id: cycle.id, status: 'DRAFT' },
    data: { impact: impact as any, type: impact.type, size: impact.size },
  });
  return { clarity: impact.clarity, saved: saved.count === 1 };
});

registerJobHandler<CycleGeneratePayload>('cycle_generate', async ({ projectId, userId, payload, assertActive }) => {
  const { cycleId, splitMode, overrideTitle } = payload;
  // Ambil ulang data segar di dalam job
  const freshProject = await prisma.project.findFirst({
    where: { id: projectId },
    include: {
      prd: true,
      stacks: true,
      roadmap: { include: { features: true } },
    },
  });
  if (!freshProject) throw new NonRetryableJobError('Project tidak ditemukan saat proses latar belakang.');
  const freshCycle = await prisma.projectCycle.findFirst({
    where: { id: cycleId, projectId, status: 'DRAFT' },
  });
  if (!freshCycle) throw new NonRetryableJobError('Draft siklus tidak ditemukan.');
  if (!isAnalyzed(freshCycle.impact)) throw new NonRetryableJobError('Draft siklus belum dianalisis.');

  const basePrd = freshProject.prd?.content ? readPrdContent(freshProject.prd.content) : undefined;

  let effectiveRequest = freshCycle.request;
  let impact: ImpactResult = freshCycle.impact;
  // Bagian yang tidak dikerjakan sekarang; disimpan sebagai siklus DRAFT berikutnya.
  let deferredRequest: string | null = null;

  if (splitMode !== 'single') {
    const split = impact.splitProposal;
    if (!split?.partA || !split?.partB) throw new NonRetryableJobError('Usulan pemecahan siklus tidak tersedia.');
    effectiveRequest = splitMode === 'a' ? split.partA : split.partB;
    deferredRequest = splitMode === 'a' ? split.partB : split.partA;
    const doneTasks = await prisma.task.findMany({
      where: { projectId, status: 'DONE' },
      orderBy: { order: 'asc' },
      select: { title: true, layer: true, aiContext: true },
    });
    impact = await analyzeChangeRequest({
      projectId,
      request: effectiveRequest,
      prd: basePrd ?? null,
      repoSummary: freshProject.repoSummary,
      completedTasks: summarizeCompletedTasks(doneTasks),
      roadmapFeatures: listRoadmapFeatures(freshProject.roadmap),
      clarifyAnswers: readClarifyEntries(freshCycle.clarify),
      allowClarification: false,
    });
    assertActive();
  }

  const cycleTitle = overrideTitle ?? (splitMode === 'single' ? freshCycle.title : effectiveRequest.slice(0, 60));

  // Requirement baru dinomori kode (lanjutan FR terbesar), lalu PRD hasil merge disusun di memori supaya
  // generator task dan quality gate melihat requirement, entitas, dan endpoint baru. Penyimpanannya di transaksi.
  let prdDoc = basePrd;
  let prdMerge: { content: Record<string, unknown>; version: number } | null = null;
  const newRequirementIds = new Set<string>();
  if (freshProject.prd && basePrd && impact.needsPrdChange && impact.newRequirements.length > 0) {
    const numbered = assignRequirementIds(
      impact.newRequirements,
      nextFunctionalRequirementNumber(basePrd),
      basePrd.requirementIndex.map((r) => r.id)
    );
    const content = mergePrdDelta(freshProject.prd.content, {
      summary: impact.prdChangeSummary ?? impact.summary,
      newRequirements: numbered.requirements,
      specDelta: impact.specDelta,
      idMap: numbered.idMap,
      cycleNumber: freshCycle.number,
    });
    impact = {
      ...impact,
      newRequirements: numbered.requirements,
      specDelta: impact.specDelta ? remapSpecDeltaIds(impact.specDelta, numbered.idMap) : impact.specDelta,
    };
    for (const r of numbered.requirements) newRequirementIds.add(r.id);
    prdMerge = { content, version: freshProject.prd.version };
    prdDoc = readPrdContent(content);
  }

  // Roadmap siklus: hanya fitur yang terdampak ditambah satu fitur siklus (task fitur lain tidak dibuat ulang).
  const impactedIds = new Set(impact.impactedFeatureIds);
  const featureIdMap = new Map<string, string>();
  const impactedPhases = [...freshProject.roadmap]
    .sort((a, b) => a.order - b.order)
    .map((p) => ({
      order: p.order,
      title: p.title,
      description: p.description ?? undefined,
      layer: p.layer as any,
      features: p.features
        .filter((f) => impactedIds.has(f.id))
        .map((f) => {
          featureIdMap.set(f.id, f.id);
          return {
            id: f.id,
            title: f.title,
            description: f.description ?? undefined,
            dependsOn: [],
          };
        }),
    }))
    .filter((p) => p.features.length > 0);
  featureIdMap.set('CYCLE-FEAT', 'CYCLE-FEAT');
  const roadmapData: RoadmapData = {
    phases: [
      ...impactedPhases,
      {
        order: Math.max(0, ...freshProject.roadmap.map((p) => p.order)) + 1,
        title: 'Siklus Perubahan',
        description: 'Perubahan lintas layer (DATABASE, BACKEND, FRONTEND, INTEGRATION) sesuai kebutuhan permintaan.',
        layer: 'BACKEND' as const,
        features: [{ id: 'CYCLE-FEAT', title: cycleTitle, description: impact.summary, dependsOn: [] }],
      },
    ],
  };

  const lastTask = await prisma.task.findFirst({
    where: { projectId },
    orderBy: { order: 'desc' },
    select: { order: true },
  });
  const promptStartOrder = (lastTask?.order ?? 0) + 1;

  const stackContract = freshProject.stacks.length > 0 ? resolveStackContract(freshProject.stacks) : undefined;

  const generated = await generateTasksFromRoadmap({
    roadmap: roadmapData,
    projectName: freshProject.name,
    prd: prdDoc,
    projectId,
    stack: stackContract,
    cycle: {
      request: effectiveRequest,
      impact,
      repoSummary: freshProject.repoSummary,
      startOrder: promptStartOrder,
    },
  });
  assertActive();

  // Quality gate hanya menilai yang diubah siklus ini: requirement dan endpoint baru, bukan seluruh PRD.
  const basePrdForGate = prdDoc ?? { markdown: '', requirementIndex: [] };
  const gate = await runTaskQualityGate({
    generated,
    prd: {
      ...basePrdForGate,
      requirementIndex: basePrdForGate.requirementIndex.filter((r) => newRequirementIds.has(r.id)),
      apiEndpoints: impact.specDelta?.endpoints ?? [],
    },
  });
  const validTasks = gate.tasks;

  // AI kadang tidak mengisi specDelta walau PRD berubah. Spec tidak diperbarui, jadi user perlu tahu.
  const findings: Finding[] = [...gate.findings];
  if (prdMerge && basePrd?.spec && !impact.specDelta) {
    findings.unshift({
      code: 'CYCLE_SPEC_DELTA_MISSING',
      severity: 'info',
      message:
        'Analisis tidak menyertakan perubahan entitas, endpoint, atau journey. Spec PRD tidak diperbarui; requirement baru tetap masuk PRD, tetapi model data dan endpoint barunya tidak tercatat di spec.',
    });
  }

  // Snapshot PRD lama hanya bila PRD akan diubah (best-effort, di luar transaksi).
  if (prdMerge) await snapshotArtifact(projectId, 'prd', 'cycle_merge');

  // Klaim draft, simpan PRD hasil merge, simpan task, dan siapkan sisa pemecahan dalam satu transaksi:
  // job yang diulang tidak pernah menggandakan merge atau task.
  await prisma.$transaction(
    async (tx) => {
      const claimed = await tx.projectCycle.updateMany({
        where: { id: cycleId, projectId, status: 'DRAFT' },
        data: {
          title: cycleTitle,
          request: effectiveRequest,
          status: 'OPEN',
          impact: impact as any,
          prdDelta: prdMerge
            ? { summary: impact.prdChangeSummary ?? impact.summary, newRequirements: impact.newRequirements }
            : {},
          type: impact.type,
          size: impact.size,
        },
      });
      if (claimed.count !== 1) {
        throw new NonRetryableJobError('Draft siklus sudah tidak tersedia (dibatalkan atau diproses job lain).');
      }

      if (prdMerge) {
        const updated = await tx.prd.updateMany({
          where: { projectId, version: prdMerge.version },
          data: { content: prdMerge.content as any, version: { increment: 1 } },
        });
        // PRD berubah selagi AI bekerja: transaksi dibatalkan dan job diulang dari PRD terbaru.
        if (updated.count !== 1) throw new Error('PRD berubah selama perancangan siklus.');
      }

      const last = await tx.task.findFirst({
        where: { projectId },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      await persistGeneratedTasks(tx, projectId, validTasks, featureIdMap, cycleId, (last?.order ?? 0) + 1);

      if (deferredRequest) {
        const max = await tx.projectCycle.aggregate({ where: { projectId }, _max: { number: true } });
        await tx.projectCycle.create({
          data: {
            projectId,
            number: (max._max.number ?? 0) + 1,
            title: deferredRequest.slice(0, 60),
            request: deferredRequest,
            status: 'DRAFT',
          },
        });
      }

      await tx.project.update({
        where: { id: projectId },
        data: { wizardStep: 'board' },
      });
    },
    { timeout: 60000 }
  );

  try {
    const report = await saveValidationReport(projectId, 'cycle_generate', findings);
    await enqueueSecurityAudit(projectId, userId, report.id, cycleId);
  } catch (err) {
    logger.error('Gagal menyimpan laporan validasi cycle', { scope: 'cycles/generate', error: serializeError(err) });
  }

  const tasksCount = await prisma.task.count({ where: { cycleId } });
  return { ok: true, cycleId, tasksCount, deferred: deferredRequest !== null };
});

/** Status job siklus terakhir; cycleId memungkinkan klien mengabaikan job milik siklus lain. */
async function latestCycleJob(projectId: string, type: 'cycle_analyze' | 'cycle_generate') {
  const job = await getLatestJob(projectId, type);
  if (!job) return { status: 'idle', error: null, cycleId: null };
  return {
    status: toClientStatus(job.status),
    error: job.error ?? null,
    cycleId: (job.payload as { cycleId?: string } | null)?.cycleId ?? null,
  };
}

function sendError(res: Parameters<typeof rejectJobLimit>[0], err: unknown) {
  if (rejectJobLimit(res, err)) return;
  const { status, body } = toClientError(err);
  res.status(status).json(body);
}

cyclesRouter.get('/api/projects/:id/cycles', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const cycles = await prisma.projectCycle.findMany({
    where: { projectId: project.id },
    orderBy: { number: 'asc' },
    include: {
      tasks: {
        select: { id: true, status: true },
      },
    },
  });

  const openCycle = cycles.find((c) => c.status === 'OPEN');
  const draftCycle = cycles.find((c) => c.status === 'DRAFT');

  const mapped = cycles.map((c) => ({
    id: c.id,
    number: c.number,
    title: c.title,
    request: c.request,
    status: c.status,
    type: c.type,
    size: c.size,
    impact: c.impact,
    clarify: c.clarify,
    prdDelta: c.prdDelta,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    taskCounts: {
      total: c.tasks.length,
      done: c.tasks.filter((t) => t.status === 'DONE').length,
    },
  }));

  const initialTasks = await prisma.task.findMany({
    where: { projectId: project.id, cycleId: null },
    select: { id: true, status: true },
  });

  const [analyze, generate] = await Promise.all([
    latestCycleJob(project.id, 'cycle_analyze'),
    latestCycleJob(project.id, 'cycle_generate'),
  ]);

  res.json({
    cycles: mapped,
    openCycleId: openCycle?.id ?? null,
    draftCycleId: draftCycle?.id ?? null,
    initialTaskCounts: {
      total: initialTasks.length,
      done: initialTasks.filter((t) => t.status === 'DONE').length,
    },
    jobs: { analyze, generate },
  });
});

cyclesRouter.get('/api/projects/:id/cycles/:cycleId', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const cycle = await prisma.projectCycle.findFirst({
    where: { id: req.params.cycleId, projectId: project.id },
    include: {
      tasks: {
        include: {
          dependsOn: {
            include: {
              dependsOn: { select: { id: true, title: true, status: true, order: true } },
            },
          },
        },
        orderBy: { order: 'asc' },
      },
    },
  });
  if (!cycle) return res.status(404).json({ error: 'Siklus tidak ditemukan.' });

  res.json({ cycle });
});

// Ajukan permintaan perubahan: buat siklus DRAFT lalu analisis dampak di background (tanpa mengulang wizard).
cyclesRouter.post('/api/projects/:id/change-request', requireUser, async (req: AuthedRequest, res) => {
  const parsed = ChangeRequestBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Permintaan tidak valid.' });
  }

  const { config } = await getUserPlan(req.userId);
  if (parsed.data.request.length > config.charLimit) {
    return res.status(400).json({
      error: `Permintaan terlalu panjang (${parsed.data.request.length} karakter). Maksimal ${config.charLimit} karakter untuk paket ${config.name}.`,
    });
  }

  let createdCycleId: string | null = null;
  try {
    const project = await prisma.project.findFirst({
      where: projectWhere(req.userId, req.params.id),
      include: { tasks: { select: { status: true } } },
    });
    if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

    // Guard: perubahan hanya berarti bila sudah ada task, dan seluruhnya selesai
    if (project.tasks.length === 0) {
      return res.status(409).json({ error: 'Belum ada task di project ini. Buat dan selesaikan task awal sebelum mengajukan perubahan.' });
    }
    const pendingCount = project.tasks.filter((t) => t.status !== 'DONE').length;
    if (pendingCount > 0) {
      return res.status(409).json({
        error: `Masih ada ${pendingCount} task yang belum selesai. Selesaikan semua task sebelum memulai perubahan.`,
      });
    }

    // Guard: tidak boleh ada siklus aktif, dan hanya satu draft yang boleh menunggu
    const activeCycle = await prisma.projectCycle.findFirst({
      where: { projectId: project.id, status: { in: ['OPEN', 'DRAFT'] } },
      orderBy: { number: 'asc' },
    });
    if (activeCycle?.status === 'OPEN') {
      return res.status(409).json({
        error: `Masih ada siklus aktif "${activeCycle.title}" yang harus diselesaikan terlebih dahulu.`,
      });
    }
    if (activeCycle?.status === 'DRAFT') {
      return res.status(409).json({
        error: `Masih ada draf perubahan "${activeCycle.title}". Lanjutkan atau batalkan draf itu dulu.`,
        code: 'cycle_draft_exists',
        cycleId: activeCycle.id,
      });
    }

    const cycle = await prisma.$transaction(async (tx) => {
      const max = await tx.projectCycle.aggregate({ where: { projectId: project.id }, _max: { number: true } });
      return tx.projectCycle.create({
        data: {
          projectId: project.id,
          number: (max._max.number ?? 0) + 1,
          title: parsed.data.request.slice(0, 60),
          request: parsed.data.request,
          status: 'DRAFT',
        },
      });
    });
    createdCycleId = cycle.id;

    await enqueueAiJobOnce({
      projectId: project.id,
      type: 'cycle_analyze',
      userId: req.userId,
      payload: { cycleId: cycle.id },
    });
    createdCycleId = null; // draft sudah punya job analisis; tidak perlu dibatalkan bila langkah berikutnya gagal

    await recordAudit({
      action: 'cycle.request',
      actorUserId: req.userId,
      projectId: project.id,
      targetType: 'ProjectCycle',
      targetId: cycle.id,
      req,
    });

    res.json({ ok: true, cycleId: cycle.id, status: 'analyzing' });
  } catch (err) {
    // Antrean menolak (mis. batas job per user): draf yatim dibuang agar permintaan bisa diajukan ulang.
    if (createdCycleId) {
      await prisma.projectCycle.deleteMany({ where: { id: createdCycleId, status: 'DRAFT' } }).catch(() => undefined);
    }
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: 'Permintaan perubahan lain sedang diproses. Muat ulang lalu coba lagi.' });
    }
    logger.error('Gagal memproses permintaan perubahan project', { scope: 'change-request', projectId: req.params.id, error: serializeError(err) });
    sendError(res, err);
  }
});

// Jalankan (ulang) analisis dampak draf yang belum punya hasil, mis. draf sisa pemecahan atau analisis yang gagal.
cyclesRouter.post('/api/projects/:id/cycles/:cycleId/analyze', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
    select: { id: true },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const cycle = await prisma.projectCycle.findFirst({
    where: { id: req.params.cycleId, projectId: project.id, status: 'DRAFT' },
  });
  if (!cycle) return res.status(404).json({ error: 'Draft siklus tidak ditemukan.' });
  if (isAnalyzed(cycle.impact)) {
    return res.status(409).json({ error: 'Draft ini sudah dianalisis.' });
  }

  try {
    await enqueueAiJobOnce({
      projectId: project.id,
      type: 'cycle_analyze',
      userId: req.userId,
      payload: { cycleId: cycle.id },
    });
    res.json({ ok: true, cycleId: cycle.id, status: 'analyzing' });
  } catch (err) {
    logger.error('Gagal memulai analisis siklus', { scope: 'cycles/analyze', cycleId: cycle.id, error: serializeError(err) });
    sendError(res, err);
  }
});

// Kirim jawaban klarifikasi atas permintaan yang kabur, lalu analisis ulang dengan jawaban itu.
cyclesRouter.post('/api/projects/:id/cycles/:cycleId/clarify', requireUser, async (req: AuthedRequest, res) => {
  const parsed = ClarifyBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Jawaban tidak valid.' });
  }

  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
    select: { id: true },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const cycle = await prisma.projectCycle.findFirst({
    where: { id: req.params.cycleId, projectId: project.id, status: 'DRAFT' },
  });
  if (!cycle) return res.status(404).json({ error: 'Draft siklus tidak ditemukan.' });

  const impact = cycle.impact;
  const questions = isAnalyzed(impact) && impact.clarity === 'VAGUE' ? impact.clarificationQuestions ?? [] : [];
  if (questions.length === 0) {
    return res.status(409).json({ error: 'Draft ini tidak sedang meminta klarifikasi.' });
  }
  if (await hasActiveJob(project.id, 'cycle_analyze')) {
    return res.status(409).json({ error: 'Analisis perubahan sedang berlangsung. Mohon tunggu sejenak.' });
  }

  // Teks pertanyaan diambil dari hasil analisis tersimpan, bukan dari klien.
  const answerById = new Map(parsed.data.answers.map((a) => [a.questionId, a.answer]));
  const unknownIds = parsed.data.answers.filter((a) => !questions.some((q) => q.id === a.questionId));
  const missing = questions.filter((q) => !answerById.has(q.id));
  if (unknownIds.length > 0 || missing.length > 0) {
    return res.status(400).json({ error: 'Semua pertanyaan klarifikasi wajib dijawab.' });
  }

  const previous = readClarifyEntries(cycle.clarify);
  const round = clarifyRoundCount(previous) + 1;
  const next: ClarifyEntry[] = [...previous, ...questions.map((q) => ({ question: q.label, answer: answerById.get(q.id)!, round }))];

  try {
    await prisma.projectCycle.update({ where: { id: cycle.id }, data: { clarify: next as any } });
    try {
      await enqueueAiJobOnce({
        projectId: project.id,
        type: 'cycle_analyze',
        userId: req.userId,
        payload: { cycleId: cycle.id },
      });
    } catch (err) {
      await prisma.projectCycle.update({ where: { id: cycle.id }, data: { clarify: previous as any } });
      throw err;
    }
    res.json({ ok: true, cycleId: cycle.id, status: 'analyzing' });
  } catch (err) {
    logger.error('Gagal memproses klarifikasi siklus', { scope: 'cycles/clarify', cycleId: cycle.id, error: serializeError(err) });
    sendError(res, err);
  }
});

// Batalkan draf perubahan (hanya DRAFT; siklus OPEN/DONE sudah punya task).
cyclesRouter.delete('/api/projects/:id/cycles/:cycleId', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
    select: { id: true },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const cycle = await prisma.projectCycle.findFirst({
    where: { id: req.params.cycleId, projectId: project.id, status: 'DRAFT' },
  });
  if (!cycle) return res.status(404).json({ error: 'Draft siklus tidak ditemukan.' });

  if (await hasActiveJob(project.id, 'cycle_generate')) {
    return res.status(409).json({ error: 'Perancangan task siklus sedang berlangsung. Draf belum bisa dibatalkan.' });
  }

  await cancelAiJob(project.id, 'cycle_analyze');
  const removed = await prisma.projectCycle.deleteMany({ where: { id: cycle.id, status: 'DRAFT' } });
  if (removed.count === 1) {
    await recordAudit({
      action: 'cycle.cancel',
      actorUserId: req.userId,
      projectId: project.id,
      targetType: 'ProjectCycle',
      targetId: cycle.id,
      req,
    });
  }
  res.json({ ok: true });
});

cyclesRouter.post('/api/projects/:id/cycles/:cycleId/generate', requireUser, async (req: AuthedRequest, res) => {
  const parsed = CycleGenerateBodySchema.safeParse(req.body);
  if (!parsed.success || !parsed.data.confirm) {
    return res.status(400).json({ error: 'Konfirmasi siklus diperlukan.' });
  }

  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
    select: { id: true },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const cycle = await prisma.projectCycle.findFirst({
    where: { id: req.params.cycleId, projectId: project.id, status: 'DRAFT' },
  });
  if (!cycle) return res.status(404).json({ error: 'Draft siklus tidak ditemukan.' });

  if (!isAnalyzed(cycle.impact)) {
    return res.status(409).json({ error: 'Analisis perubahan belum selesai.', code: 'analysis_pending' });
  }
  if (cycle.impact.clarity === 'VAGUE') {
    return res.status(409).json({ error: 'Permintaan masih kabur. Jawab pertanyaan klarifikasi dulu.', code: 'clarification_required' });
  }
  if (await hasActiveJob(project.id, 'cycle_analyze')) {
    return res.status(409).json({ error: 'Analisis perubahan sedang berlangsung. Mohon tunggu sejenak.', code: 'analysis_pending' });
  }
  if (parsed.data.split !== 'single' && !(cycle.impact.splitProposal?.partA && cycle.impact.splitProposal?.partB)) {
    return res.status(400).json({ error: 'Analisis tidak menyarankan pemecahan untuk perubahan ini.' });
  }

  const pendingCount = await prisma.task.count({ where: { projectId: project.id, status: { not: 'DONE' } } });
  if (pendingCount > 0) {
    return res.status(409).json({
      error: `Masih ada ${pendingCount} task yang belum selesai. Selesaikan semua task sebelum memulai siklus baru.`,
    });
  }

  const activeCycle = await prisma.projectCycle.findFirst({
    where: { projectId: project.id, status: 'OPEN' },
  });
  if (activeCycle) {
    return res.status(409).json({ error: 'Masih ada siklus lain yang berstatus OPEN.' });
  }

  try {
    const { created } = await enqueueAiJobOnce({
      projectId: project.id,
      type: 'cycle_generate',
      userId: req.userId,
      payload: { cycleId: cycle.id, splitMode: parsed.data.split, overrideTitle: parsed.data.title },
    });
    if (!created) {
      return res.status(409).json({ error: 'Perancangan task siklus sedang berlangsung. Mohon tunggu sejenak.' });
    }

    await recordAudit({
      action: 'cycle.confirm',
      actorUserId: req.userId,
      projectId: project.id,
      targetType: 'ProjectCycle',
      targetId: cycle.id,
      metadata: { split: parsed.data.split },
      req,
    });

    res.json({ ok: true, status: 'generating', cycleId: cycle.id });
  } catch (err) {
    logger.error('Gagal memulai perancangan task untuk cycle', { scope: 'cycles/generate', cycleId: cycle.id, error: serializeError(err) });
    sendError(res, err);
  }
});
