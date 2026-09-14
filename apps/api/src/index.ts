// Bootstrap Express untuk pakeai API (port 6655).
// - Mount Better Auth handler SEBELUM express.json() (raw body).
// - CORS dengan credentials agar cookie session dari web terbaca.
// - Endpoint agent diproteksi requireAgent (PAT) + isolasi per project.
import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './lib/auth.js';
import { requireUser, type AuthedRequest } from './middleware/require-user.js';
import { requireAgent, type AgentRequest } from './middleware/require-agent.js';
import { requireAgentSimple } from './middleware/require-agent-simple.js';
import { prisma } from './lib/prisma.js';
import { toolsRegistry } from './tools/registry.js';
import { z } from 'zod';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { generateBRDFromDiscovery, BrdSchema } from './lib/ai/brd.js';
import { generateRoadmapFromBRD } from './lib/ai/roadmap.js';
import { generateTasksFromRoadmap } from './lib/ai/tasks.js';
import { generateUiSpec, UiSpecSchema } from './lib/ai/ui-spec.js';
import { validateAndNormalizeDAG } from './lib/ai/dag-validator.js';
import { validateApiCoverage } from './lib/ai/api-coverage-validator.js';
import { validateCleanup } from './lib/ai/cleanup-validator.js';
import { replyChat, finalizeChatSession, recommendTechStack, generateTreeFromBrd } from './lib/ai/chat.js';
import { buildZip } from './lib/zip.js';
import { parseStackEntry, resolveStackContract } from './lib/ai/stack-contract.js';

// Hash token utility (mirrors requireAgent.middleware)
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Urutan tahapan wizard proyek (interview dihapus, langsung chat -> techstack)
const STAGE_ORDER: Record<string, number> = {
  chat: 0,
  interview: 1, // backward compat
  techstack: 1,
  brd: 2,
  tree: 3,
  board: 4,
  guide: 5, // Kompatibilitas data lama
  done: 6,
};

function isStageLocked(currentStep: string | undefined | null, targetStage: string): boolean {
  const currentRank = STAGE_ORDER[currentStep ?? 'techstack'] ?? 1;
  const targetRank = STAGE_ORDER[targetStage] ?? 0;
  return currentRank > targetRank;
}

const app = express();
app.set('trust proxy', true);
const PORT = Number(process.env.PORT ?? 6655);
// FE_URL boleh berisi beberapa origin dipisah koma (lokal + domain publik).
const defaultOrigins = [
  'http://localhost:3455',
  'https://pakeai.mrijal.my.id',
  'https://pakeai.opendv.xyz',
];
const customOrigins = (process.env.FE_URL ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const FE_ORIGINS = Array.from(new Set([...defaultOrigins, ...customOrigins]));

// 1) CORS HARUS paling awal — agar preflight dari browser (OPTIONS) ke /api/auth/* pun kena.
app.use(
  cors({
    origin: FE_ORIGINS,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);
app.use(cookieParser());

// 2) Better Auth handler (raw body) — sebelum express.json().
app.all('/api/auth/*', toNodeHandler(auth));

// 3) JSON parser untuk route di bawah.
app.use(express.json({ limit: '1mb' }));

// ============================================================
// Health & meta
// ============================================================
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'pakeai-api', port: PORT, time: new Date().toISOString() });
});

app.get('/api/tools', (_req, res) => {
  res.json({ tools: toolsRegistry });
});

// Endpoint download CLI tarball untuk instalasi di laptop/komputer lain tanpa publish ke npm
app.get('/api/download/pakeai.tgz', (_req, res) => {
  const candidateDirs = [
    process.env.CLI_DIR,
    path.resolve(__dirname, '../../../packages/cli'),
    path.resolve(process.cwd(), '../../packages/cli'),
    path.resolve(process.cwd(), 'packages/cli'),
    '/app/packages/cli',
  ].filter(Boolean) as string[];

  const cliDir = candidateDirs.find((d) => fs.existsSync(d));
  try {
    if (!cliDir) {
      return res.status(404).json({ error: 'Direktori CLI tidak ditemukan' });
    }
    const files = fs.readdirSync(cliDir).filter((f) => f.startsWith('pakeai-') && f.endsWith('.tgz'));
    if (files.length === 0) {
      return res.status(404).json({ error: 'Paket CLI belum tersedia' });
    }
    files.sort().reverse();
    const targetFile = path.join(cliDir, files[0]);
    res.download(targetFile, 'pakeai.tgz');
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengunduh file CLI' });
  }
});

// ============================================================
// Project endpoints (user)
// ============================================================

const CreateProjectBody = z.object({
  name: z.string().min(1).max(120),
  idea: z.string().min(10).max(4000),
});

app.get('/api/projects', requireUser, async (req: AuthedRequest, res) => {
  const projects = await prisma.project.findMany({
    where: { userId: req.userId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, idea: true, status: true, wizardStep: true, createdAt: true, updatedAt: true },
  });
  res.json({ projects });
});

app.post('/api/projects', requireUser, async (req: AuthedRequest, res) => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Data tidak valid', detail: parsed.error.flatten() });
  }
  const project = await prisma.project.create({
    data: { userId: req.userId, name: parsed.data.name, idea: parsed.data.idea, status: 'ACTIVE' },
  });
  res.status(201).json({ project });
});

app.get('/api/projects/:id', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { stacks: true, brd: true, roadmap: { include: { features: { include: { tasks: true } } } } },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });
  res.json({ project });
});

// ============================================================
// Agent Token (PAT) — user generates Universal token untuk akses multiple projects
// ============================================================

app.post('/api/agent-tokens', requireUser, async (req: AuthedRequest, res) => {
  const name = ((req.body?.name as string) || 'Token CLI').trim();
  const token = 'pak_' + crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const tokenRecord = await prisma.agentToken.create({
    data: {
      userId: req.userId,
      name,
      tokenHash,
    },
  });

  res.status(201).json({
    id: tokenRecord.id,
    name: tokenRecord.name,
    token, // tampilkan 1x
    createdAt: tokenRecord.createdAt,
  });
});

app.post('/api/projects/:id/agent-tokens', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const token = 'pak_' + crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const tokenRecord = await prisma.agentToken.create({
    data: {
      userId: req.userId,
      name: (req.body?.name as string) || 'Token CLI',
      tokenHash,
      agentTokenScopes: {
        create: { projectId: project.id },
      },
    },
  });

  res.status(201).json({
    id: tokenRecord.id,
    name: tokenRecord.name,
    projectId: project.id,
    token, // tampilkan 1x
    createdAt: tokenRecord.createdAt,
  });
});

app.get('/api/projects/:id/agent-tokens', requireUser, async (req: AuthedRequest, res) => {
  const tokens = await prisma.agentToken.findMany({
    where: {
      userId: req.userId,
      agentTokenScopes: {
        some: { projectId: req.params.id },
      },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      lastUsedAt: true,
      isRevoked: true,
      createdAt: true,
    },
  });

  res.json({ tokens });
});

app.delete('/api/agent-tokens/:tokenId', requireUser, async (req: AuthedRequest, res) => {
  const token = await prisma.agentToken.findFirst({
    where: { id: req.params.tokenId, userId: req.userId },
    include: { agentTokenScopes: true },
  });
  if (!token) return res.status(404).json({ error: 'Token tidak ditemukan.' });

  // Optionally delete all scopes when revoking token
  await prisma.agentTokenScope.deleteMany({
    where: { tokenId: token.id }
  });

  await prisma.agentToken.update({
    where: { id: token.id },
    data: { isRevoked: true }
  });
  res.json({ ok: true });
});

// List SEMUA token milik user lintas project — dipakai halaman profil.
app.get('/api/agent-tokens', requireUser, async (req: AuthedRequest, res) => {
  const tokens = await prisma.agentToken.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      lastUsedAt: true,
      isRevoked: true,
      createdAt: true,
      agentTokenScopes: {
        select: { project: { select: { id: true, name: true } } },
      },
    },
  });

  res.json({
    tokens: tokens.map((t) => ({
      id: t.id,
      name: t.name,
      lastUsedAt: t.lastUsedAt,
      isRevoked: t.isRevoked,
      createdAt: t.createdAt,
      projects: t.agentTokenScopes.map((s) => s.project),
    })),
  });
});

// ============================================================
// Agent endpoints (CLI) — dilindungi PAT, terisolasi per project
// ============================================================

app.get('/api/agent/scopes', requireAgentSimple, async (req: Request, res) => {
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

app.get('/api/agent/whoami', requireAgent, (req: AgentRequest, res) => {
  res.json({ project: { id: req.agent.projectId, name: req.agent.projectName } });
});

app.get('/api/agent/tasks/next', requireAgent, async (req: AgentRequest, res) => {
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

app.post('/api/agent/tasks/:id/start', requireAgent, async (req: AgentRequest, res) => {
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

app.post('/api/agent/tasks/:id/complete', requireAgent, async (req: AgentRequest, res) => {
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

  res.json({
    ok: true,
    taskId: updated.id,
    status: updated.status,
    layer: updated.layer,
    checkpointPending: checkpointCreated,
  });
});

// Catat kegagalan task dengan Structured Failure Context (Bab 38)
app.post('/api/agent/tasks/:id/fail', requireAgent, async (req: AgentRequest, res) => {
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

app.get('/api/agent/tasks/:id/context', requireAgent, async (req: AgentRequest, res) => {
  const task = await prisma.task.findFirst({
    where: { id: req.params.id, projectId: req.agent.projectId },
    include: {
      project: { include: { brd: true } },
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
    userStoryId?: string;
    requirement_ids?: string[];
    depends_on?: string[];
    files_to_create?: string[];
    files_to_modify?: string[];
    files_readonly?: string[];
    forbidden?: string[];
    implementation_steps?: string[];
    validation_commands?: string[];
    definition_of_done?: string[];
    out_of_scope?: string[];
  };

  const brd = task.project.brd?.content as {
    userStories?: Array<{ id: string; persona: string; action: string; benefit: string }>;
    functionalRequirements?: Array<{ id: string; title: string; description: string }>;
    businessRules?: Array<{ id: string; description: string }>;
    dataModels?: Array<{ name: string; description?: string; fields: Array<{ name: string; type: string; required?: boolean }>; relations?: string[] }>;
    apiEndpoints?: Array<{ method: string; path: string; description: string; requestBody?: string; responseBody?: string }>;
  } | undefined;

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
  const relevantReqs = (brd?.functionalRequirements ?? []).filter((r) => reqIds.has(r.id));
  const relevantRules = (brd?.businessRules ?? []).filter((b) => reqIds.has(b.id));

  const mdParts: string[] = [
    `### [TASK ${task.order}] ${task.title}`,
    ``,
    `**Layer**: ${task.layer} | **Project**: ${task.project.name} | **Status**: ${task.status}`,
  ];

  if (ctx.userStoryId) {
    const matchedStory = (brd?.userStories ?? []).find((s: any) => s.id === ctx.userStoryId);
    if (matchedStory) {
      mdParts.push(`**User Story**: [${matchedStory.id}] Sebagai ${matchedStory.persona}, ${matchedStory.action}, ${matchedStory.benefit}`);
    } else {
      mdParts.push(`**User Story**: ${ctx.userStoryId}`);
    }
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

  // API Registry dari backend tasks yang sudah selesai atau dari spesifikasi BRD
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
    : (brd?.apiEndpoints ?? []);

  if (displayEndpoints.length > 0) {
    mdParts.push(``, `#### API Endpoints Tersedia (Kontrak Integrasi)`);
    for (const c of displayEndpoints.slice(0, 20)) {
      mdParts.push(`- \`${c.method} ${c.path}\`${c.description ? ` — ${c.description}` : ''}`);
      if (c.requestBody) mdParts.push(`  - Request Body: \`${c.requestBody}\``);
      if (c.responseBody) mdParts.push(`  - Response Body: \`${c.responseBody}\``);
    }
  }

  // Referensi Model Data / Schema untuk task DATABASE dan BACKEND
  if (brd?.dataModels && brd.dataModels.length > 0) {
    mdParts.push(``, `#### Kontrak Model Data (Database Schema)`);
    for (const m of brd.dataModels.slice(0, 8)) {
      const fieldsStr = m.fields.map((f) => `${f.name}: ${f.type}${f.required === false ? '?' : ''}`).join(', ');
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

  if (relevantReqs.length > 0 || relevantRules.length > 0) {
    mdParts.push(`#### Kebutuhan & Aturan Terkait`);
    for (const r of relevantReqs) {
      mdParts.push(`- [${r.id}] **${r.title}**: ${r.description}`);
    }
    for (const b of relevantRules) {
      mdParts.push(`- [${b.id}] ${b.description}`);
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
      `#### Perintah Verifikasi Mandiri (Jalankan sebelum pakeai done)`,
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
    },
  });
});

// ============================================================
// Agent endpoint: fetch BRD untuk CLI agent
// ============================================================
app.get('/api/agent/brd', requireAgent, async (req: AgentRequest, res) => {
  const brd = await prisma.brd.findUnique({
    where: { projectId: req.agent.projectId },
  });
  if (!brd) {
    return res.status(400).json({ error: 'BRD belum ada di project ini. Generate BRD dulu lewat web UI.' });
  }
  res.json({ brd });
});

// ============================================================
// Helper format markdown export dokumen proyek
// ============================================================
function buildBrdMarkdown(project: { name: string }, brd: { generatedAt: Date | string; version: number; content: any }): string {
  const content = (brd.content ?? {}) as any;
  return [
    `# Business Requirements Document (${project.name})`,
    ``,
    `**Generated:** ${new Date(brd.generatedAt).toLocaleString('id-ID')}`,
    `**Version:** ${brd.version}`,
    ``,
    `---`,
    ``,
    `## Ringkasan`,
    ``,
    content.overview ?? `(tidak ada)`,
    ``,
    `---`,
    ``,
    `## Tujuan`,
    ``,
    ...(content.goals?.map((g: string) => `- ${g}`) ?? []),
    ``,
    `---`,
    ``,
    `## Fitur`,
    ``,
    ...(content.features?.map((f: { name: string; description?: string }) =>
      `### ${f.name}\n${f.description ? f.description : '(tidak ada deskripsi)'}`
    ) ?? []),
    ``,
    `---`,
    ``,
    `## User Stories (Format Gherkin)`,
    ``,
    ...(content.userStories?.map((us: any) => {
      const gherkinLines = us.gherkin?.map((g: any) =>
        `#### Scenario: ${g.title || 'Skenario'}\n- **Given** ${g.given}\n- **When** ${g.when}\n- **Then** ${g.then}`
      ).join('\n\n') ?? '';
      return `### ${us.id}: ${us.persona || 'Pengguna'}\n- **Aksi:** ${us.action || '-'}\n- **Manfaat:** ${us.benefit || '-'}\n${us.acceptanceCriteria?.length ? `\n**Acceptance Criteria:**\n` + us.acceptanceCriteria.map((ac: string) => `- ${ac}`).join('\n') : ''}\n\n${gherkinLines}`;
    }) ?? []),
    ``,
    `---`,
    ``,
    `## Tech Requirements`,
    ``,
    ...(content.techRequirements?.map((t: string) => `- ${t}`) ?? []),
    ``,
    `---`,
    ``,
    `## Non-Functional Requirements`,
    ``,
    ...(content.nonFunctional?.map((n: string) => `- ${n}`) ?? []),
    ``,
    `---`,
    ``,
    `## Out of Scope`,
    ``,
    ...(content.outOfScope?.map((o: string) => `- ${o}`) ?? []),
  ].join('\n');
}

function buildUserStoriesMarkdown(project: { name: string }, brd: { content: any } | null): string {
  const content = (brd?.content ?? {}) as any;
  const stories = content.userStories ?? [];
  const lines = [
    `# User Stories — ${project.name}`,
    ``,
    `Dokumen spesifikasi user story terperinci dengan skenario Gherkin (Given/When/Then).`,
    ``,
  ];

  if (stories.length === 0) {
    lines.push(`(Belum ada user story yang dibuat)`);
    return lines.join('\n');
  }

  for (const us of stories) {
    lines.push(`## [${us.id}] ${us.persona || 'Pengguna'}`);
    lines.push(`- **Sebagai:** ${us.persona || '-'}`);
    lines.push(`- **Saya ingin:** ${us.action || '-'}`);
    lines.push(`- **Supaya:** ${us.benefit || '-'}`);
    lines.push(``);

    if (us.acceptanceCriteria && us.acceptanceCriteria.length > 0) {
      lines.push(`### Acceptance Criteria`);
      for (const ac of us.acceptanceCriteria) {
        lines.push(`- ${ac}`);
      }
      lines.push(``);
    }

    if (us.gherkin && us.gherkin.length > 0) {
      lines.push(`### Skenario Gherkin`);
      for (const g of us.gherkin) {
        lines.push(`#### Scenario: ${g.title || 'Skenario'}`);
        lines.push(`\`\`\`gherkin`);
        lines.push(`Given ${g.given}`);
        lines.push(`When ${g.when}`);
        lines.push(`Then ${g.then}`);
        lines.push(`\`\`\``);
        lines.push(``);
      }
    }
    lines.push(`---`);
    lines.push(``);
  }

  return lines.join('\n');
}

function buildTasksMarkdown(project: { name: string }, tasks: any[]): string {
  const lines = [
    `# Daftar Atomic Tasks — ${project.name}`,
    ``,
    `Total Tasks: ${tasks.length}`,
    ``,
  ];

  if (tasks.length === 0) {
    lines.push(`(Belum ada task yang dibuat)`);
    return lines.join('\n');
  }

  for (const t of tasks) {
    const aiCtx = (t.aiContext ?? {}) as any;
    lines.push(`## [${t.order}] ${t.title} (${t.layer})`);
    lines.push(`- **ID:** \`${t.id}\``);
    if (aiCtx.userStoryId) {
      lines.push(`- **User Story:** \`${aiCtx.userStoryId}\``);
    }
    lines.push(`- **Status:** ${t.status}`);
    lines.push(`- **Deskripsi:** ${t.description || '-'}`);
    lines.push(``);

    if (aiCtx.files_to_create?.length) {
      lines.push(`### Files to Create`);
      lines.push(aiCtx.files_to_create.map((f: string) => `- \`${f}\``).join('\n'));
      lines.push(``);
    }
    if (aiCtx.files_to_modify?.length) {
      lines.push(`### Files to Modify`);
      lines.push(aiCtx.files_to_modify.map((f: string) => `- \`${f}\``).join('\n'));
      lines.push(``);
    }
    if (aiCtx.forbidden?.length) {
      lines.push(`### Forbidden Files`);
      lines.push(aiCtx.forbidden.map((f: string) => `- \`${f}\``).join('\n'));
      lines.push(``);
    }
    if (t.acceptanceCriteria && Array.isArray(t.acceptanceCriteria) && t.acceptanceCriteria.length) {
      lines.push(`### Acceptance Criteria`);
      lines.push(t.acceptanceCriteria.map((ac: string) => `- ${ac}`).join('\n'));
      lines.push(``);
    }
    if (aiCtx.validation_commands?.length) {
      lines.push(`### Validation Commands`);
      lines.push(`\`\`\`bash`);
      lines.push(aiCtx.validation_commands.join('\n'));
      lines.push(`\`\`\``);
      lines.push(``);
    }
    lines.push(`---`);
    lines.push(``);
  }

  return lines.join('\n');
}

// ============================================================
// User endpoint: download BRD sebagai .md file
// ============================================================
app.get('/api/projects/:id/brd/download', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { brd: true },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });
  if (!project.brd) {
    return res.status(400).json({ error: 'BRD belum ada. Generate BRD dulu.' });
  }

  const md = buildBrdMarkdown(project, project.brd);
  const safeName = project.name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');

  res.setHeader('Content-Type', 'text/markdown');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}_BRD.md"`);
  res.send(md);
});

// ============================================================
// User endpoint: download paket lengkap (.zip) -> BRD.md, USER-STORIES.md, TASKS.md
// ============================================================
app.get('/api/projects/:id/export.zip', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: {
      brd: true,
      tasks: {
        orderBy: { order: 'asc' },
      },
    },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const brdMd = project.brd ? buildBrdMarkdown(project, project.brd) : '# BRD Belum Dibuat\n';
  const userStoriesMd = buildUserStoriesMarkdown(project, project.brd);
  const tasksMd = buildTasksMarkdown(project, project.tasks);

  const zipBuffer = buildZip([
    { name: 'BRD.md', content: brdMd },
    { name: 'USER-STORIES.md', content: userStoriesMd },
    { name: 'TASKS.md', content: tasksMd },
  ]);

  const safeName = project.name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  const filename = `${safeName}_paket.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', String(zipBuffer.length));
  res.send(zipBuffer);
});

// ============================================================
// User endpoint: unlock tahap sebelumnya (mundur step)
// ============================================================
const WizardStepBody = z.object({
  step: z.enum(['chat', 'techstack', 'brd', 'tree', 'board']),
});

app.post('/api/projects/:id/wizard-step', requireUser, async (req: AuthedRequest, res) => {
  const parsed = WizardStepBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Step tidak valid', detail: parsed.error.flatten() });
  }

  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { chatSession: { select: { id: true } } },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const currentRank = STAGE_ORDER[project.wizardStep ?? 'techstack'] ?? 1;
  const targetRank = STAGE_ORDER[parsed.data.step] ?? 0;
  if (targetRank >= currentRank) {
    return res.status(400).json({ error: 'Hanya diizinkan berpindah mundur ke tahap sebelumnya.' });
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { wizardStep: parsed.data.step },
  });

  res.json({
    ok: true,
    wizardStep: parsed.data.step,
    chatSessionId: project.chatSession?.id ?? null,
  });
});

// ============================================================
// Master prompt untuk user copy-paste
// ============================================================
app.get('/api/projects/:id/master-prompt', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { brd: true },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const host = req.get('host');
  const protocol = req.protocol || (req.secure ? 'https' : 'http');
  const serverUrl = host
    ? `${protocol}://${host}`
    : (process.env.BETTER_AUTH_URL ?? 'https://pakeai.opendv.xyz');

  const md = `# Master Prompt — AI Agent Loop untuk "${project.name}"

Anda adalah AI Coding Agent otonom. Tugas Anda: mengeksekusi task-task project ini secara berurutan menggunakan CLI \`pakeai\`.

## Identitas Project
- Nama: ${project.name}
- Ide: ${project.idea}
${project.brd ? `- BRD: SEDIA — fetch via \`pakeai brd\` atau download manual` : `- BRD: BELUM dibuat — minta user membuatnya lewat tool BRD Generator`}

## Setup (jalankan 1x di awal)
1. Install CLI dari tarball:
   \`\`\`
   npm install -g ${serverUrl}/api/download/pakeai.tgz
   \`\`\`
2. Login dengan token di bawah ini sekaligus arahkan ke server (tersimpan di ~/.pakeai/config.json):
   \`\`\`
   pakeai login {{TOKEN}} --api-url ${serverUrl}
   \`\`\`

## Fetch BRD (lakukan sekali, sebelum loop task)
Pilih SALAH SATU:
- **Via CLI** (direkomendasikan):
  \`\`\`
  pakeai brd
  \`\`\`
- **Manual**: download BRD.md dari web UI → save ke disk → paste isi BRD sebagai konteks

## Loop Eksekusi (ulangi sampai tidak ada task tersisa)
Untuk SETIAP task, kerjakan langkah ini PERSIS:

\`\`\`
pakeai next        # ambil task berikutnya
pakeai start       # tandai IN_PROGRESS
pakeai context     # baca detail kebutuhan dan kriteria penerimaan task aktif
# >>> kerjakan task fokus pada Acceptance Criteria dan implementasi kode <<<
# >>> jalankan perintah verifikasi mandiri sebelum menyelesaikan task <<<
pakeai done        # tandai selesai
\`\`\`

## Setelah Semua Task Selesai
Setelah semua task DONE, aplikasi siap dijalankan di komputer lokal user:

### Cara Jalankan Aplikasi Hasil Generate:
1. Buka terminal di folder workspace proyek
2. Jalankan perintah sesuai stack:
   - Vite/React: \`npm run dev --port 9999\` atau \`vite --port 9999\`
   - Next.js: \`npm run dev -- -p 9999\` atau \`next dev -p 9999\`
   - Create React App: \`PORT=9999 npm start\`
3. Akses aplikasi di browser: **http://localhost:9999**
4. Proyek siap dipakai!

**Catatan penting**: Gunakan port **9999** agar tidak bertabrakan dengan pakeai platform yang jalan di port 3455.

## Aturan Penting
- **Isolasi project**: agent HANYA boleh membaca task/BRD dari project ini (server menegakkan via token).
- **Fokus Task**: penuhi Acceptance Criteria dan loloskan Validation Commands. Struktur file adalah panduan arsitektur.
- **Checkpoint gate**: jika setelah \`done\` ada pesan checkpoint, BERHENTI dan minta approval user sebelum lanjut.
- **Layer transition**: jika layer (DATABASE/BACKEND/FRONTEND) sudah selesai, minta approval user.
- **Testing**: sebelum panggil \`pakeai done\`, pastikan kode jalan lancar lokal dan test acceptance criteria terpenuhi.
- **Jika gagal**: laporkan error apa adanya ke user. JANGAN diam-diam fallback.

## Checklist Kualitas (verifikasi sebelum \`pakeai done\` di setiap task)
- [ ] Tidak ada hardcoded secret/credential (dilarang fallback default seperti "|| 'secret'")
- [ ] Semua controller async dibungkus try-catch atau asyncHandler agar tidak crash server
- [ ] Endpoint POST/PUT/PATCH memvalidasi input (Zod schema)
- [ ] Endpoint GET list mendukung pagination (?page, ?limit)
- [ ] Operasi stok/saldo/kuota dalam $transaction atomik (baca dan tulis dalam transaksi yang sama)
- [ ] DELETE endpoint cek relasi aktif sebelum hapus (tolak 409 jika ada relasi aktif)
- [ ] Frontend: dilarang window.alert(), gunakan AlertBanner atau Toast
- [ ] Frontend: semua label punya htmlFor yang sesuai dengan id input, tombol ikon punya aria-label
- [ ] Frontend: loading state pakai skeleton loader, bukan teks polos
- [ ] .gitignore ada dan exclude node_modules, .env, *.db, dist

## Token Anda
Tempel token di placeholder di bawah SEBELUM menyalin prompt ini.

{{TOKEN}}
`;

  res.json({ projectName: project.name, prompt: md });
});

// Step 2: generate BRD dari ide + tech stack + chat history.
app.post('/api/projects/:id/brd/generate', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: {
      stacks: true,
    },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const existing = await prisma.brd.findUnique({ where: { projectId: project.id } });
  if (existing && isStageLocked(project.wizardStep, 'brd')) {
    return res.status(403).json({ error: 'Dokumen BRD telah selesai dan terkunci (Read-Only).' });
  }

  const chatSession = await prisma.chatSession.findFirst({
    where: { projectId: project.id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  const chatHistory = chatSession?.messages?.length
    ? chatSession.messages.map((m) => `${m.role}: ${m.content}`).join('\n')
    : undefined;

  const techStackList = project.stacks.length > 0
    ? project.stacks.map((s) => `${s.category}: ${s.name}${s.version ? ` (${s.version})` : ''}`)
    : undefined;

  try {
    const brd = await generateBRDFromDiscovery({
      idea: project.idea,
      projectId: project.id,
      techStack: techStackList,
      chatHistory,
    });
    if (existing) {
      const updated = await prisma.brd.update({
        where: { projectId: project.id },
        data: { content: brd, version: existing.version + 1 },
      });
      await prisma.project.update({ where: { id: project.id }, data: { wizardStep: 'tree' } });
      return res.json({ brd: updated });
    }
    const created = await prisma.brd.create({ data: { projectId: project.id, content: brd } });
    await prisma.project.update({ where: { id: project.id }, data: { wizardStep: 'tree' } });
    res.status(201).json({ brd: created });
  } catch (err) {
    res.status(502).json({ error: 'AI gagal menghasilkan BRD.', detail: (err as Error).message });
  }
});

app.get('/api/projects/:id/brd', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });
  const brd = await prisma.brd.findUnique({ where: { projectId: project.id } });
  res.json({ brd });
});

// Step 3: roadmap dari BRD.
app.post('/api/projects/:id/roadmap/generate', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { brd: true },
  });
  if (!project?.brd) return res.status(400).json({ error: 'BRD belum ada. Generate BRD dulu.' });
  try {
    const parsed = BrdSchema.parse(project.brd.content);
    const data = await generateRoadmapFromBRD(parsed, { projectId: project.id });

    // Hapus roadmap lama (cascade akan hapus features + deps).
    await prisma.roadmapPhase.deleteMany({ where: { projectId: project.id } });

    const phaseMap = new Map<string, string>(); // tmpId -> realId
    for (const p of data.phases) {
      const created = await prisma.roadmapPhase.create({
        data: { projectId: project.id, order: p.order, title: p.title, description: p.description, layer: p.layer },
      });
      for (const f of p.features) {
        const fcreated = await prisma.roadmapFeature.create({
          data: { phaseId: created.id, title: f.title, description: f.description },
        });
        phaseMap.set(f.id, fcreated.id);
      }
    }
    for (const p of data.phases) {
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
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: 'AI gagal menghasilkan roadmap.', detail: (err as Error).message });
  }
});

app.get('/api/projects/:id/roadmap', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: {
      roadmap: {
        orderBy: { order: 'asc' },
        include: {
          features: {
            include: { dependencies: { include: { dependsOn: true } }, tasks: true },
          },
        },
      },
    },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });
  res.json({ phases: project.roadmap });
});

// UX/UI Specification Agent (Bab 14)
app.get('/api/projects/:id/ui-spec', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
    select: { id: true, name: true, uiSpec: true },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });
  res.json({ uiSpec: project.uiSpec });
});

app.post('/api/projects/:id/ui-spec/generate', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { brd: true },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });
  if (!project.brd) return res.status(400).json({ error: 'BRD belum ada. Generate BRD dulu.' });

  try {
    const parsedBrd = BrdSchema.parse(project.brd.content);
    const spec = await generateUiSpec({
      brd: parsedBrd,
      projectName: project.name,
      projectId: project.id,
    });
    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { uiSpec: spec as any },
    });
    res.json({ ok: true, uiSpec: updated.uiSpec });
  } catch (err) {
    res.status(502).json({ error: 'AI gagal menghasilkan UI Spec.', detail: (err as Error).message });
  }
});

// Step 4: generate atomic tasks dari roadmap (auto generate roadmap jika belum ada).
app.post('/api/projects/:id/tasks/generate', requireUser, async (req: AuthedRequest, res) => {
  let project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: {
      brd: true,
      stacks: true,
      roadmap: { include: { features: { include: { dependencies: true } } } },
    },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const existingTasksCount = await prisma.task.count({ where: { projectId: project.id } });
  if (existingTasksCount > 0 && isStageLocked(project.wizardStep, 'board')) {
    return res.status(403).json({ error: 'Tasks telah selesai dibuat dan terkunci (Read-Only).' });
  }

  // Auto-generate roadmap jika belum ada tapi BRD ada
  if (project.roadmap.length === 0) {
    if (!project.brd) return res.status(400).json({ error: 'BRD belum ada. Generate BRD dulu.' });
    try {
      const parsedBrd = BrdSchema.parse(project.brd.content);
      const roadmapData = await generateRoadmapFromBRD(parsedBrd, { projectId: project.id });
      await prisma.roadmapPhase.deleteMany({ where: { projectId: project.id } });

      const phaseMap = new Map<string, string>();
      for (const p of roadmapData.phases) {
        const created = await prisma.roadmapPhase.create({
          data: { projectId: project.id, order: p.order, title: p.title, description: p.description, layer: p.layer },
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

      // Re-fetch project dengan roadmap baru
      const refetched = await prisma.project.findFirst({
        where: { id: req.params.id, userId: req.userId },
        include: {
          brd: true,
          stacks: true,
          roadmap: { include: { features: { include: { dependencies: true } } } },
        },
      });
      if (refetched) project = refetched;
    } catch (err) {
      return res.status(502).json({ error: 'AI gagal menghasilkan roadmap untuk tasks.', detail: (err as Error).message });
    }
  }

  if (project.roadmap.length === 0) return res.status(400).json({ error: 'Roadmap belum ada.' });

  // Konversi Prisma ke shape yang dipahami AI generator.
  const featureIdMap = new Map<string, string>(); // dbId -> tmpId
  const featuresForAI: { id: string; title: string; description?: string; layer: string; dependsOn: string[] }[] = [];
  let tmpCounter = 1;
  for (const phase of project.roadmap) {
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
  const phasesForAI = project.roadmap.map((p) => ({
    order: p.order,
    title: p.title,
    description: p.description ?? undefined,
    layer: p.layer as 'BOOTSTRAP' | 'DATABASE' | 'BACKEND' | 'FRONTEND' | 'INTEGRATION',
    features: featuresForAI
      .filter((f) => project.roadmap.find((rp) => rp.features.find((rf) => featureIdMap.get(rf.id) === f.id))?.id === p.id)
      .map((f) => ({ id: f.id, title: f.title, description: f.description, dependsOn: f.dependsOn })),
  }));

  try {
    const brdData = project.brd?.content as {
      userStories?: Array<{ id: string; persona: string; action: string; benefit: string }>;
      functionalRequirements?: Array<{ id: string; title: string; description: string; priority?: string }>;
      businessRules?: Array<{ id: string; description: string }>;
      dataModels?: Array<{ name: string; description?: string; fields: Array<{ name: string; type: string; required?: boolean }>; relations?: string[] }>;
      apiEndpoints?: Array<{ method: string; path: string; description: string; requestBody?: string; responseBody?: string; authRequired?: boolean }>;
      edgeCases?: Array<{ id: string; scenario: string; expectedBehavior: string }>;
      techRequirements?: string[];
    } | undefined;

    // Dedicated UX/UI Specification Agent (Bab 14)
    let uiSpecData = project.uiSpec as any;
    if (!uiSpecData && project.brd) {
      try {
        const parsedBrd = BrdSchema.parse(project.brd.content);
        uiSpecData = await generateUiSpec({
          brd: parsedBrd,
          projectName: project.name,
          projectId: project.id,
        });
        await prisma.project.update({
          where: { id: project.id },
          data: { uiSpec: uiSpecData },
        });
      } catch (err) {
        console.warn('[ui-spec-warn] Gagal auto-generate UI Spec, lanjutkan tanpa UI spec:', (err as Error).message);
      }
    }

    const stackContract = resolveStackContract(project.stacks || []);

    let generated = await generateTasksFromRoadmap({
      roadmap: { phases: phasesForAI },
      projectName: project.name,
      brd: brdData,
      uiSpec: uiSpecData,
      projectId: project.id,
      stack: stackContract,
    });

    // Validasi coverage API ke UI: catat jika ada endpoint mutasi tanpa pemanggil di frontend
    const coverage = validateApiCoverage(generated, brdData?.apiEndpoints ?? []);
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

    // Hapus tasks lama, tulis ulang.
    await prisma.task.deleteMany({ where: { projectId: project.id } });

    let order = 1;
    const createdTasks: Array<{
      dbId: string;
      aiTaskId?: string;
      order: number;
      featureId?: string;
      dependsOn: string[];
    }> = [];

    for (const t of validTasks) {
      // Cari db feature yang punya tmpId = t.featureId
      let dbFeatureId: string | undefined;
      for (const [dbId, tmpId] of featureIdMap.entries()) {
        if (tmpId === t.featureId) {
          dbFeatureId = dbId;
          break;
        }
      }
      const currentOrder = order++;
      const created = await prisma.task.create({
        data: {
          projectId: project.id,
          featureId: dbFeatureId,
          title: t.title,
          description: t.description,
          layer: t.layer,
          status: 'TODO',
          order: currentOrder,
          apiContracts: (t as any).apiContracts ?? [],
          aiContext: {
            taskId: t.taskId,
            userStoryId: t.userStoryId,
            requirement_ids: t.requirement_ids,
            depends_on: t.depends_on,
            files_to_create: t.files_to_create,
            files_to_modify: t.files_to_modify,
            files_readonly: t.files_readonly,
            forbidden: t.forbidden,
            implementation_steps: t.implementation_steps,
            validation_commands: t.validation_commands,
            definition_of_done: t.definition_of_done,
            out_of_scope: t.out_of_scope,
            consumesApis: t.consumesApis ?? [],
          },
          acceptanceCriteria: t.acceptanceCriteria,
        },
      });

      createdTasks.push({
        dbId: created.id,
        aiTaskId: t.taskId,
        order: currentOrder,
        featureId: t.featureId,
        dependsOn: t.depends_on ?? [],
      });
    }

    // Hubungkan TaskDependency native di database
    for (const item of createdTasks) {
      if (item.dependsOn.length > 0) {
        for (const dep of item.dependsOn) {
          const cleanDep = dep.trim().toLowerCase();
          const target = createdTasks.find(
            (c) =>
              c.dbId !== item.dbId &&
              ((c.aiTaskId && c.aiTaskId.toLowerCase() === cleanDep) ||
                `task-${c.order}` === cleanDep ||
                String(c.order) === cleanDep ||
                (c.featureId && c.featureId.toLowerCase() === cleanDep))
          );
          if (target) {
            await prisma.taskDependency.create({
              data: {
                taskId: item.dbId,
                dependsOnId: target.dbId,
              },
            });
          }
        }
      }
    }

    await prisma.project.update({ where: { id: project.id }, data: { wizardStep: 'board' } });
    res.json({ ok: true, count: generated.length, cleanupWarnings: cleanupResult.warnings });
  } catch (err) {
    res.status(502).json({ error: 'AI gagal menghasilkan tasks.', detail: (err as Error).message });
  }
});

// Kanban list + update status (user side; agent pakai endpoint agent).
app.get('/api/projects/:id/tasks', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { brd: true },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });
  const tasks = await prisma.task.findMany({
    where: { projectId: project.id },
    include: {
      dependsOn: {
        include: {
          dependsOn: { select: { id: true, title: true, status: true, order: true } },
        },
      },
    },
    orderBy: { order: 'asc' },
  });
  const userStories = (project.brd?.content as any)?.userStories ?? [];

  // Normalisasi backwards compatibility untuk task lama yang belum punya userStoryId
  let needPersist = false;
  const normalizedTasks = tasks.map((t, idx) => {
    const ctx = ((t.aiContext as any) || {}) as Record<string, any>;
    if (!ctx.userStoryId && userStories.length > 0) {
      needPersist = true;
      let matchedStoryId = userStories[0]?.id || 'US-001';
      const titleLower = t.title.toLowerCase();
      const matched = userStories.find((s: any) => {
        const words = `${s.action} ${s.persona}`.toLowerCase().split(/\s+/).filter((w: string) => w.length >= 4);
        return words.some((w: string) => titleLower.includes(w));
      });
      if (matched) {
        matchedStoryId = matched.id;
      } else {
        const storyIdx = Math.min(Math.floor((idx / tasks.length) * userStories.length), userStories.length - 1);
        matchedStoryId = userStories[storyIdx]?.id || matchedStoryId;
      }
      ctx.userStoryId = matchedStoryId;
      return { ...t, aiContext: ctx };
    }
    return t;
  });

  if (needPersist) {
    Promise.all(
      normalizedTasks.map((t) =>
        prisma.task.update({
          where: { id: t.id },
          data: { aiContext: t.aiContext as any },
        }).catch(() => {})
      )
    ).catch(() => {});
  }

  res.json({ tasks: normalizedTasks, userStories });
});

app.patch('/api/tasks/:taskId', requireUser, async (req: AuthedRequest, res) => {
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
  res.json({ task: updated });
});

// ============================================================
// Checkpoint (approval layer transition)
// ============================================================

app.get('/api/projects/:id/checkpoints', requireUser, async (req: AuthedRequest, res) => {
  const items = await prisma.checkpoint.findMany({
    where: { projectId: req.params.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ checkpoints: items });
});

app.post('/api/checkpoints/:id/approve', requireUser, async (req: AuthedRequest, res) => {
  const cp = await prisma.checkpoint.findUnique({ where: { id: req.params.id }, include: { project: true } });
  if (!cp) return res.status(404).json({ error: 'Checkpoint tidak ditemukan.' });
  if (cp.project.userId !== req.userId) return res.status(403).json({ error: 'Bukan project Anda.' });
  const updated = await prisma.checkpoint.update({
    where: { id: cp.id },
    data: { status: 'APPROVED', resolvedAt: new Date() },
  });
  res.json({ ok: true, checkpoint: updated });
});

// ============================================================
// Observability — Metrik AI (Token & Latensi) (Bab 39)
// ============================================================

app.get('/api/projects/:id/ai-metrics', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const logs = await prisma.aiCallLog.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const totalCalls = logs.length;
  const totalTokens = logs.reduce((sum, l) => sum + l.totalTokens, 0);
  const inputTokens = logs.reduce((sum, l) => sum + l.inputTokens, 0);
  const outputTokens = logs.reduce((sum, l) => sum + l.outputTokens, 0);
  const avgLatencyMs = totalCalls > 0 ? Math.round(logs.reduce((sum, l) => sum + l.latencyMs, 0) / totalCalls) : 0;
  const successCount = logs.filter((l) => l.success).length;
  const successRate = totalCalls > 0 ? Math.round((successCount / totalCalls) * 100) : 100;

  // Breakdown per agent
  const agentMap = new Map<string, { calls: number; tokens: number; totalLatency: number; success: number }>();
  for (const l of logs) {
    const existing = agentMap.get(l.agentName) ?? { calls: 0, tokens: 0, totalLatency: 0, success: 0 };
    existing.calls += 1;
    existing.tokens += l.totalTokens;
    existing.totalLatency += l.latencyMs;
    if (l.success) existing.success += 1;
    agentMap.set(l.agentName, existing);
  }

  const byAgent = Array.from(agentMap.entries()).map(([agentName, data]) => ({
    agentName,
    calls: data.calls,
    tokens: data.tokens,
    avgLatencyMs: Math.round(data.totalLatency / data.calls),
    successRate: Math.round((data.success / data.calls) * 100),
  }));

  res.json({
    ok: true,
    summary: {
      totalCalls,
      totalTokens,
      inputTokens,
      outputTokens,
      avgLatencyMs,
      successRate,
    },
    byAgent,
    recentLogs: logs.slice(0, 20),
  });
});

app.get('/api/ai-metrics', requireUser, async (req: AuthedRequest, res) => {
  // Ambil semua project milik user
  const userProjects = await prisma.project.findMany({
    where: { userId: req.userId },
    select: { id: true },
  });
  const projectIds = userProjects.map((p) => p.id);

  const logs = await prisma.aiCallLog.findMany({
    where: {
      OR: [
        { projectId: { in: projectIds } },
        { projectId: null }, // log global
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const totalCalls = logs.length;
  const totalTokens = logs.reduce((sum, l) => sum + l.totalTokens, 0);
  const inputTokens = logs.reduce((sum, l) => sum + l.inputTokens, 0);
  const outputTokens = logs.reduce((sum, l) => sum + l.outputTokens, 0);
  const avgLatencyMs = totalCalls > 0 ? Math.round(logs.reduce((sum, l) => sum + l.latencyMs, 0) / totalCalls) : 0;
  const successCount = logs.filter((l) => l.success).length;
  const successRate = totalCalls > 0 ? Math.round((successCount / totalCalls) * 100) : 100;

  res.json({
    ok: true,
    summary: {
      totalCalls,
      totalTokens,
      inputTokens,
      outputTokens,
      avgLatencyMs,
      successRate,
    },
    recentLogs: logs.slice(0, 20),
  });
});

// ============================================================
// CHAT FLOW — Sesi chat brainstorming sebelum project dibuat
// ============================================================

app.post('/api/chat/sessions', requireUser, async (req: AuthedRequest, res) => {
  const session = await prisma.chatSession.create({
    data: { userId: req.userId },
  });
  res.status(201).json({ sessionId: session.id });
});

app.get('/api/chat/sessions/:id/messages', requireUser, async (req: AuthedRequest, res) => {
  const session = await prisma.chatSession.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!session) return res.status(404).json({ error: 'Sesi chat tidak ditemukan.' });
  res.json({ messages: session.messages });
});

const ChatMessageBodySchema = z.object({
  content: z.string().min(1),
  formAnswers: z.record(z.string(), z.string()).optional(), // jawaban form yang sudah diserialkan jadi teks
});

app.post('/api/chat/sessions/:id/messages', requireUser, async (req: AuthedRequest, res) => {
  const parsed = ChatMessageBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Data tidak valid.' });

  const session = await prisma.chatSession.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!session) return res.status(404).json({ error: 'Sesi chat tidak ditemukan.' });

  // Simpan pesan user (text saja; formAnswers dianggap sudah jadi text di content)
  await prisma.chatMessage.create({
    data: { sessionId: session.id, role: 'user', content: parsed.data.content },
  });

  // Dapatkan AI response
  let aiResult: { kind: string; content: string; payload?: unknown };
  try {
    aiResult = await replyChat(session.id);
  } catch (err) {
    console.warn('[chat] replyChat gagal:', (err as Error).message);
    aiResult = { kind: 'text', content: "Maaf, terjadi kesalahan saat merespons." };
  }

  // Simpan AI response (payload bisa null atau JSON serializable object)
  await prisma.chatMessage.create({
    data: {
      sessionId: session.id,
      role: 'assistant',
      kind: aiResult.kind,
      content: aiResult.content,
      payload: aiResult.payload ? JSON.stringify(aiResult.payload) : undefined,
    },
  });

  res.json(aiResult);
});

app.post('/api/chat/sessions/:id/retry', requireUser, async (req: AuthedRequest, res) => {
  const session = await prisma.chatSession.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!session) return res.status(404).json({ error: 'Sesi chat tidak ditemukan.' });

  // Hapus pesan asisten terakhir yang error
  const lastMsg = await prisma.chatMessage.findFirst({
    where: { sessionId: session.id },
    orderBy: { createdAt: 'desc' },
  });
  if (lastMsg && lastMsg.role === 'assistant') {
    await prisma.chatMessage.delete({ where: { id: lastMsg.id } });
  }

  let aiResult: { kind: string; content: string; payload?: unknown };
  try {
    aiResult = await replyChat(session.id);
  } catch (err) {
    console.warn('[chat] retry replyChat gagal:', (err as Error).message);
    aiResult = { kind: 'text', content: "Maaf, terjadi kesalahan saat merespons." };
  }

  const created = await prisma.chatMessage.create({
    data: {
      sessionId: session.id,
      role: 'assistant',
      kind: aiResult.kind,
      content: aiResult.content,
      payload: aiResult.payload ? JSON.stringify(aiResult.payload) : undefined,
    },
  });

  res.json({ ...aiResult, id: created.id });
});

app.post('/api/chat/sessions/:id/finalize', requireUser, async (req: AuthedRequest, res) => {
  const session = await prisma.chatSession.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!session) return res.status(404).json({ error: 'Sesi chat tidak ditemukan.' });

  try {
    const result = await finalizeChatSession(session.id, req.userId);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'Gagal finalisasi project.', detail: (err as Error).message });
  }
});

// ============================================================
// WIZARD FLOW — Langkah-langkah setelah project created dari chat
// ============================================================

// Tech stack
app.post('/api/projects/:id/techstack/recommend', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  if (isStageLocked(project.wizardStep, 'techstack')) {
    return res.status(403).json({ error: 'Tahap tech stack telah selesai dan terkunci (Read-Only).' });
  }

  try {
    const result = await recommendTechStack(project.id);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'AI gagal merekomendasikan tech stack.', detail: (err as Error).message });
  }
});

app.put('/api/projects/:id/techstack', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  if (isStageLocked(project.wizardStep, 'techstack')) {
    return res.status(403).json({ error: 'Tahap tech stack telah selesai dan terkunci (Read-Only).' });
  }

  await prisma.stack.deleteMany({ where: { projectId: project.id } });
  const stacks = Array.isArray(req.body.techStack) ? req.body.techStack : [];
  await Promise.all(
    stacks.map((s: string) => {
      const parsed = parseStackEntry(s);
      return prisma.stack.create({
        data: {
          projectId: project.id,
          category: parsed.category,
          name: parsed.name,
          version: parsed.version,
        },
      });
    })
  );

  await prisma.project.update({ where: { id: project.id }, data: { wizardStep: 'brd' } });
  res.json({ ok: true });
});

app.post('/api/projects/:id/tree/generate', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { brd: true },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });
  if (!project.brd) return res.status(400).json({ error: 'BRD belum ada. Generate BRD dulu.' });

  const existingTreeCount = await prisma.treeNode.count({ where: { projectId: project.id } });
  if (existingTreeCount > 0 && isStageLocked(project.wizardStep, 'tree')) {
    return res.status(403).json({ error: 'Diagram struktur telah selesai dan terkunci (Read-Only).' });
  }

  try {
    const nodes = await generateTreeFromBrd(project.id);
    await prisma.project.update({ where: { id: project.id }, data: { wizardStep: 'board' } });
    res.json({ ok: true, count: nodes.length });
  } catch (err) {
    res.status(502).json({ error: 'AI gagal menghasilkan struktur tree.', detail: (err as Error).message });
  }
});

app.get('/api/projects/:id/tree', requireUser, async (req: AuthedRequest, res) => {
  const project = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const nodes = await prisma.treeNode.findMany({
    where: { projectId: project.id },
    orderBy: { order: 'asc' },
  });
  res.json({ nodes });
});

// ============================================================
// Start
// ============================================================
app.listen(PORT, () => {
  console.log(`[pakeai-api] listening on http://localhost:${PORT}`);
  console.log(`[pakeai-api] CORS origins: ${FE_ORIGINS.join(', ')}`);
  console.log(`[pakeai-api] Better Auth baseURL: ${process.env.BETTER_AUTH_URL}`);
});
