// Dashboard pemakaian AI untuk admin platform (env PLATFORM_ADMIN_EMAILS).
import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireUser } from '../middleware/require-user.js';
import { requirePlatformAdmin } from '../middleware/require-platform-admin.js';
import { parseRange, usageByAgent, usageByPlan, usageByUser, usageSummary, usageTimeseries, type UsageRange } from '../lib/admin-usage.js';

export const adminUsageRouter = Router();

adminUsageRouter.use('/api/admin', requireUser, requirePlatformAdmin);

function withRange(res: Response, query: Record<string, unknown>): UsageRange | null {
  try {
    return parseRange(query);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
    return null;
  }
}

adminUsageRouter.get('/api/admin/usage/summary', async (req, res) => {
  const range = withRange(res, req.query);
  if (range) res.json(await usageSummary(range));
});

adminUsageRouter.get('/api/admin/usage/timeseries', async (req, res) => {
  const range = withRange(res, req.query);
  if (range) res.json(await usageTimeseries(range));
});

adminUsageRouter.get('/api/admin/usage/by-agent', async (req, res) => {
  const range = withRange(res, req.query);
  if (range) res.json(await usageByAgent(range));
});

const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

adminUsageRouter.get('/api/admin/usage/by-user', async (req, res) => {
  const range = withRange(res, req.query);
  if (!range) return;
  const { page, pageSize } = PageQuery.parse(req.query);
  res.json(await usageByUser(range, page, pageSize));
});

adminUsageRouter.get('/api/admin/usage/by-plan', async (req, res) => {
  const range = withRange(res, req.query);
  if (range) res.json(await usageByPlan(range));
});
