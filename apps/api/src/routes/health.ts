// Health check & meta endpoints (public).
import { Router } from 'express';
import { toolsRegistry } from '../tools/registry.js';

export const healthRouter = Router();

healthRouter.get(['/health', '/api/health'], (_req, res) => {
  res.json({ ok: true });
});

healthRouter.get('/api/tools', (_req, res) => {
  res.json({ tools: toolsRegistry });
});
