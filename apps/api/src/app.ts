// Pembentuk aplikasi Express (tanpa listen) agar bisa diuji dengan supertest.
// Urutan middleware penting: CORS dan request id paling awal, Better Auth sebelum express.json() (raw body).
import 'express-async-errors';
import { logger, serializeError } from './lib/logger.js';
import { requestContext } from './middleware/request-context.js';
import { toClientError } from './lib/http-error.js';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './lib/auth.js';
import { FE_ORIGINS, TRUST_PROXY_HOPS } from './lib/config.js';
import { requireUser } from './middleware/require-user.js';
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
import { aiMetricsRouter } from './routes/ai-metrics.js';
import { adminUsageRouter } from './routes/admin-usage.js';
import { chatRouter } from './routes/chat.js';
import { surveyRouter } from './routes/survey.js';
import { cliAuthRouter } from './routes/cli-auth.js';
import { techstackRouter } from './routes/techstack.js';
import { flowRouter } from './routes/flow.js';
import { billingRouter } from './routes/billing.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Hanya percaya jumlah hop proxy yang pasti: 'true' membuat X-Forwarded-For palsu dipercaya dan rate limit bisa dihindari.
  app.set('trust proxy', TRUST_PROXY_HOPS);

  // Pertahanan mendalam HTTP Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: false, // CSP ditangani secara terpusat oleh Nginx reverse proxy
      crossOriginEmbedderPolicy: false,
    }),
  );

  // 1) CORS HARUS paling awal — agar preflight dari browser (OPTIONS) ke /api/auth/* pun kena.
  app.use(
    cors({
      origin: FE_ORIGINS,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );
  app.use(requestContext);
  app.use(cookieParser());

  // Rate limiter untuk endpoint autentikasi (obs-3.1: mitigasi user enumeration & credential stuffing)
  const authRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30, // 30 req/menit per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Terlalu banyak percobaan autentikasi. Silakan tunggu beberapa saat.' },
  });

  // Rate limiter untuk endpoint yang memicu job AI (obs-3.1: mitigasi resource exhaustion & cost inflation)
  const aiRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30, // 30 req/menit per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Terlalu banyak permintaan AI. Silakan tunggu beberapa saat.' },
  });

  // Rate limiter untuk pembuatan kode login CLI dan percobaan persetujuan (kode pendek: cegah tebakan)
  const cliAuthLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Terlalu banyak percobaan login CLI. Silakan tunggu beberapa saat.' },
  });

  // Rate limiter untuk pembuatan token PAT (obs-3.1)
  const tokenRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15, // 15 req/menit per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Terlalu banyak pembuatan token. Silakan tunggu beberapa saat.' },
  });

  // Rate limiter umum untuk seluruh API: batas atas per IP agar satu klien tidak menghabiskan sumber daya.
  // Health check dan webhook pembayaran dikecualikan (dipanggil oleh infrastruktur, bukan pengguna).
  const apiRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => /^\/api\/(health|ready|billing\/webhook)/.test(req.originalUrl),
    message: { error: 'Terlalu banyak permintaan. Silakan tunggu beberapa saat.' },
  });

  // 2) Better Auth handler (raw body) — sebelum express.json().
  app.use('/api/auth', authRateLimiter);
  app.all('/api/auth/*', toNodeHandler(auth));

  // 3) JSON parser untuk route di bawah.
  app.use(express.json({ limit: '1mb' }));

  // Terapkan rate limiters ke endpoint AI dan token
  app.use('/api', apiRateLimiter);
  app.use(['/api/projects/:id/survey/generate', '/api/projects/:id/survey/submit'], aiRateLimiter);
  app.use(['/api/cli-auth/start', '/api/cli-auth/approve', '/api/cli-auth/deny', '/api/cli-auth/request'], cliAuthLimiter);
  app.use('/api/agent-tokens', tokenRateLimiter);

  // ============================================================
  // Route per domain (routes/*.ts)
  // ============================================================
  app.use('/api/projects/:id', requireUser);
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
  app.use(aiMetricsRouter);
  app.use(adminUsageRouter);
  app.use(chatRouter);
  app.use(cliAuthRouter);
  app.use(surveyRouter);
  app.use(techstackRouter);
  app.use(flowRouter);
  app.use(billingRouter);

  // ============================================================
  // Global Error Handler Middleware (vuln-0001: pencegahan crash DoS)
  // Menangkap semua unhandled error & async rejection agar proses tidak keluar
  // ============================================================
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const { status, body } = toClientError(err);
    // Error 5xx dicatat sebagai error; 4xx cukup warn agar log tidak berisik.
    logger[status >= 500 ? 'error' : 'warn']('request_error', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status,
      error: serializeError(err),
    });
    if (res.headersSent) {
      return;
    }
    res.status(status).json({
      ...body,
      // Detail internal hanya di luar produksi, untuk membantu debugging lokal.
      ...(status >= 500 && process.env.NODE_ENV !== 'production' && err instanceof Error ? { detail: err.message } : {}),
      requestId: req.requestId,
    });
  });
  return app;
}
