// Kanban tasks: generasi AI (fire-and-forget), list, update status.
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { getUserPlan, checkQuota, incrementQuota } from '../lib/billing.js';
import { isStageLocked } from '../lib/stage.js';
import { PrdSchema, readPrdContent } from '../lib/ai/prd.js';
import { generateRoadmapFromPRD } from '../lib/ai/roadmap.js';
import { generateTasksFromRoadmap } from '../lib/ai/tasks.js';
import { validateAndNormalizeDAG } from '../lib/ai/dag-validator.js';
import { validateApiCoverage } from '../lib/ai/api-coverage-validator.js';
import { validateCleanup } from '../lib/ai/cleanup-validator.js';
import { resolveStackContract } from '../lib/ai/stack-contract.js';
import { persistGeneratedTasks } from '../lib/task-persist.js';
import { startAiJob, getLatestJob, hasActiveJob, type AiJobType } from '../lib/ai/job.js';

export const tasksRouter = Router();

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
      where: { id: projectId, userId },
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

    // Respons langsung ke client (fire-and-forget)
    await startAiJob(projectId, 'tasks_generate', async () => {
        let currentProject = await prisma.project.findFirst({
          where: { id: projectId, userId },
          include: {
            prd: true,
            stacks: true,
            roadmap: { include: { features: { include: { dependencies: true } } } },
          },
        });
        if (!currentProject) throw new Error('Project tidak ditemukan saat proses latar belakang.');

        // Auto-generate roadmap jika belum ada tapi PRD ada
        if (currentProject.roadmap.length === 0) {
          if (!currentProject.prd) throw new Error('PRD belum ada. Generate PRD dulu.');
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
            where: { id: projectId, userId },
            include: {
              prd: true,
              stacks: true,
              roadmap: { include: { features: { include: { dependencies: true } } } },
            },
          });
          if (refetched) currentProject = refetched;
        }

        if (currentProject.roadmap.length === 0) throw new Error('Roadmap belum ada.');

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

        const prdDoc = readPrdContent(currentProject.prd?.content);
        const stackContract = resolveStackContract(currentProject.stacks || []);

        let generated = await generateTasksFromRoadmap({
          roadmap: { phases: phasesForAI },
          projectName: currentProject.name,
          prd: prdDoc as any,
          projectId: currentProject.id,
          stack: stackContract,
        });

        // Coverage check ringan: tiap requirement FR di index muncul di requirement_ids minimal satu task
        if (prdDoc.requirementIndex.length > 0) {
          const allTaskReqIds = new Set(generated.flatMap((t) => t.requirement_ids || []));
          const uncoveredReqs = prdDoc.requirementIndex.filter((r) => r.id.startsWith('FR-') && !allTaskReqIds.has(r.id));
          if (uncoveredReqs.length > 0) {
            console.warn(`[REQ-COVERAGE] Catatan: ${uncoveredReqs.length} FR belum terpetakan ke task: ${uncoveredReqs.map((r) => r.id).join(', ')}`);
          }
        }

        // Validasi coverage API ke UI: catat jika ada endpoint mutasi tanpa pemanggil di frontend
        const coverage = validateApiCoverage(generated, (prdDoc as any)?.apiEndpoints ?? []);
        if (coverage.uncovered.length > 0) {
          console.warn(`[API-COVERAGE] Catatan: Ditemukan ${coverage.uncovered.length} endpoint mutasi tanpa UI pemanggil.`);
        }

        // Validasi DAG Deterministik (Bab 35 & 36): deteksi siklus, buang self-dep, dan urutkan topologis
        const { tasks: validTasks, warnings, healed } = validateAndNormalizeDAG(generated);
        if (warnings.length > 0) {
          console.log(`[DAG-VALIDATOR] Memproses ${validTasks.length} tasks (healed=${healed}):\n${warnings.map((w) => '  - ' + w).join('\n')}`);
        }

        // Cleanup & Heuristic Validation (Tahap 6: Cleanup/Refactoring)
        const cleanupResult = validateCleanup(validTasks);
        if (cleanupResult.warnings.length > 0) {
          console.log(`[CLEANUP-VALIDATOR] Peringatan kebersihan task (${cleanupResult.warnings.length}):\n${cleanupResult.warnings.map((w) => '  - ' + w).join('\n')}`);
        }

        // Hapus tasks lama dan tulis ulang secara atomik dalam satu transaksi
        await prisma.$transaction(
          async (tx) => {
            await tx.task.deleteMany({ where: { projectId: currentProject!.id } });
            await persistGeneratedTasks(tx, currentProject!.id, validTasks, featureIdMap, null, 1);
            await tx.project.update({
              where: { id: currentProject!.id },
              data: {
                wizardStep: 'board',
              },
            });
          },
          { timeout: 60000 }
        );

        if (isFirstGeneration) {
          await incrementQuota(userId);
        }
    });

    res.json({
      ok: true,
      status: 'generating',
      message: 'Perancangan task sedang diproses di latar belakang.',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Gagal memulai perancangan task.', detail: err?.message });
  }
});

tasksRouter.get('/api/projects/:id/tasks', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
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
    generationStatus: genJob?.status === 'running' ? 'generating' : (genJob?.status ?? 'idle'),
    generationError: genJob?.error ?? null,
  });
});

// Status job AI async (polling generic untuk semua job).
tasksRouter.get('/api/projects/:id/ai-jobs', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
    select: { id: true },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const type = String(req.query.type ?? '');
  const validTypes: AiJobType[] = [
    'tasks_generate',
    'cycle_generate',
    'roadmap_generate',
    'survey_round',
    'survey_summary',
    'tree_generate',
    'techstack_recommend',
    'chat_finalize',
  ];
  if (!validTypes.includes(type as AiJobType)) {
    return res.status(400).json({ error: 'Tipe job AI tidak valid.' });
  }

  const job = await getLatestJob(project.id, type as AiJobType);
  res.json({
    status: job?.status ?? 'idle',
    error: job?.error ?? null,
    result: job?.result ?? null,
  });
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
  if (!task || task.project.userId !== req.userId) return res.status(404).json({ error: 'Task tidak ditemukan.' });
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

  res.json({ task: updated });
});
