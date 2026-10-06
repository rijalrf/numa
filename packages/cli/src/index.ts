#!/usr/bin/env node
// numa CLI — agent loop driver untuk AI coding agent.
// Tanpa mock fallback. Semua error dilaporkan eksplisit.
// File ini hanya berisi registrasi command commander. Logic ada di ./commands/*.
import { Command } from 'commander';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError } from './api-client.js';
import {
  runLogin,
  runSwitch,
  runWhoami,
  runNext,
  runStart,
  runContext,
  runPrd,
  runLogout,
  runStatus,
} from './commands/basic.js';
import { runDone } from './commands/done.js';
import { runInit } from './commands/init.js';
import { runRetry, runBlock, runCheckpoint } from './commands/task-control.js';
import { CLI_VERSION } from './version.js';
import { runSync } from './commands/sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Folder bundled skills terletak satu tingkat di atas folder hasil build (dist/../skills).
// Dihitung di sini lalu disuntikkan ke runInit agar path tetap stabil.
const bundledSkillsDir = path.resolve(__dirname, '../skills');

const program = new Command();
program
  .name('numa')
  .description('CLI agent loop untuk numa (AI Planner). Dipakai oleh AI coding agent.')
  .version(CLI_VERSION);

program
  .command('login [token]')
  .description('Simpan Personal Access Token (PAT) dan verifikasi ke server. Tanpa argumen: baca NUMA_TOKEN atau prompt tersembunyi.')
  .option('--api-url <url>', 'URL server API numa (default: http://localhost:6655)')
  .option('-u, --url <url>', 'Alias untuk --api-url')
  .action(runLogin);

program
  .command('switch [projectId]')
  .description('Beralih ke project lain dengan token yang sama. Tanpa parameter: tampilkan daftar project tersedia.')
  .action(runSwitch);

program
  .command('whoami')
  .description('Tampilkan info project dari token saat ini.')
  .action(runWhoami);

program
  .command('next')
  .description('Ambil task berikutnya. Akan melanjutkan task IN_PROGRESS bila ada.')
  .action(runNext);

program
  .command('start [id]')
  .description('Tandai task IN_PROGRESS dan catat baseline git. Default: activeTaskId.')
  .option('--dir <path>', 'Direktori project. Default: direktori saat ini.')
  .action(runStart);

program
  .command('context [id]')
  .description('Cetak Markdown bounded context task aktif. WAJIB dibaca AI agent sebelum edit file.')
  .action(runContext);

program
  .command('done [id]')
  .description('Tandai task selesai. Menjalankan runtime scope guard (Cek file terlarang + validation commands) sebelum submit.')
  .option('--force', 'Lewati runtime scope guard.')
  .option('--summary <text>', 'Ringkasan singkat hasil implementasi task untuk referensi task berikutnya.')
  .option('--dir <path>', 'Direktori project. Default: direktori saat ini.')
  .option('--commit', 'Auto-generate conventional commit message dan jalankan git commit.')
  .option('--allow-unlisted', 'Jalankan validation_commands dengan program di luar allowlist tanpa konfirmasi.')
  .action(runDone);

program
  .command('retry [id]')
  .description('Reset task BLOCKED/IN_PROGRESS ke TODO agar bisa diulang.')
  .action(runRetry);

program
  .command('block [id]')
  .description('Tandai task BLOCKED dengan alasan (mis. spesifikasi ambigu) lalu berhenti dan lapor ke user.')
  .requiredOption('--reason <text>', 'Alasan task diblokir.')
  .action(runBlock);

program
  .command('checkpoint')
  .description('Tampilkan checkpoint yang menunggu approval user.')
  .action(runCheckpoint);

program
  .command('prd')
  .description('Tampilkan PRD project dalam format Markdown.')
  .action(runPrd);

program
  .command('logout')
  .description('Hapus token lokal.')
  .action(runLogout);

program
  .command('status')
  .description('Cek koneksi server dan status token.')
  .action(runStatus);

program
  .command('init')
  .description('Pasang skill pack numa dan kontrak arsitektur proyek ke workspace.')
  .option('--dir <path>', 'Direktori target workspace (default: direktori saat ini)')
  .option('--force', 'Paksa timpa file konfigurasi yang sudah ada')
  .option('--update', 'Pasang ulang skill pack walau versinya sudah sama dengan CLI')
  .option('--target <lokasi>', 'Lokasi pasang skill: agents (.agents/skills), claude (.claude/skills), atau all', 'all')
  .action((opts: { dir?: string; force?: boolean; update?: boolean; target?: string }) =>
    runInit({ ...opts, bundledSkillsDir })
  );

program
  .command('sync')
  .description('Kumpulkan ringkasan workspace (file tree dan manifest) dan kirim ke server.')
  .option('--dir <path>', 'Direktori workspace (default: direktori saat ini)')
  .action(runSync);

program.parseAsync(process.argv).catch((e) => {
  if (e instanceof ApiError) {
    console.error(`Error [${e.status}]: ${e.message}`);
    if (e.status === 401) {
      console.error('Token ditolak atau kedaluwarsa. Buat token baru di halaman profil, lalu jalankan: numa login');
    }
  } else {
    console.error('Error:', e instanceof Error ? e.message : e);
  }
  process.exit(1);
});
