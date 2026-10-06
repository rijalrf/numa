// Agent endpoints (CLI) — dilindungi PAT, terisolasi per project.
import type { Prisma } from '@prisma/client';
import { CompleteTaskBodySchema, FailTaskBodySchema, BlockTaskBodySchema, RepoSummaryBodySchema } from '../lib/request-schemas.js';
import { Router, type Request } from 'express';
import { recordAudit } from '../lib/audit.js';
import { prisma } from '../lib/prisma.js';
import { requireAgent, type AgentRequest } from '../middleware/require-agent.js';
import { resolveStackContract } from '../lib/ai/stack-contract.js';
import { resolveArchitectureContract, renderArchitectureContract } from '../lib/ai/architecture-contract.js';
import { listAccessibleProjects } from '../lib/agent-auth.js';
import { requireAgentSimple } from '../middleware/require-agent-simple.js';
import { readPrdContent } from '../lib/ai/prd.js';
import { findBlockingCheckpoint, checkpointBlockedBody } from '../lib/checkpoint-gate.js';
import { PREVIEW_PORT } from '../lib/config.js';

export const agentRouter = Router();

// ============================================================
// Agent endpoints (CLI) — dilindungi PAT, terisolasi per project
// ============================================================

agentRouter.get('/api/agent/scopes', requireAgentSimple, async (req: Request, res) => {
  // Hanya project yang boleh diakses token ini (scope eksplisit atau semua project milik pemilik untuk token universal).
  const scopes = await listAccessibleProjects(req.agentToken!);
  res.json({ scopes });
});

agentRouter.get('/api/agent/whoami', requireAgent, (req: AgentRequest, res) => {
  res.json({ project: { id: req.agent.projectId, name: req.agent.projectName } });
});

agentRouter.get('/api/agent/tasks/next', requireAgent, async (req: AgentRequest, res) => {
  const projectId = req.agent.projectId;

  const blocking = await findBlockingCheckpoint(projectId);
  if (blocking) return res.status(409).json(checkpointBlockedBody(blocking));

  // Prioritas 1: Lanjutkan task yang sedang IN_PROGRESS bila ada
  const inProgress = await prisma.task.findFirst({
    where: { projectId, status: 'IN_PROGRESS' },
    orderBy: { order: 'asc' },
  });
  if (inProgress) {
    return res.json({
      hasTask: true,
      task: {
        id: inProgress.id,
        title: inProgress.title,
        description: inProgress.description,
        layer: inProgress.layer,
        order: inProgress.order,
        status: inProgress.status,
      },
    });
  }

  // Prioritas 2: Cari task TODO yang semua dependensinya (dependsOn) sudah DONE
  const allTodo = await prisma.task.findMany({
    where: { projectId, status: 'TODO' },
    include: {
      dependsOn: {
        include: {
          dependsOn: { select: { id: true, title: true, status: true, order: true } },
        },
      },
    },
    orderBy: { order: 'asc' },
  });

  if (allTodo.length === 0) {
    return res.json({ hasTask: false, message: 'Tidak ada task TODO tersisa.' });
  }

  // Cari task yang tidak terblokir (semua dependensi prasyarat sudah status DONE)
  const readyTask = allTodo.find((t) =>
    t.dependsOn.every((d) => d.dependsOn.status === 'DONE')
  );

  if (!readyTask) {
    return res.json({
      hasTask: false,
      message: 'Semua task TODO tersisa masih menunggu dependensi prasyarat selesai.',
    });
  }

  res.json({
    hasTask: true,
    task: {
      id: readyTask.id,
      title: readyTask.title,
      description: readyTask.description,
      layer: readyTask.layer,
      order: readyTask.order,
      status: readyTask.status,
    },
  });
});

agentRouter.post('/api/agent/tasks/:id/start', requireAgent, async (req: AgentRequest, res) => {
  const blocking = await findBlockingCheckpoint(req.agent.projectId);
  if (blocking) return res.status(409).json(checkpointBlockedBody(blocking));

  const task = await prisma.task.findFirst({
    where: { id: req.params.id, projectId: req.agent.projectId },
    include: {
      dependsOn: {
        include: {
          dependsOn: { select: { id: true, title: true, status: true, order: true } },
        },
      },
    },
  });
  if (!task) return res.status(404).json({ error: 'Task tidak ditemukan di project ini.' });
  if (task.status === 'DONE') return res.status(400).json({ error: 'Task sudah selesai.' });

  // Validasi dependensi: cegah start bila dependensi belum DONE
  const pendingDeps = task.dependsOn.filter((d) => d.dependsOn.status !== 'DONE');
  if (pendingDeps.length > 0) {
    const depList = pendingDeps.map((d) => `#${d.dependsOn.order} ${d.dependsOn.title} (${d.dependsOn.status})`).join(', ');
    return res.status(400).json({
      error: `Task tidak dapat dimulai karena dependensi belum selesai: ${depList}`,
    });
  }

  const updated = await prisma.task.update({
    where: { id: task.id },
    data: { status: 'IN_PROGRESS', startedAt: new Date() },
  });
  res.json({ ok: true, taskId: updated.id, status: updated.status });
});

/** Batasi bentuk dan ukuran laporan guard dari CLI sebelum disimpan. */
function sanitizeGuardReport(raw: unknown) {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const strList = (v: unknown, max: number) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max).map((x) => x.slice(0, 300)) : [];
  return {
    baseline: typeof r.baseline === 'string' ? r.baseline.slice(0, 64) : null,
    changedFiles: strList(r.changedFiles, 200),
    outOfScopeFiles: strList(r.outOfScopeFiles, 100),
    commands: Array.isArray(r.commands)
      ? r.commands.slice(0, 20).map((c) => {
          const o = (c ?? {}) as Record<string, unknown>;
          return {
            command: String(o.command ?? '').slice(0, 300),
            ok: o.ok === true,
            skipped: o.skipped === true,
          };
        })
      : [],
    cliVersion: typeof r.cliVersion === 'string' ? r.cliVersion.slice(0, 20) : null,
  };
}

agentRouter.post('/api/agent/tasks/:id/complete', requireAgent, async (req: AgentRequest, res) => {
  const task = await prisma.task.findFirst({
    where: { id: req.params.id, projectId: req.agent.projectId },
  });
  if (!task) return res.status(404).json({ error: 'Task tidak ditemukan di project ini.' });

  // Default: langsung DONE agar loop otonom tidak macet. Kalau reviewFlow aktif -> REVIEW.
  const project = await prisma.project.findUnique({ where: { id: req.agent.projectId } });
  const nextStatus = project?.reviewFlow ? 'REVIEW' : 'DONE';

  const body = CompleteTaskBodySchema.parse(req.body ?? {});
  const updateData: any = {
    status: nextStatus,
    completedAt: nextStatus === 'DONE' ? new Date() : null,
  };
  if (body.outputSummary && typeof body.outputSummary === 'string') {
    updateData.outputSummary = body.outputSummary.slice(0, 4000);
  }
  if (Array.isArray(body.apiContracts) && body.apiContracts.length > 0) {
    updateData.apiContracts = body.apiContracts;
  }

  // Jejak audit penyelesaian: --force harus tercatat, laporan guard disimpan apa adanya (dibatasi ukurannya).
  const completion = {
    forced: body.forced === true,
    guardReport: sanitizeGuardReport(body.guardReport),
    tokenId: req.agent.tokenId,
    completedAt: new Date().toISOString(),
  };
  updateData.aiContext = { ...((task.aiContext ?? {}) as Record<string, unknown>), completion };
  // Selesai berhasil menghapus catatan kegagalan lama
  delete (updateData.aiContext as Record<string, unknown>).lastFailure;
  updateData.blockedReason = null;

  const updated = await prisma.task.update({
    where: { id: task.id },
    data: updateData,
  });
  if (completion.forced) {
    await recordAudit({
      action: 'task.force_complete',
      actorType: 'agent',
      actorUserId: req.agent.userId,
      projectId: req.agent.projectId,
      orgId: project?.orgId,
      targetType: 'Task',
      targetId: task.id,
      metadata: { tokenId: req.agent.tokenId, outOfScopeCount: completion.guardReport?.outOfScopeFiles.length ?? null },
      req,
    });
  }

  // Cek apakah layer sudah habis -> buat checkpoint PENDING bila perlu.
  const remainingInLayer = await prisma.task.count({
    where: { projectId: req.agent.projectId, layer: updated.layer, status: { not: 'DONE' } },
  });

  // Khusus FRONTEND layer DONE: trigger APPS_READY_FOR_USE checkpoint untuk verifikasi user
  const frontendTasksRemaining = await prisma.task.count({
    where: { projectId: req.agent.projectId, layer: 'FRONTEND', status: { not: 'DONE' } },
  });
  let appsReadyCheckpointCreated = false;

  let checkpointCreated = false;
  const existingLayerCheckpoint =
    remainingInLayer === 0
      ? await prisma.checkpoint.findFirst({
          where: { projectId: req.agent.projectId, type: 'LAYER_TRANSITION', layer: updated.layer, status: 'PENDING' },
        })
      : null;
  if (remainingInLayer === 0 && !existingLayerCheckpoint) {
    await prisma.checkpoint.create({
      data: {
        projectId: req.agent.projectId,
        type: 'LAYER_TRANSITION',
        layer: updated.layer,
        status: 'PENDING',
        message: `Layer ${updated.layer} selesai. Menunggu approval untuk lanjut ke layer berikutnya.`,
      },
    });
    checkpointCreated = true;
  }

  // Jika semua FRONTEND task selesai dan belum ada checkpoint APPS_READY_FOR_USE
  if (updated.layer === 'FRONTEND' && frontendTasksRemaining === 0 && !appsReadyCheckpointCreated) {
    const existingAppsReady = await prisma.checkpoint.findFirst({
      where: {
        projectId: req.agent.projectId,
        type: 'APPS_READY_FOR_USE',
      },
    });

    if (!existingAppsReady) {
      await prisma.checkpoint.create({
        data: {
          projectId: req.agent.projectId,
          type: 'APPS_READY_FOR_USE',
          layer: 'INTEGRATION',
          status: 'PENDING',
          message: `Semua fitur selesai dibuat! User perlu verifikasi aplikasi jalan di http://localhost:${PREVIEW_PORT} sebelum finalisasi.`,
        },
      });
      appsReadyCheckpointCreated = true;
      checkpointCreated = true;
    }
  }

  // Jika task milik siklus (ProjectCycle) dan status DONE, cek apakah semua task siklus sudah selesai
  if (task.cycleId && updated.status === 'DONE') {
    const remainingInCycle = await prisma.task.count({
      where: {
        cycleId: task.cycleId,
        status: { not: 'DONE' },
      },
    });
    if (remainingInCycle === 0) {
      await prisma.projectCycle.update({
        where: { id: task.cycleId },
        data: { status: 'DONE' },
      });
    }
  }

  res.json({
    ok: true,
    taskId: updated.id,
    status: updated.status,
    layer: updated.layer,
    checkpointPending: checkpointCreated,
  });
});

// Catat kegagalan task dengan Structured Failure Context (Bab 38)
agentRouter.post('/api/agent/tasks/:id/fail', requireAgent, async (req: AgentRequest, res) => {
  const task = await prisma.task.findFirst({
    where: { id: req.params.id, projectId: req.agent.projectId },
  });
  if (!task) return res.status(404).json({ error: 'Task tidak ditemukan di project ini.' });

  const body = FailTaskBodySchema.parse(req.body ?? {});
  const failureType = body.failure_type ?? 'COMMAND_FAILURE';
  const errorMsg = String(body.error ?? 'Unknown error').slice(0, 1000);
  const nextAction = body.next_action ?? 'Periksa error dan ulangi eksekusi task.';
  const affectedFiles = Array.isArray(body.affected_files) ? body.affected_files : [];

  const existingCtx = (task.aiContext ?? {}) as Record<string, any>;
  const updatedCtx = {
    ...existingCtx,
    lastFailure: {
      failure_type: failureType,
      command: body.command,
      error: errorMsg,
      affected_files: affectedFiles,
      next_action: nextAction,
      failedAt: new Date().toISOString(),
    },
  };

  const updated = await prisma.task.update({
    where: { id: task.id },
    data: {
      status: 'BLOCKED',
      blockedReason: `[${failureType}] ${errorMsg}`.slice(0, 500),
      aiContext: updatedCtx,
    },
  });

  res.json({
    ok: true,
    taskId: updated.id,
    status: updated.status,
    blockedReason: updated.blockedReason,
  });
});

// Reset task BLOCKED / IN_PROGRESS ke TODO agar bisa diulang. Task DONE tidak boleh diulang dari agent.
agentRouter.post('/api/agent/tasks/:id/retry', requireAgent, async (req: AgentRequest, res) => {
  const task = await prisma.task.findFirst({
    where: { id: req.params.id, projectId: req.agent.projectId },
  });
  if (!task) return res.status(404).json({ error: 'Task tidak ditemukan di project ini.' });
  if (task.status === 'DONE' || task.status === 'REVIEW') {
    return res.status(400).json({ error: `Task berstatus ${task.status} dan tidak dapat diulang dari CLI.` });
  }
  const updated = await prisma.task.update({
    where: { id: task.id },
    data: { status: 'TODO', blockedReason: null, startedAt: null },
  });
  await recordAudit({
    action: 'task.retry',
    actorType: 'agent',
    actorUserId: req.agent.userId,
    projectId: req.agent.projectId,
    targetType: 'Task',
    targetId: task.id,
    metadata: { tokenId: req.agent.tokenId, from: task.status },
    req,
  });
  res.json({ ok: true, taskId: updated.id, status: updated.status });
});

// Tandai task BLOCKED dengan alasan eksplisit dari agent (mis. spesifikasi ambigu).
agentRouter.post('/api/agent/tasks/:id/block', requireAgent, async (req: AgentRequest, res) => {
  const { reason } = BlockTaskBodySchema.parse(req.body ?? {});

  const task = await prisma.task.findFirst({
    where: { id: req.params.id, projectId: req.agent.projectId },
  });
  if (!task) return res.status(404).json({ error: 'Task tidak ditemukan di project ini.' });
  if (task.status === 'DONE') return res.status(400).json({ error: 'Task sudah selesai.' });

  const updated = await prisma.task.update({
    where: { id: task.id },
    data: { status: 'BLOCKED', blockedReason: `[AGENT_BLOCKED] ${reason}`.slice(0, 500) },
  });
  await recordAudit({
    action: 'task.block',
    actorType: 'agent',
    actorUserId: req.agent.userId,
    projectId: req.agent.projectId,
    targetType: 'Task',
    targetId: task.id,
    metadata: { tokenId: req.agent.tokenId, reason: reason.slice(0, 200) },
    req,
  });
  res.json({ ok: true, taskId: updated.id, status: updated.status, blockedReason: updated.blockedReason });
});

// Daftar checkpoint yang menunggu approval. Approval sendiri hanya bisa dilakukan user lewat web.
agentRouter.get('/api/agent/checkpoints', requireAgent, async (req: AgentRequest, res) => {
  const checkpoints = await prisma.checkpoint.findMany({
    where: { projectId: req.agent.projectId, status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, type: true, layer: true, message: true, createdAt: true },
  });
  const blocking = await findBlockingCheckpoint(req.agent.projectId);
  res.json({ checkpoints, blockingId: blocking?.id ?? null });
});

agentRouter.get('/api/agent/tasks/:id/context', requireAgent, async (req: AgentRequest, res) => {
  const task = await prisma.task.findFirst({
    where: { id: req.params.id, projectId: req.agent.projectId },
    include: {
      project: { include: { prd: true } },
      dependsOn: {
        include: {
          dependsOn: { select: { id: true, title: true, status: true, order: true } },
        },
      },
    },
  });
  if (!task) return res.status(404).json({ error: 'Task tidak ditemukan di project ini.' });

  const ctx = (task.aiContext ?? {}) as {
    taskId?: string;
    requirement_ids?: string[];
    depends_on?: string[];
    files_to_create?: string[];
    files_to_modify?: string[];
    files_readonly?: string[];
    forbidden?: string[];
    implementation_steps?: string[];
    validation_commands?: string[];
    advisory_commands?: string[];
    definition_of_done?: string[];
    out_of_scope?: string[];
  };

  const prdDoc = readPrdContent(task.project.prd?.content);

  // Query completed tasks di project yang sama untuk context enrichment
  const completedTasks = await prisma.task.findMany({
    where: { projectId: req.agent.projectId, status: 'DONE' },
    select: {
      id: true,
      title: true,
      layer: true,
      order: true,
      apiContracts: true,
      outputSummary: true,
      aiContext: true,
    },
    orderBy: { order: 'asc' },
  });

  // Filter requirement yang bersangkutan untuk hemat token dan cegah distorsi context
  const reqIds = new Set(ctx.requirement_ids ?? []);
  const relevantReqs = prdDoc.requirementIndex.filter((r) => reqIds.has(r.id));

  const mdParts: string[] = [
    `### [TASK ${task.order}] ${task.title}`,
    ``,
    `**Layer**: ${task.layer} | **Project**: ${task.project.name} | **Status**: ${task.status}`,
  ];

  if (ctx.requirement_ids && ctx.requirement_ids.length > 0) {
    mdParts.push(`**Requirements PRD**: ${ctx.requirement_ids.join(', ')}`);
  }

  if (task.dependsOn && task.dependsOn.length > 0) {
    const depsText = task.dependsOn
      .map((d) => `[#${d.dependsOn.order} ${d.dependsOn.title} (${d.dependsOn.status})]`)
      .join(', ');
    mdParts.push(`**Prasyarat (Depends On)**: ${depsText}`);
  } else if (ctx.depends_on && ctx.depends_on.length > 0) {
    mdParts.push(`**Prasyarat (Depends On)**: ${ctx.depends_on.join(', ')}`);
  }

  // Ringkasan output task prasyarat jika ada
  const prereqIds = new Set(task.dependsOn?.map((d) => d.dependsOnId) ?? []);
  const prereqWithSummary = completedTasks.filter((t) => prereqIds.has(t.id) && t.outputSummary);
  if (prereqWithSummary.length > 0) {
    mdParts.push(``, `#### Ringkasan Output Task Prasyarat`);
    for (const p of prereqWithSummary) {
      mdParts.push(`- **[#${p.order}] ${p.title}** (${p.layer}): ${p.outputSummary}`);
    }
  }

  // Struktur file yang sudah dibuat oleh task sebelumnya
  const allCreatedFiles = completedTasks.flatMap((t) => {
    const c = (t.aiContext ?? {}) as { files_to_create?: string[] };
    return c.files_to_create ?? [];
  });
  if (allCreatedFiles.length > 0) {
    const uniqueFiles = [...new Set(allCreatedFiles)].slice(0, 30);
    mdParts.push(``, `#### Struktur File Proyek Saat Ini (Dibuat oleh task sebelumnya)`, '```');
    for (const f of uniqueFiles) {
      mdParts.push(f);
    }
    mdParts.push('```');
  }

  // API Registry dari backend tasks yang sudah selesai atau dari spesifikasi PRD
  const completedContracts = completedTasks
    .filter((t) => t.layer === 'BACKEND' || t.layer === 'INTEGRATION')
    .flatMap((t) => {
      const contracts = t.apiContracts as Array<{
        method?: string;
        path?: string;
        description?: string;
        requestBody?: string;
        responseBody?: string;
      }>;
      return Array.isArray(contracts) ? contracts : [];
    })
    .filter((c) => c.method && c.path);

  const displayEndpoints = completedContracts.length > 0
    ? completedContracts
    : ((prdDoc as any)?.apiEndpoints ?? []);

  if (displayEndpoints.length > 0) {
    mdParts.push(``, `#### API Endpoints Tersedia (Kontrak Integrasi)`);
    for (const c of displayEndpoints.slice(0, 20)) {
      mdParts.push(`- \`${c.method} ${c.path}\`${c.description ? ` — ${c.description}` : ''}`);
      if (c.requestBody) mdParts.push(`  - Request Body: \`${c.requestBody}\``);
      if (c.responseBody) mdParts.push(`  - Response Body: \`${c.responseBody}\``);
    }
  }

  // Referensi Model Data / Schema untuk task DATABASE dan BACKEND jika tersedia
  const dataModels = (prdDoc as any)?.dataModels;
  if (Array.isArray(dataModels) && dataModels.length > 0) {
    mdParts.push(``, `#### Kontrak Model Data (Database Schema)`);
    for (const m of dataModels.slice(0, 8)) {
      const fieldsStr = m.fields?.map((f: any) => `${f.name}: ${f.type}${f.required === false ? '?' : ''}`).join(', ') ?? '';
      mdParts.push(`- **${m.name}**${m.description ? ` (${m.description})` : ''}: \`{ ${fieldsStr} }\``);
      if (m.relations?.length) {
        mdParts.push(`  - Relasi: ${m.relations.join(', ')}`);
      }
    }
  }

  mdParts.push(
    ``,
    `#### Lingkup Teknis`,
    task.description ?? '_(tidak ada deskripsi)_',
    ``
  );

  if (relevantReqs.length > 0) {
    mdParts.push(`#### Kebutuhan Terkait PRD`);
    for (const r of relevantReqs) {
      mdParts.push(`- [${r.id}] **${r.title}**`);
    }
    mdParts.push(``);
  }

  // Failure Context jika task pernah gagal sebelumnya (Bab 38)
  const lastFailure = (ctx as any).lastFailure;
  if (lastFailure) {
    mdParts.push(
      `#### Catatan Kegagalan Sebelumnya`,
      `- Jenis Kegagalan: ${lastFailure.failure_type}`,
      lastFailure.command ? `- Perintah: \`${lastFailure.command}\`` : '',
      `- Detail Error: ${lastFailure.error}`,
      lastFailure.affected_files?.length ? `- File Terdampak: ${lastFailure.affected_files.join(', ')}` : '',
      `- Rekomendasi Solusi: **${lastFailure.next_action}**`,
      ``
    );
  }

  const hasBoundedFiles = (ctx.files_to_create?.length ?? 0) > 0 ||
    (ctx.files_to_modify?.length ?? 0) > 0 ||
    (ctx.files_readonly?.length ?? 0) > 0 ||
    (ctx.forbidden?.length ?? 0) > 0;

  if (hasBoundedFiles) {
    mdParts.push(
      `#### Panduan Struktur File (Rekomendasi Arsitektural)`,
      `- Rekomendasi file dibuat: ${(ctx.files_to_create ?? []).join(', ') || '_tidak ada_'}`,
      `- Rekomendasi file dimodifikasi: ${(ctx.files_to_modify ?? []).join(', ') || '_tidak ada_'}`,
      `- File READ-ONLY (referensi): ${(ctx.files_readonly ?? []).join(', ') || '_tidak ada_'}`,
      `- File yang dibatasi (forbidden): ${(ctx.forbidden ?? []).join(', ') || '_tidak ada_'}`,
      ``
    );
  }

  if (ctx.implementation_steps && ctx.implementation_steps.length > 0) {
    mdParts.push(`#### Langkah Implementasi Konkret`);
    ctx.implementation_steps.forEach((s, idx) => {
      mdParts.push(`${idx + 1}. ${s.replace(/^\d+[\.\)]\s*/, '')}`);
    });
    mdParts.push(``);
  }

  mdParts.push(
    `#### Kriteria Penerimaan (Acceptance Criteria)`,
    ...(((task.acceptanceCriteria as string[]) ?? []).map((c) => `- [ ] ${c}`)),
    ``
  );

  if (ctx.out_of_scope && ctx.out_of_scope.length > 0) {
    mdParts.push(`#### Di Luar Lingkup (Out of Scope - JANGAN lakukan)`);
    for (const o of ctx.out_of_scope) {
      mdParts.push(`- ${o}`);
    }
    mdParts.push(``);
  }

  if (ctx.validation_commands && ctx.validation_commands.length > 0) {
    mdParts.push(
      `#### Perintah Verifikasi Mandiri (Jalankan sebelum numa done)`,
      '```bash',
      ...ctx.validation_commands,
      '```',
      ``
    );
  }

  if (ctx.definition_of_done && ctx.definition_of_done.length > 0) {
    mdParts.push(`#### Definition of Done`);
    for (const d of ctx.definition_of_done) {
      mdParts.push(`- [ ] ${d}`);
    }
    mdParts.push(``);
  }

  // Metadata guard untuk CLI (Fase 2: runtime scope guard). CLI cek git diff & validation commands secara lokal.
  res.json({
    ok: true,
    taskId: task.id,
    markdown: mdParts.join('\n'),
    apiContracts: displayEndpoints,
    guard: {
      layer: task.layer,
      forbidden: ctx.forbidden ?? [],
      files_readonly: ctx.files_readonly ?? [],
      files_to_create: ctx.files_to_create ?? [],
      files_to_modify: ctx.files_to_modify ?? [],
      validation_commands: ctx.validation_commands ?? [],
      advisory_commands: ctx.advisory_commands ?? [],
    },
  });
});

// ===============================================
// Agent endpoint: fetch PRD untuk CLI agent (juga dukung alias /brd)
// ===============================================
agentRouter.get(['/api/agent/prd', '/api/agent/brd'], requireAgent, async (req: AgentRequest, res) => {
  const prd = await prisma.prd.findUnique({
    where: { projectId: req.agent.projectId },
  });
  if (!prd) {
    return res.status(400).json({ error: 'PRD belum ada di project ini. Generate PRD dulu lewat web UI.' });
  }
  res.json({ prd, brd: prd });
});

// ===============================================
// Agent endpoint: fetch Architecture Contract untuk CLI agent
// ===============================================
agentRouter.get('/api/agent/architecture-contract', requireAgent, async (req: AgentRequest, res) => {
  const stacks = await prisma.stack.findMany({
    where: { projectId: req.agent.projectId },
  });
  const stackContract = resolveStackContract(stacks);
  const archContract = resolveArchitectureContract(stackContract);
  const markdown = renderArchitectureContract(archContract);

  res.json({
    contractKey: archContract.key,
    title: archContract.title,
    framework: archContract.framework,
    markdown,
  });
});

// ===============================================
// Agent endpoint: simpan ringkasan workspace (numa sync)
// ===============================================
agentRouter.post('/api/agent/repo-summary', requireAgent, async (req: AgentRequest, res) => {
  const { summary } = RepoSummaryBodySchema.parse(req.body ?? {});
  await prisma.project.update({
    where: { id: req.agent.projectId },
    data: { repoSummary: summary as Prisma.InputJsonValue },
  });
  res.json({ ok: true, savedAt: new Date().toISOString() });
});
