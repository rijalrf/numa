// Change Cycle: riwayat siklus, permintaan perubahan, generasi task siklus.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { getUserPlan } from '../lib/billing.js';
import { readPrdContent } from '../lib/ai/prd.js';
import { analyzeChangeRequest, mergePrdDelta } from '../lib/ai/cycle.js';
import { generateTasksFromRoadmap, type TaskGen } from '../lib/ai/tasks.js';
import { validateAndNormalizeDAG } from '../lib/ai/dag-validator.js';
import { resolveStackContract } from '../lib/ai/stack-contract.js';
import { persistGeneratedTasks } from '../lib/task-persist.js';
import { startAiJob, hasActiveJob } from '../lib/ai/job.js';
import type { RoadmapData } from '../lib/ai/roadmap.js';

export const cyclesRouter = Router();

const ChangeRequestBody = z.object({
  request: z.string().min(8, 'Permintaan perubahan minimal 8 karakter').max(4000),
});

const CycleGenerateBody = z.object({
  confirm: z.boolean(),
  split: z.enum(['single', 'a', 'b']).default('single'),
  title: z.string().optional(),
  partRequest: z.string().optional(),
});

cyclesRouter.get('/api/projects/:id/cycles', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
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

  res.json({
    cycles: mapped,
    openCycleId: openCycle?.id ?? null,
    initialTaskCounts: {
      total: initialTasks.length,
      done: initialTasks.filter((t) => t.status === 'DONE').length,
    },
  });
});

cyclesRouter.get('/api/projects/:id/cycles/:cycleId', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
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

// Ajukan permintaan perubahan: reset survey agar proses discovery diulang seperti proyek baru
cyclesRouter.post('/api/projects/:id/change-request', requireUser, async (req: AuthedRequest, res) => {
  const parsed = ChangeRequestBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Permintaan tidak valid.' });
  }

  const { config } = await getUserPlan(req.userId);
  if (parsed.data.request.length > config.charLimit) {
    return res.status(400).json({
      error: `Permintaan terlalu panjang (${parsed.data.request.length} karakter). Maksimal ${config.charLimit} karakter untuk paket ${config.name}.`,
    });
  }

  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: { tasks: { select: { status: true } } },
    });
    if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

    // Guard: seluruh task wajib selesai sebelum perubahan dimulai
    const pendingCount = project.tasks.filter((t) => t.status !== 'DONE').length;
    if (pendingCount > 0) {
      return res.status(409).json({
        error: `Masih ada ${pendingCount} task yang belum selesai. Selesaikan semua task sebelum memulai perubahan.`,
      });
    }

    // Guard: tidak boleh ada siklus yang masih aktif
    const activeCycle = await prisma.projectCycle.findFirst({
      where: { projectId: project.id, status: 'OPEN' },
    });
    if (activeCycle) {
      return res.status(409).json({
        error: `Masih ada siklus aktif "${activeCycle.title}" yang harus diselesaikan terlebih dahulu.`,
      });
    }

    // Reset data survey; jawaban ikut terhapus lewat cascade DiscoveryAnswer
    await prisma.discoveryQuestion.deleteMany({ where: { projectId: project.id } });

    // Lampirkan permintaan perubahan ke ide agar survey/summary/PRD berikutnya melihatnya
    await prisma.project.update({
      where: { id: project.id },
      data: {
        idea: `${project.idea}\n\n---\nPERUBAHAN DIMINTA:\n${parsed.data.request}`,
        wizardStep: 'survey',
      },
    });

    res.json({ ok: true, wizardStep: 'survey' });
  } catch (err) {
    console.error(`[change-request] Gagal memproses permintaan perubahan project ${req.params.id}:`, err);
    return res.status(502).json({
      error: 'Gagal memproses permintaan perubahan.',
      detail: (err as Error).message,
    });
  }
});

cyclesRouter.post('/api/projects/:id/cycles/:cycleId/generate', requireUser, async (req: AuthedRequest, res) => {
  const parsed = CycleGenerateBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.confirm) {
    return res.status(400).json({ error: 'Konfirmasi siklus diperlukan.' });
  }

  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: {
      prd: true,
      stacks: true,
      roadmap: { include: { features: true } },
      tasks: {
        select: { id: true, status: true },
      },
    },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const cycle = await prisma.projectCycle.findFirst({
    where: { id: req.params.cycleId, projectId: project.id, status: 'DRAFT' },
  });
  if (!cycle) return res.status(404).json({ error: 'Draft siklus tidak ditemukan.' });

  const pendingTasks = project.tasks.filter((t) => t.status !== 'DONE');
  if (pendingTasks.length > 0) {
    return res.status(409).json({
      error: `Masih ada ${pendingTasks.length} task yang belum selesai. Selesaikan semua task sebelum memulai siklus baru.`,
    });
  }

  const activeCycle = await prisma.projectCycle.findFirst({
    where: { projectId: project.id, status: 'OPEN', id: { not: cycle.id } },
  });
  if (activeCycle) {
    return res.status(409).json({ error: 'Masih ada siklus lain yang berstatus OPEN.' });
  }

  if (await hasActiveJob(project.id, 'cycle_generate')) {
    return res.status(409).json({ error: 'Perancangan task siklus sedang berlangsung. Mohon tunggu sejenak.' });
  }

  // Snapshot data yang dibutuhkan job latar belakang
  const projectId = project.id;
  const userId = req.userId;
  const cycleId = cycle.id;
  const splitMode = parsed.data.split;
  const partRequest = parsed.data.partRequest;
  const overrideTitle = parsed.data.title;

  try {
    await startAiJob(projectId, 'cycle_generate', async () => {
      // Ambil ulang data segar di dalam job
      const freshProject = await prisma.project.findFirst({
        where: { id: projectId, userId },
        include: {
          prd: true,
          stacks: true,
          roadmap: { include: { features: true } },
        },
      });
      if (!freshProject) throw new Error('Project tidak ditemukan saat proses latar belakang.');
      const freshCycle = await prisma.projectCycle.findFirst({
        where: { id: cycleId, projectId, status: 'DRAFT' },
      });
      if (!freshCycle) throw new Error('Draft siklus tidak ditemukan.');

      let effectiveRequest = freshCycle.request;
      let impact = freshCycle.impact as any;

      if (splitMode !== 'single' && partRequest) {
        effectiveRequest = partRequest;
        impact = await analyzeChangeRequest({
          projectId,
          request: effectiveRequest,
          prd: freshProject.prd?.content ? readPrdContent(freshProject.prd.content) : null,
          repoSummary: freshProject.repoSummary,
        });
      }

      let prdDeltaPayload: any = freshCycle.prdDelta ?? {};
      const hasExistingPrdDelta = prdDeltaPayload && typeof prdDeltaPayload === 'object' && Object.keys(prdDeltaPayload).length > 0;

      if (!hasExistingPrdDelta && impact.needsPrdChange && impact.newRequirements && impact.newRequirements.length > 0 && freshProject.prd) {
        prdDeltaPayload = {
          summary: impact.prdChangeSummary ?? impact.summary,
          newRequirements: impact.newRequirements,
        };
        const updatedContent = mergePrdDelta(freshProject.prd.content, prdDeltaPayload);
        await prisma.prd.update({
          where: { projectId },
          data: {
            content: updatedContent as any,
            version: { increment: 1 },
          },
        });
      }

      const featureIdMap = new Map<string, string>();
      const roadmapData: RoadmapData = {
        phases: freshProject.roadmap.map((p) => ({
          order: p.order,
          title: p.title,
          description: p.description ?? undefined,
          layer: p.layer as any,
          features: p.features.map((f) => {
            featureIdMap.set(f.id, f.id);
            return {
              id: f.id,
              title: f.title,
              description: f.description ?? undefined,
              dependsOn: [],
            };
          }),
        })),
      };

      if (roadmapData.phases.length === 0 || roadmapData.phases.every((p) => p.features.length === 0)) {
        const defaultPhase = {
          order: 1,
          title: 'Siklus Perubahan',
          layer: 'BACKEND' as const,
          features: [{ id: 'CYCLE-FEAT', title: freshCycle.title, dependsOn: [] }],
        };
        roadmapData.phases = [defaultPhase];
        featureIdMap.set('CYCLE-FEAT', 'CYCLE-FEAT');
      }

      const lastTask = await prisma.task.findFirst({
        where: { projectId },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      const startOrder = (lastTask?.order ?? 0) + 1;

      const stackContract = freshProject.stacks.length > 0 ? resolveStackContract(freshProject.stacks) : undefined;
      const prdDoc = freshProject.prd?.content ? readPrdContent(freshProject.prd.content) : undefined;

      const generated = await generateTasksFromRoadmap({
        roadmap: roadmapData,
        projectName: freshProject.name,
        prd: prdDoc,
        uiSpec: freshProject.uiSpec,
        projectId,
        stack: stackContract,
        cycle: {
          request: effectiveRequest,
          impact,
          repoSummary: freshProject.repoSummary,
          startOrder,
        },
      });

      const { tasks: validTasks, warnings } = validateAndNormalizeDAG(generated);
      if (warnings.length > 0) {
        console.log(`[CYCLE-DAG-VALIDATOR] warnings:\n${warnings.join('\n')}`);
      }

      await prisma.$transaction(
        async (tx) => {
          await persistGeneratedTasks(tx, projectId, validTasks, featureIdMap, cycleId, startOrder);

          await tx.projectCycle.update({
            where: { id: cycleId },
            data: {
              title: overrideTitle ?? effectiveRequest.slice(0, 60),
              request: effectiveRequest,
              status: 'OPEN',
              impact: impact as any,
              prdDelta: prdDeltaPayload,
              type: impact.type ?? freshCycle.type,
              size: impact.size ?? freshCycle.size,
            },
          });

          await tx.project.update({
            where: { id: projectId },
            data: { wizardStep: 'board' },
          });
        },
        { timeout: 60000 }
      );

      const tasksCount = await prisma.task.count({ where: { cycleId } });
      return { ok: true, cycleId, tasksCount };
    });

    res.json({ ok: true, status: 'generating', cycleId });
  } catch (err) {
    console.error(`[cycles/generate] Gagal memulai perancangan task untuk cycle ${cycleId}:`, err);
    return res.status(502).json({
      error: 'AI gagal merancang task untuk siklus perubahan.',
      detail: (err as Error).message,
    });
  }
});

