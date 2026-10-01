// Bootstrap Express untuk numa API (port 6655).
// - Mount Better Auth handler SEBELUM express.json() (raw body).
// - CORS dengan credentials agar cookie session dari web terbaca.
// - Endpoint agent diproteksi requireAgent (PAT) + isolasi per project.
// - Route dikelompokkan per domain di routes/ (lihat AGENTS.md).
import 'dotenv/config';
import 'express-async-errors';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './lib/auth.js';

import { healthRouter } from './routes/health.js';
import { projectsRouter } from './routes/projects.js';
import { agentTokensRouter } from './routes/agent-tokens.js';
import { agentRouter } from './routes/agent.js';
import { exportRouter } from './routes/export.js';
import { wizardStepRouter } from './routes/wizard-step.js';
import { masterPromptRouter } from './routes/master-prompt.js';
import { prdRouter } from './routes/prd.js';
import { roadmapRouter } from './routes/roadmap.js';
import { userRouter } from './routes/user.js';
import { tasksRouter } from './routes/tasks.js';
import { cyclesRouter } from './routes/cycles.js';
import { checkpointsRouter } from './routes/checkpoints.js';
import { aiMetricsRouter } from './routes/ai-metrics.js';
import { chatRouter } from './routes/chat.js';
import { surveyRouter } from './routes/survey.js';
import { techstackRouter } from './routes/techstack.js';
import { treeRouter } from './routes/tree.js';
import { billingRouter } from './routes/billing.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

// Pertahanan mendalam HTTP Headers via Helmet
app.use(
  helmet({
    contentSecurityPolicy: false, // CSP ditangani secara terpusat oleh Nginx reverse proxy
    crossOriginEmbedderPolicy: false,
  }),
);

const PORT = Number(process.env.PORT ?? 6655);
// FE_URL boleh berisi beberapa origin dipisah koma (lokal + domain publik).
const defaultOrigins = [
  'http://localhost:3455',
  'https://numa.mrijal.my.id',
  'https://numa.opendv.xyz',
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

// Rate limiter untuk endpoint autentikasi (obs-3.1: mitigasi user enumeration & credential stuffing)
const authRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // 30 req/menit per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan autentikasi. Silakan tunggu beberapa saat.' },
});

// Rate limiter untuk AI chat & generation endpoints (obs-3.1: mitigasi resource exhaustion & cost inflation)
const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // 30 req/menit per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan AI. Silakan tunggu beberapa saat.' },
});

// Rate limiter untuk pembuatan token PAT (obs-3.1)
const tokenRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15, // 15 req/menit per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak pembuatan token. Silakan tunggu beberapa saat.' },
});

// 2) Better Auth handler (raw body) — sebelum express.json().
app.use('/api/auth', authRateLimiter);
app.all('/api/auth/*', toNodeHandler(auth));

// 3) JSON parser untuk route di bawah.
app.use(express.json({ limit: '1mb' }));

// Terapkan rate limiters ke endpoint AI dan token
app.use('/api/chat/sessions', aiRateLimiter);
app.use('/api/agent-tokens', tokenRateLimiter);
app.use('/api/projects/:id/agent-tokens', tokenRateLimiter);

// ============================================================
// Route per domain (routes/*.ts)
// ============================================================
app.use(healthRouter);
app.use(projectsRouter);
app.use(agentTokensRouter);
app.use(agentRouter);
app.use(exportRouter);
app.use(wizardStepRouter);
app.use(masterPromptRouter);
app.use(prdRouter);
app.use(roadmapRouter);
app.use(userRouter);
app.use(tasksRouter);
app.use(cyclesRouter);
app.use(checkpointsRouter);
app.use(aiMetricsRouter);
app.use(chatRouter);
app.use(surveyRouter);
app.use(techstackRouter);
app.use(treeRouter);
app.use(billingRouter);

// ============================================================
// Global Error Handler Middleware (vuln-0001: pencegahan crash DoS)
// Menangkap semua unhandled error & async rejection agar proses tidak keluar
// ============================================================
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  console.error(`[numa-api] Unhandled error pada ${req.method} ${req.originalUrl}:`, err);
  if (res.headersSent) {
    return;
  }
  const status = typeof (err as { status?: number })?.status === 'number'
    ? (err as { status?: number }).status!
    : 500;
  const message = err instanceof Error ? err.message : 'Terjadi kesalahan pada server.';
  res.status(status).json({
    error: status === 500 && process.env.NODE_ENV === 'production' ? 'Terjadi kesalahan internal server.' : message,
    detail: message,
  });
});

// ============================================================
// Start
// ============================================================
const server = app.listen(PORT, () => {
  console.log(`[numa-api] listening on http://localhost:${PORT}`);
  console.log(`[numa-api] CORS origins: ${FE_ORIGINS.join(', ')}`);
  console.log(`[numa-api] Better Auth baseURL: ${process.env.BETTER_AUTH_URL}`);
});
server.setTimeout(300000);
server.headersTimeout = 305000;
server.requestTimeout = 300000;
