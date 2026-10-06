// Bootstrap numa API (port 6655): validasi env, bentuk app (lihat app.ts), listen, worker antrean, shutdown rapi.
// Route dikelompokkan per domain di routes/ (lihat AGENTS.md).
import 'dotenv/config';
import './lib/env-check.js';
import { logger, serializeError } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { FE_ORIGINS, TRUST_PROXY_HOPS } from './lib/config.js';
import { startJobWorker, stopJobWorker } from './lib/ai/job.js';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT ?? 6655);
const app = createApp();

// ============================================================
// Start
// ============================================================
const server = app.listen(PORT, () => {
  logger.info('API berjalan', { port: PORT, feOrigins: FE_ORIGINS, authUrl: process.env.BETTER_AUTH_URL ?? null, trustProxyHops: TRUST_PROXY_HOPS });
});
startJobWorker();

let shuttingDown = false;
// Shutdown rapi: job yang sedang berjalan dikembalikan ke antrean agar dilanjutkan instance berikutnya.
async function shutdown(reason: string, exitCode: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutdown dimulai', { reason });
  // Batas waktu keras agar proses tidak menggantung bila koneksi tidak mau tutup.
  setTimeout(() => process.exit(exitCode), 10_000).unref();
  try {
    await stopJobWorker();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  } catch (err) {
    logger.error('Shutdown tidak bersih', { error: serializeError(err) });
  }
  process.exit(exitCode);
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => void shutdown(signal, 0));
}
// Error yang lolos dari semua penanganan: catat, lalu berhenti agar orchestrator memulai ulang proses yang bersih.
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', { error: serializeError(reason) });
  void shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', { error: serializeError(err) });
  void shutdown('uncaughtException', 1);
});

server.setTimeout(300000);
server.headersTimeout = 305000;
server.requestTimeout = 300000;
