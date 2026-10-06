// Dimuat paling awal oleh index.ts (setelah dotenv). Proses berhenti bila konfigurasi tidak valid.
import { validateEnv } from './env.js';
import { logger } from './logger.js';

const { errors, warnings } = validateEnv();
for (const w of warnings) logger.warn('Peringatan konfigurasi', { detail: w });
if (errors.length > 0) {
  for (const e of errors) logger.error('Konfigurasi tidak valid', { detail: e });
  logger.error('Server tidak dapat dijalankan. Perbaiki environment variable di atas lalu jalankan ulang.');
  process.exit(1);
}
