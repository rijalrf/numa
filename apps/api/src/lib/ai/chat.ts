// Fungsi AI untuk sesi chat ide awal dan alur bisnis: finalizeChatSession, recommendTechStack, generateFlowFromPrd
import { generateJson } from './ai-service.js';
import { snapshotArtifact } from '../artifact-version.js';
import { BusinessFlowSchema, RecommendTechStackSchema } from './schemas.js';
import { normalizeToGoldenPack } from './golden-stack.js';
import { readPrdContent } from './prd.js';
import {
  RECOMMEND_TECH_STACK_PROMPT,
  PROMPT_VERSIONS,
  GENERATE_FLOW_PROMPT,
} from './prompts.js';
import { prisma } from '../prisma.js';

// ===============================================
// FINALIZE PROJECT DARI IDE AWAL
// ===============================================

/** Nama sementara project: potongan ide. Nama final dari AI diisi oleh survey putaran 1. */
export function draftProjectName(idea: string): string {
  return idea.length > 50 ? idea.slice(0, 47) + '...' : idea;
}

/**
 * Satu langkah: buat ChatSession (langsung finalized), simpan ide sebagai pesan arsip, dan buat Project
 * dengan wizardStep 'survey'. Kuota project dicek oleh pemanggil (routes/chat.ts).
 * Tanpa panggilan AI: nama aplikasi dihasilkan survey putaran 1.
 */
export async function finalizeChatSession(userId: string, idea: string): Promise<{ projectId: string }> {
  const rawIdea = idea.trim();
  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        userId,
        name: draftProjectName(rawIdea),
        idea: rawIdea,
        description: rawIdea,
        wizardStep: 'survey',
      },
    });
    await tx.chatSession.create({
      data: {
        userId,
        status: 'finalized',
        summary: rawIdea,
        projectId: created.id,
        messages: { create: { role: 'user', content: rawIdea } },
      },
    });
    return created;
  });

  return { projectId: project.id };
}

/**
 * Teks PRD untuk prompt flow: cukup markdown, tanpa spec (entitas dan endpoint) dan indeks requirement
 * yang tidak dipakai generator itu. PRD tanpa markdown (format lama) dikirim utuh seperti sebelumnya.
 */
function prdTextForPrompt(content: unknown): string {
  const markdown = readPrdContent(content).markdown;
  if (markdown) return markdown;
  return typeof content === 'string' ? content : JSON.stringify(content);
}

// ===============================================
// TECH STACK RECOMMENDATION
// ===============================================

export async function recommendTechStack(projectId: string): Promise<{ techStack: string[]; reasoning: string }> {
  const [project, prd] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.prd.findUnique({ where: { projectId } }),
  ]);

  if (!project) throw new Error('Project tidak ditemukan');

  const prdContent = prd?.content ? JSON.stringify(prd.content) : project.idea;

  const result = await generateJson({
    system: RECOMMEND_TECH_STACK_PROMPT,
    user: `Nama aplikasi: ${project.name}\nIde & fitur: ${prdContent}`,
    schema: RecommendTechStackSchema,
    maxRetries: 2,
    agentName: 'TechStackArchitect',
    promptVersion: PROMPT_VERSIONS.techStack,
    projectId,
  });

  return {
    ...result,
    techStack: normalizeToGoldenPack(result.techStack),
  };
}

// ===============================================
// GENERATE BUSINESS FLOW DIAGRAM DARI PRD
// ===============================================

/**
 * Menghasilkan diagram alur bisnis swimlane (lane per persona) dari PRD project
 * dan menyimpannya di tabel BusinessFlow (satu baris per project, versi naik tiap generate ulang).
 */
export async function generateFlowFromPrd(projectId: string): Promise<{ stepCount: number; laneCount: number }> {
  const [project, prd] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.prd.findUnique({ where: { projectId } }),
  ]);

  if (!project || !prd) throw new Error('Project atau PRD tidak ditemukan');

  const prdContent = prdTextForPrompt(prd.content);

  const flow = await generateJson({
    system: GENERATE_FLOW_PROMPT,
    user: `Nama aplikasi: ${project.name}\nPRD / deskripsi lengkap: ${prdContent}`,
    schema: BusinessFlowSchema,
    maxRetries: 2,
    agentName: 'generateFlowFromPrd',
    promptVersion: PROMPT_VERSIONS.flow,
    projectId,
  });

  await snapshotArtifact(projectId, 'business_flow', 'flow_regenerate');
  await prisma.businessFlow.upsert({
    where: { projectId },
    create: { projectId, content: flow },
    update: { content: flow, version: { increment: 1 } },
  });

  return { stepCount: flow.steps.length, laneCount: flow.lanes.length };
}
