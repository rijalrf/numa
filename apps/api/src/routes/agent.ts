// Agent endpoints (CLI) — dilindungi PAT, terisolasi per project.
import { Router, type Request } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { requireAgent, type AgentRequest } from '../middleware/require-agent.js';
import { resolveStackContract } from '../lib/ai/stack-contract.js';
import { resolveArchitectureContract, renderArchitectureContract } from '../lib/ai/architecture-contract.js';
import { requireAgentSimple } from '../middleware/require-agent-simple.js';
import { readPrdContent } from '../lib/ai/prd.js';

export const agentRouter = Router();

// Hash token utility (mirrors requireAgent.middleware)
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ============================================================
// Agent endpoints (CLI) — dilindungi PAT, terisolasi per project
// ============================================================

agentRouter.get('/api/agent/scopes', requireAgentSimple, async (req: Request, res) => {
  // Get all projects accessible by this token
  const authHeader = req.header('authorization') ?? '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const token = match[1].trim();
  const tokenHash = hashToken(token);

  const record = await prisma.agentToken.findUnique({
    where: { tokenHash },
    include: {
      agentTokenScopes: {
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!record || record.isRevoked) {
    return res.status(401).json({ error: 'Token tidak valid atau sudah dicabut.' });
  }

  // Ambil semua project milik pemilik token
  const ownedProjects = await prisma.project.findMany({
    where: { userId: record.userId },
    select: { id: true, name: true },
    orderBy: { updatedAt: 'desc' },
  });

  const explicitProjects = record.agentTokenScopes?.map((s) => ({
    id: s.projectId,
    name: s.project.name,
  })) || [];

  const map = new Map<string, { id: string; name: string }>();
  for (const p of ownedProjects) map.set(p.id, p);
  for (const p of explicitProjects) map.set(p.id, p);

  res.json({ scopes: Array.from(map.values()) });
});

agentRouter.get('/api/agent/whoami', requireAgent, (req: AgentRequest, res) => {
  res.json({ project: { id: req.agent.projectId, name: req.agent.projectName } });
});

agentRouter.get('/api/agent/tasks/next', requireAgent, async (req: AgentRequest, res) => {
  const projectId = req.agent.projectId;

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

agentRouter.post('/api/agent/tasks/:id/complete', requireAgent, async (req: AgentRequest, res) => {
  const task = await prisma.task.findFirst({
    where: { id: req.params.id, projectId: req.agent.projectId },
  });
  if (!task) return res.status(404).json({ error: 'Task tidak ditemukan di project ini.' });

  // Default: langsung DONE agar loop otonom tidak macet. Kalau reviewFlow aktif -> REVIEW.
  const project = await prisma.project.findUnique({ where: { id: req.agent.projectId } });
  const nextStatus = project?.reviewFlow ? 'REVIEW' : 'DONE';

  const body = req.body ?? {};
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

  const updated = await prisma.task.update({
    where: { id: task.id },
    data: updateData,
  });

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
  if (remainingInLayer === 0) {
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
          message: 'Semua fitur selesai dibuat! User perlu verifikasi aplikasi jalan di http://localhost:9999 sebelum finalisasi.',
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

  const body = req.body ?? {};
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

  // Context Budgeting: Ekstrak spesifikasi UI yang relevan saja untuk layer FRONTEND (Bab 14, 26, 27)
  if (task.layer === 'FRONTEND' && task.project.uiSpec) {
    const ui = task.project.uiSpec as {
      pages?: Array<{
        name: string;
        path?: string;
        purpose?: string;
        layout?: { mobile: string; desktop: string };
        components?: string[];
        states?: string[];
      }>;
      designTokens?: { spacing?: string; borderRadius?: string; colorPalette?: string[]; typography?: string };
    };

    const taskText = `${task.title} ${task.description ?? ''} ${(ctx.files_to_create ?? []).join(' ')} ${(ctx.files_to_modify ?? []).join(' ')}`.toLowerCase();
    const matchingPages = (ui.pages ?? []).filter((p) =>
      taskText.includes(p.name.toLowerCase()) || (p.path && taskText.includes(p.path.toLowerCase()))
    );

    const pagesToRender = matchingPages.length > 0 ? matchingPages : (ui.pages ?? []).slice(0, 2);
    if (pagesToRender.length > 0) {
      mdParts.push(`#### Spesifikasi Halaman UI Relevan`);
      for (const p of pagesToRender) {
        mdParts.push(`- **Halaman**: ${p.name}${p.path ? ` (\`${p.path}\`)` : ''} — ${p.purpose ?? ''}`);
        if (p.layout) mdParts.push(`  - Layout: Mobile: ${p.layout.mobile} | Desktop: ${p.layout.desktop}`);
        if (p.components?.length) mdParts.push(`  - Komponen: ${p.components.join(', ')}`);
        if (p.states?.length) mdParts.push(`  - State Wajib: ${p.states.join(', ')}`);
      }
      if (ui.designTokens) {
        mdParts.push(`- **Design Tokens**: Spacing: ${ui.designTokens.spacing || '4px'}, Radius: ${ui.designTokens.borderRadius || 'rounded-md'}`);
      }
      mdParts.push(``);
    }
  }

  // Failure Context jika task pernah gagal sebelumnya (Bab 38)
  const lastFailure = (ctx as any).lastFailure;
  if (lastFailure) {
    mdParts.push(
      `#### ⚠️ Catatan Kegagalan Sebelumnya`,
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
      files_to_create: [], // Tidak lagi memaksa disk check fisik di CLI guard
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
  const summary = req.body?.summary;
  if (!summary) {
    return res.status(400).json({ error: 'Ringkasan repo (summary) diperlukan.' });
  }
  await prisma.project.update({
    where: { id: req.agent.projectId },
    data: { repoSummary: summary },
  });
  res.json({ ok: true, savedAt: new Date().toISOString() });
});
