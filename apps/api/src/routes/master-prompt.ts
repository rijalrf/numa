// Master prompt untuk user copy-paste ke AI coding agent. Satu sumber untuk dialog web (lihat lib/master-prompt.ts).
import { Router } from 'express';
import { projectWhere } from '../lib/access.js';
import { prisma } from '../lib/prisma.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';
import { getPublicApiUrl, PREVIEW_PORT } from '../lib/config.js';
import { resolveStackContract } from '../lib/ai/stack-contract.js';
import { resolveArchitectureContract, renderArchitectureContract } from '../lib/ai/architecture-contract.js';
import { renderUiShellContract, resolveUiShellContract } from '../lib/ai/ui-shell-contract.js';
import { buildMasterPrompt, DEFAULT_EXECUTION_MODE, isExecutionMode } from '../lib/master-prompt.js';

export const masterPromptRouter = Router();

masterPromptRouter.get('/api/projects/:id/master-prompt', requireUser, async (req: AuthedRequest, res) => {
  const rawMode = req.query.mode;
  if (rawMode !== undefined && !isExecutionMode(rawMode)) {
    return res.status(400).json({ error: 'Mode eksekusi tidak valid. Gunakan "confirm" atau "auto".' });
  }
  const mode = rawMode === undefined ? DEFAULT_EXECUTION_MODE : (rawMode as 'confirm' | 'auto');

  const project = await prisma.project.findFirst({
    where: projectWhere(req.userId, req.params.id),
    include: { prd: true, stacks: true },
  });
  if (!project) return res.status(404).json({ error: 'Project tidak ditemukan.' });

  const stackContract = resolveStackContract(project.stacks || []);
  const prompt = buildMasterPrompt({
    projectName: project.name,
    projectId: project.id,
    idea: project.idea,
    hasPrd: Boolean(project.prd),
    architectureMarkdown: `${renderArchitectureContract(resolveArchitectureContract(stackContract))}\n\n${renderUiShellContract(resolveUiShellContract(stackContract))}`,
    apiUrl: getPublicApiUrl(),
    previewPort: PREVIEW_PORT,
    mode,
  });

  res.json({ projectName: project.name, mode, prompt });
});
