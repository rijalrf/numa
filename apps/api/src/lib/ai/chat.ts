// Fungsi AI untuk sesi chat ide awal dan struktur dekomposisi: finalizeChatSession, recommendTechStack, generateTreeFromPrd
import { generateJson } from './ai-service';
import { TreeDataSchema, type TreeData, RecommendTechStackSchema } from './schemas';
import crypto from 'node:crypto';
import {
  RECOMMEND_TECH_STACK_PROMPT,
  GENERATE_TREE_PROMPT,
} from './prompts';
import { prisma } from '../prisma';
import { checkProjectLimit } from '../billing';

// ===============================================
// FINALIZE PROJECT DARI CHAT SESSION
// ===============================================

export async function finalizeChatSession(sessionId: string, userId: string, initialIdea?: string): Promise<{ projectId: string }> {
  // 1. Cek batasan kuota project
  const limitCheck = await checkProjectLimit(userId);
  if (!limitCheck.allowed) {
    const err: any = new Error(`Kuota proyek tercapai (maksimal ${limitCheck.quotaMax} proyek aktif untuk paket ${limitCheck.plan}).`);
    err.status = 403;
    err.code = 'project_limit_reached';
    throw err;
  }

  // 2. Ambil ide dari parameter atau chat message
  let rawIdea = initialIdea?.trim();
  if (!rawIdea) {
    const firstUserMsg = await prisma.chatMessage.findFirst({
      where: { sessionId, role: 'user' },
      orderBy: { createdAt: 'asc' },
      select: { content: true },
    });
    rawIdea = firstUserMsg?.content?.trim();
  }

  if (!rawIdea) {
    rawIdea = 'Aplikasi Baru';
  }

  const tempName = rawIdea.length > 50 ? rawIdea.slice(0, 47) + '...' : rawIdea;

  // 3. Buat project baru dengan wizardStep 'survey'
  const project = await prisma.project.create({
    data: {
      userId,
      name: tempName,
      idea: rawIdea,
      description: rawIdea,
      wizardStep: 'survey',
    },
  });

  // 4. Update chatSession jadi finalized & link projectId
  await prisma.chatSession.update({
    where: { id: sessionId },
    data: {
      status: 'finalized',
      summary: rawIdea,
      projectId: project.id,
    },
  });

  return { projectId: project.id };
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
  });

  return result;
}

// ===============================================
// TREE GENERATION
// ===============================================

export async function generateTreeFromPrd(projectId: string): Promise<{ id: string; parentId: string | null; label: string; kind: string; requirementIds: string[]; order: number }[]> {
  const [project, prd] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.prd.findUnique({ where: { projectId } }),
  ]);

  if (!project || !prd) throw new Error('Project atau PRD tidak ditemukan');

  const prdContent = typeof prd.content === 'string' ? prd.content : JSON.stringify(prd.content);

  const treeData = await generateJson({
    system: GENERATE_TREE_PROMPT,
    user: `Nama aplikasi: ${project.name}\nPRD / deskripsi lengkap: ${prdContent}`,
    schema: TreeDataSchema,
    maxRetries: 2,
    agentName: 'generateTreeFromPrd',
  });

  // Flatten ke TreeNode dalam satu transaksi
  const flatNodes = flattenTree(treeData, projectId);

  // Hapus node lama dulu (idempotent)
  await prisma.treeNode.deleteMany({ where: { projectId } });

  // Insert semua node baru
  await prisma.treeNode.createMany({
    data: flatNodes,
  });

  return flatNodes;
}

// Backward compatibility alias
export const generateTreeFromBrd = generateTreeFromPrd;

// Helper: recursive flatten dari TreeDataSchema
function flattenTree(data: TreeData, projectId: string) {
  const nodes: Array<{
    id: string;
    projectId: string;
    parentId: string | null;
    label: string;
    kind: string;
    requirementIds: string[];
    order: number;
    createdAt: Date;
  }> = [];
  let orderCounter = 0;

  // App root
  const appNodeId = crypto.randomUUID();
  const appNode = {
    id: appNodeId,
    projectId,
    parentId: null,
    label: data.appName,
    kind: 'app',
    requirementIds: [],
    order: orderCounter++,
    createdAt: new Date(),
  };
  nodes.push(appNode);

  function traverseFeatures(features: typeof data.features, parentId: string | null) {
    features.forEach((feature) => {
      const featId = crypto.randomUUID();
      const featureNode = {
        id: featId,
        projectId,
        parentId,
        label: feature.label,
        kind: 'feature',
        requirementIds: feature.requirementIds || [],
        order: orderCounter++,
        createdAt: new Date(),
      };
      nodes.push(featureNode);

      if (feature.subfeatures && feature.subfeatures.length > 0) {
        traverseSubFeatures(feature.subfeatures, featId);
      }

      if (feature.tasks && feature.tasks.length > 0) {
        traverseTasks(feature.tasks, featId);
      }
    });
  }

  function traverseSubFeatures(
    subfeatures: Array<{
      label: string;
      requirementIds?: string[];
      tasks?: Array<{
        label: string;
        requirementIds?: string[];
        subtasks?: Array<{ label: string; requirementIds?: string[] }>;
      }>;
    }>,
    parentId: string
  ) {
    subfeatures.forEach((sf) => {
      const sfId = crypto.randomUUID();
      const sfNode = {
        id: sfId,
        projectId,
        parentId,
        label: sf.label,
        kind: 'subfeature',
        requirementIds: sf.requirementIds || [],
        order: orderCounter++,
        createdAt: new Date(),
      };
      nodes.push(sfNode);

      if (sf.tasks && sf.tasks.length > 0) {
        traverseTasks(sf.tasks, sfId);
      }
    });
  }

  function traverseTasks(
    tasks: Array<{
      label: string;
      requirementIds?: string[];
      subtasks?: Array<{ label: string; requirementIds?: string[] }>;
    }>,
    parentId: string
  ) {
    tasks.forEach((task) => {
      const taskId = crypto.randomUUID();
      const taskNode = {
        id: taskId,
        projectId,
        parentId,
        label: task.label,
        kind: 'task',
        requirementIds: task.requirementIds || [],
        order: orderCounter++,
        createdAt: new Date(),
      };
      nodes.push(taskNode);

      if (task.subtasks && task.subtasks.length > 0) {
        task.subtasks.forEach((st) => {
          const stId = crypto.randomUUID();
          const stNode = {
            id: stId,
            projectId,
            parentId: taskId,
            label: st.label,
            kind: 'subtask',
            requirementIds: st.requirementIds || [],
            order: orderCounter++,
            createdAt: new Date(),
          };
          nodes.push(stNode);
        });
      }
    });
  }

  traverseFeatures(data.features, appNode.id);
  return nodes;
}
