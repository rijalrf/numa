#!/usr/bin/env node
// numa CLI — agent loop driver untuk AI coding agent.
// Tanpa mock fallback. Semua error dilaporkan eksplisit.
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, saveConfig, clearConfig, type Config } from './config.js';
import { api, ApiError, probeHealth } from './api-client.js';
import { runGuard, GuardError, generateConventionalCommit, gitCommit } from './guard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();
program
  .name('numa')
  .description('CLI agent loop untuk numa (AI Planner). Dipakai oleh AI coding agent.')
  .version('0.3.1');

program
  .command('login <token>')
  .description('Simpan Personal Access Token (PAT) dan verifikasi ke server.')
  .option('--api-url <url>', 'URL server API numa (default: http://localhost:6655)')
  .option('-u, --url <url>', 'Alias untuk --api-url')
  .action(async (token: string, opts: { apiUrl?: string; url?: string }) => {
    const cfg = loadConfig();
    const targetUrl = opts.url || opts.apiUrl;
    if (targetUrl) {
      cfg.apiUrl = targetUrl;
    }
    cfg.token = token;
    saveConfig(cfg);
    const healthy = await probeHealth(cfg);
    if (!healthy) {
      console.error(`Tidak bisa menghubungi server di ${cfg.apiUrl}.`);
      console.error('Pastikan numa API jalan di port 6655.');
      process.exit(2);
    }

    console.log(`Mengecek akses token...`);

    // Fetch all projects accessible by this token
    let availableProjects: Array<{ id: string; name: string }> = [];

    try {
      const result = await api.listScopes(cfg);
      // Result should be { scopes: [...] }
      if (result && typeof result === 'object' && 'scopes' in result) {
        availableProjects = (result as any).scopes || [];
      } else {
        // Fallback: direct array
        availableProjects = Array.isArray(result) ? result : [];
      }
      console.log(`Found ${availableProjects.length} project(s)`);
    } catch (err) {
      if (err instanceof ApiError) {
        console.error('Error fetching scopes:', err.status, err.message);
        clearConfig();
        process.exit(1);
      }
      console.error('Unexpected error:', err);
      process.exit(1);
    }

    console.log(`Login berhasil!`);

    if (availableProjects.length > 0) {
      console.log(`Token valid dengan akses ke ${availableProjects.length} project:`);
      for (const proj of availableProjects) {
        console.log(`  - ${proj.name} (${proj.id})`);
      }
      if (availableProjects.length === 1) {
        cfg.projectId = availableProjects[0].id;
        saveConfig(cfg);
        console.log('');
        console.log(`Project aktif otomatis: ${availableProjects[0].name} (${availableProjects[0].id})`);
      } else {
        console.log('');
        console.log('Gunakan "numa switch <project-id>" untuk memilih project aktif.');
      }
    } else {
      console.log('Token valid, tetapi belum ada project yang di-scope.');
      console.log('Buat project baru atau minta admin menambahkan scope.');
    }

    console.log(`Server   : ${cfg.apiUrl}`);
  });

async function ensureActiveProject(cfg: Config): Promise<boolean> {
  if (cfg.projectId) return true;
  console.error('Project aktif belum dipilih.');
  try {
    const result = await api.listScopes(cfg);
    const projects: Array<{ id: string; name: string }> =
      (result as any)?.scopes ?? (Array.isArray(result) ? result : []);
    if (projects.length > 0) {
      console.error('\nDaftar project yang tersedia untuk token ini:');
      for (const p of projects) {
        console.error(`  - ${p.name} (${p.id})`);
      }
      console.error('\nPilih project aktif dengan: numa switch <project-id>');
    } else {
      console.error('Belum ada project yang dapat diakses oleh token ini.');
    }
  } catch (err: any) {
    console.error('Gagal mengambil daftar project:', err?.message || err);
  }
  return false;
}

function formatPrdMarkdown(
  content: unknown,
  prdObj: { version: number; generatedAt: string | Date }
): string {
  if (!content) return '# Product Requirements Document\n\n(PRD kosong)';
  if (typeof content === 'string') return content;
  if (typeof content === 'object') {
    const obj = content as Record<string, any>;
    if (typeof obj.markdown === 'string') {
      return obj.markdown;
    }

    // Format JSON structured PRD
    const parts: string[] = [];
    parts.push('# Product Requirements Document');
    parts.push('');
    parts.push(`**Generated:** ${new Date(prdObj.generatedAt).toLocaleString('id-ID')}`);
    parts.push(`**Version:** ${prdObj.version}`);
    parts.push('');
    parts.push('---');
    parts.push('');

    if (obj.overview) {
      parts.push('## Ringkasan Produk', '', obj.overview, '', '---', '');
    }
    if (Array.isArray(obj.goals) && obj.goals.length > 0) {
      parts.push('## Tujuan Produk', '');
      for (const g of obj.goals) parts.push(`- ${g}`);
      parts.push('', '---', '');
    }
    if (Array.isArray(obj.features) && obj.features.length > 0) {
      parts.push('## Fitur Utama', '');
      for (const f of obj.features) {
        parts.push(`### ${f.name || 'Fitur'}`);
        parts.push(f.description || '(tidak ada deskripsi)');
        parts.push('');
      }
      parts.push('---', '');
    }
    if (Array.isArray(obj.functionalRequirements) && obj.functionalRequirements.length > 0) {
      parts.push('## Functional Requirements', '');
      for (const r of obj.functionalRequirements) {
        parts.push(`- **${r.id}** ${r.title}: ${r.description}`);
      }
      parts.push('', '---', '');
    }
    const rules =
      Array.isArray(obj.productRules) && obj.productRules.length > 0
        ? obj.productRules
        : obj.businessRules;
    if (Array.isArray(rules) && rules.length > 0) {
      parts.push('## Aturan Produk & Bisnis', '');
      for (const r of rules) parts.push(`- **${r.id}**: ${r.description}`);
      parts.push('', '---', '');
    }
    if (Array.isArray(obj.techRequirements) && obj.techRequirements.length > 0) {
      parts.push('## Kebutuhan Teknologi', '');
      for (const t of obj.techRequirements) parts.push(`- ${t}`);
      parts.push('', '---', '');
    }
    if (Array.isArray(obj.dataModels) && obj.dataModels.length > 0) {
      parts.push('## Model Data', '```json', JSON.stringify(obj.dataModels, null, 2), '```', '', '---', '');
    }
    if (Array.isArray(obj.apiEndpoints) && obj.apiEndpoints.length > 0) {
      parts.push('## Spesifikasi Endpoint API', '```json', JSON.stringify(obj.apiEndpoints, null, 2), '```', '', '---', '');
    }
    if (Array.isArray(obj.nonFunctional) && obj.nonFunctional.length > 0) {
      parts.push('## Kebutuhan Non-Fungsional', '');
      for (const n of obj.nonFunctional) parts.push(`- ${n}`);
      parts.push('', '---', '');
    }
    if (Array.isArray(obj.outOfScope) && obj.outOfScope.length > 0) {
      parts.push('## Di Luar Lingkup (Out of Scope)', '');
      for (const o of obj.outOfScope) parts.push(`- ${o}`);
      parts.push('');
    }

    return parts.join('\n');
  }
  return String(content);
}

program
  .command('switch [projectId]')
  .description('Beralih ke project lain dengan token yang sama. Tanpa parameter: tampilkan daftar project tersedia.')
  .action(async (projectId?: string) => {
    const cfg = loadConfig();

    if (!cfg.token) {
      console.error('Belum login. Jalankan: numa login <token>');
      process.exit(1);
    }

    if (!projectId) {
      try {
        const result = await api.listScopes(cfg);
        const projects: Array<{ id: string; name: string }> =
          (result as any)?.scopes ?? (Array.isArray(result) ? result : []);
        console.log('Daftar project yang tersedia untuk token ini:\n');
        if (projects.length === 0) {
          console.log('  (Belum ada project yang dapat diakses)');
        } else {
          for (const p of projects) {
            const isCurrent = p.id === cfg.projectId ? ' * (aktif)' : '';
            console.log(`  - ${p.name} (${p.id})${isCurrent}`);
          }
        }
        console.log('\nGunakan: numa switch <project-id>');
      } catch (err: any) {
        console.error('Gagal mengambil daftar project:', err?.message || err);
        process.exit(1);
      }
      return;
    }

    cfg.projectId = projectId;
    saveConfig(cfg);

    try {
      const me = await api.whoami(cfg);
      console.log(`Switch berhasil!`);
      console.log(`Project  : ${me.project.name}`);
      console.log(`ProjectId: ${me.project.id}`);
    } catch (e) {
      if (e instanceof ApiError) {
        console.error(`Gagal switch ke project ${projectId}: ${e.message}`);
        process.exit(1);
      }
      throw e;
    }
  });

program
  .command('whoami')
  .description('Tampilkan info project dari token saat ini.')
  .action(async () => {
    const cfg = loadConfig();
    if (!cfg.token) {
      console.error('Belum login. Jalankan: numa login <token>');
      process.exit(1);
    }
    if (!(await ensureActiveProject(cfg))) {
      process.exit(1);
    }
    try {
      const me = await api.whoami(cfg);
      console.log(JSON.stringify(me, null, 2));
    } catch (e: any) {
      console.error(`Error: ${e?.message || e}`);
      process.exit(1);
    }
  });

program
  .command('next')
  .description('Ambil task berikutnya. Akan melanjutkan task IN_PROGRESS bila ada.')
  .action(async () => {
    const cfg = loadConfig();
    if (!cfg.token) {
      console.error('Belum login. Jalankan: numa login <token>');
      process.exit(1);
    }
    if (!(await ensureActiveProject(cfg))) {
      process.exit(1);
    }
    try {
      const out = await api.next(cfg);
      if (!out.hasTask) {
        console.log(out.message ?? 'Tidak ada task tersisa.');
        return;
      }
      cfg.activeTaskId = out.task!.id;
      saveConfig(cfg);
      console.log(`Task #${out.task!.order} [${out.task!.layer}] ${out.task!.status}`);
      console.log(`ID    : ${out.task!.id}`);
      console.log(`Judul : ${out.task!.title}`);
      if (out.task!.description) console.log(`\n${out.task!.description}`);
      console.log(`\n-> Lanjut: \`numa start\` lalu \`numa context\``);
    } catch (e: any) {
      console.error(`Error: ${e?.message || e}`);
      process.exit(1);
    }
  });

program
  .command('start [id]')
  .description('Tandai task IN_PROGRESS. Default: activeTaskId.')
  .action(async (id?: string) => {
    const cfg = loadConfig();
    if (!cfg.token) {
      console.error('Belum login. Jalankan: numa login <token>');
      process.exit(1);
    }
    if (!(await ensureActiveProject(cfg))) {
      process.exit(1);
    }
    const taskId = id ?? cfg.activeTaskId;
    if (!taskId) {
      console.error('Tidak ada task aktif. Jalankan: numa next');
      process.exit(1);
    }
    try {
      const r = await api.start(cfg, taskId);
      console.log(`Task ${r.taskId} -> ${r.status}`);
    } catch (e: any) {
      console.error(`Error: ${e?.message || e}`);
      process.exit(1);
    }
  });

program
  .command('context [id]')
  .description('Cetak Markdown bounded context task aktif. WAJIB dibaca AI agent sebelum edit file.')
  .action(async (id?: string) => {
    const cfg = loadConfig();
    if (!cfg.token) {
      console.error('Belum login. Jalankan: numa login <token>');
      process.exit(1);
    }
    if (!(await ensureActiveProject(cfg))) {
      process.exit(1);
    }
    const taskId = id ?? cfg.activeTaskId;
    if (!taskId) {
      console.error('Tidak ada task aktif. Jalankan: numa next');
      process.exit(1);
    }
    try {
      const r = await api.context(cfg, taskId);
      console.log(r.markdown);
    } catch (e: any) {
      console.error(`Error: ${e?.message || e}`);
      process.exit(1);
    }
  });

program
  .command('done [id]')
  .description('Tandai task selesai. Menjalankan runtime scope guard (Cek file terlarang + validation commands) sebelum submit.')
  .option('--force', 'Lewati runtime scope guard.')
  .option('--summary <text>', 'Ringkasan singkat hasil implementasi task untuk referensi task berikutnya.')
  .option('--dir <path>', 'Direktori project. Default: direktori saat ini.')
  .option('--commit', 'Auto-generate conventional commit message dan jalankan git commit.')
  .action(async (id?: string, opts?: { force?: boolean; dir?: string; summary?: string; commit?: boolean }) => {
    const cfg = loadConfig();
    if (!cfg.token) {
      console.error('Belum login. Jalankan: numa login <token>');
      process.exit(1);
    }
    if (!(await ensureActiveProject(cfg))) {
      process.exit(1);
    }
    const taskId = id ?? cfg.activeTaskId;
    if (!taskId) {
      console.error('Tidak ada task aktif. Jalankan: numa next');
      process.exit(1);
    }

    if (!opts?.force) {
      // Ambil guard spec dari context endpoint
      const ctx = await api.context(cfg, taskId);
      if (ctx.guard) {
        const cwd = opts?.dir ?? process.cwd();
        try {
          await runGuard(ctx.guard, cwd, taskId);
        } catch (e) {
          if (e instanceof GuardError) {
            console.error(e.message);
            if (e.failureContext) {
              try {
                const dir = path.join(cwd, '.numa');
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(
                  path.join(dir, 'failure-context.json'),
                  JSON.stringify(e.failureContext, null, 2),
                  'utf-8'
                );
              } catch {}
              console.error('\n=== FAILURE CONTEXT (STRUCTURED JSON) ===');
              console.error(JSON.stringify(e.failureContext, null, 2));

              try {
                await api.fail(cfg, taskId, e.failureContext);
              } catch {}
            }
            process.exit(1);
          }
          throw e;
        }
      } else {
        console.log('Task ini tidak memiliki guard spec. Lewati validasi lokal.');
      }
    } else {
      console.log('--force: lewati runtime scope guard.');
    }

    if (opts?.commit) {
      const cwd = opts?.dir ?? process.cwd();
      try {
        const taskCtx = await api.context(cfg, taskId);
        const match = taskCtx.markdown.match(/^###\s*\[TASK\s*(\d+)\]\s*(.+)$/m);
        const order = match ? Number(match[1]) : undefined;
        const title = match ? match[2].trim() : 'Selesaikan task';
        const layerMatch = taskCtx.markdown.match(/\*\*Layer\*\*:\s*([A-Za-z0-9_]+)/i);
        const layer = layerMatch ? layerMatch[1] : (taskCtx.guard?.layer ?? 'feat');

        const commitMessage = generateConventionalCommit({ title, layer, order });
        console.log(`\nMenjalankan git commit otomatis:`);
        console.log(`> ${commitMessage.split('\n')[0]}`);
        const commitOut = await gitCommit(commitMessage, cwd);
        if (commitOut) console.log(commitOut);
        console.log('Berhasil membuat commit git.');
      } catch (commitErr: any) {
        console.warn(`Peringatan: Git commit otomatis gagal: ${commitErr?.message ?? commitErr}`);
      }
    }

    const r = await api.done(cfg, taskId, { outputSummary: opts?.summary });
    console.log(`Task ${r.taskId} -> ${r.status}`);
    if (r.checkpointPending) {
      console.log(`\n!!! CHECKPOINT PENDING !!!`);
      console.log(`Layer ${r.layer} selesai. Berhenti dan minta approval user sebelum lanjut ke layer berikutnya.`);
    } else {
      console.log(`-> Lanjut: numa next`);
    }
  });

program
  .command('prd')
  .description('Tampilkan PRD project dalam format Markdown.')
  .action(async () => {
    const cfg = loadConfig();
    if (!cfg.token) {
      console.error('Belum login. Jalankan: numa login <token>');
      process.exit(1);
    }
    if (!(await ensureActiveProject(cfg))) {
      process.exit(1);
    }
    try {
      const r = await api.prd(cfg);
      const prdObj = r.prd ?? r.brd;
      if (!prdObj) {
        throw new ApiError('PRD belum ada di project ini. Generate PRD dulu lewat web UI.', 400);
      }
      const rendered = formatPrdMarkdown(prdObj.content, prdObj);
      console.log(rendered);
    } catch (e) {
      if (e instanceof ApiError) {
        console.error(`Error [${e.status}]: ${e.message}`);
      } else {
        console.error('Error:', e instanceof Error ? e.message : e);
      }
      process.exit(1);
    }
  });

program
  .command('logout')
  .description('Hapus token lokal.')
  .action(() => {
    clearConfig();
    console.log('Token dihapus.');
  });

program
  .command('status')
  .description('Cek koneksi server dan status token.')
  .action(async () => {
    const cfg = loadConfig();
    const healthy = await probeHealth(cfg);
    console.log(`Server : ${cfg.apiUrl} -> ${healthy ? 'OK' : 'TIDAK TERHUBUNG'}`);
    console.log(`Token  : ${cfg.token ? 'tersimpan' : 'kosong'}`);
    if (cfg.activeTaskId) console.log(`Active : ${cfg.activeTaskId}`);
    if (cfg.projectId) console.log(`Project: ${cfg.projectId}`);
  });

program
  .command('init')
  .description('Pasang skill pack numa dan kontrak arsitektur proyek ke workspace.')
  .option('--dir <path>', 'Direktori target workspace (default: direktori saat ini)')
  .option('--force', 'Paksa timpa file konfigurasi yang sudah ada')
  .action(async (opts: { dir?: string; force?: boolean }) => {
    try {
      const cfg = loadConfig();
      const targetDir = path.resolve(opts.dir || process.cwd());

      console.log(`Memasang skill pack numa di: ${targetDir}`);

      // 1. Fetch kontrak arsitektur dari API
      console.log('Mengambil kontrak arsitektur dari server...');
      const contract = await api.architectureContract(cfg);

      // 2. Siapkan folder .claude/skills/
      const skillsTargetDir = path.join(targetDir, '.claude', 'skills');
      fs.mkdirSync(skillsTargetDir, { recursive: true });

      // Salin 4 bundled skills
      const bundledSkillsDir = path.resolve(__dirname, '../skills');
      const staticSkills = [
        { file: 'test-driven-development.md', name: 'numa-tdd' },
        { file: 'incremental-implementation.md', name: 'numa-incremental' },
        { file: 'api-and-interface-design.md', name: 'numa-api-design' },
        { file: 'security-and-hardening.md', name: 'numa-security' },
      ];

      for (const s of staticSkills) {
        const srcPath = path.join(bundledSkillsDir, s.file);
        const destSkillDir = path.join(skillsTargetDir, s.name);
        fs.mkdirSync(destSkillDir, { recursive: true });
        const destPath = path.join(destSkillDir, 'SKILL.md');
        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, destPath);
        }
      }

      // Tulis dynamic architecture contract skill
      const archSkillDir = path.join(skillsTargetDir, 'numa-architecture');
      fs.mkdirSync(archSkillDir, { recursive: true });
      const archSkillContent = `---
name: numa-architecture
description: Kontrak arsitektur wajib untuk framework ${contract.framework}.
---

${contract.markdown}
`;
      fs.writeFileSync(path.join(archSkillDir, 'SKILL.md'), archSkillContent, 'utf-8');

      // 3. Tambahkan ke AGENTS.md
      const agentsPath = path.join(targetDir, 'AGENTS.md');
      const markerBegin = '<!-- numa:begin -->';
      const markerEnd = '<!-- numa:end -->';
      const agentsBlock = `\n${markerBegin}
# Pedoman Rekayasa & Kontrak Arsitektur Numa

Proyek ini menggunakan standar arsitektur dan skill pack Numa:
- Kontrak Arsitektur: .claude/skills/numa-architecture/SKILL.md (${contract.title})
- Test-Driven Development: .claude/skills/numa-tdd/SKILL.md
- Implementasi Bertahap: .claude/skills/numa-incremental/SKILL.md
- Desain API: .claude/skills/numa-api-design/SKILL.md
- Pengerasan Keamanan: .claude/skills/numa-security/SKILL.md

Patuhi seluruh Acceptance Criteria dan aturan layering sebelum menjalankan \`numa done\`.
${markerEnd}\n`;

      if (fs.existsSync(agentsPath)) {
        const content = fs.readFileSync(agentsPath, 'utf-8');
        if (content.includes(markerBegin)) {
          if (opts.force) {
            const regex = new RegExp(`${markerBegin}[\\s\\S]*?${markerEnd}`, 'g');
            const updated = content.replace(regex, agentsBlock.trim());
            fs.writeFileSync(agentsPath, updated, 'utf-8');
            console.log('AGENTS.md diperbarui dengan blok Numa terbaru.');
          } else {
            console.log('AGENTS.md sudah memuat konfigurasi Numa (gunakan --force untuk menimpa).');
          }
        } else {
          fs.appendFileSync(agentsPath, agentsBlock, 'utf-8');
          console.log('Blok Numa ditambahkan ke AGENTS.md.');
        }
      } else {
        fs.writeFileSync(agentsPath, `# AGENTS.md\n${agentsBlock}`, 'utf-8');
        console.log('File AGENTS.md dibuat dengan konfigurasi Numa.');
      }

      console.log('Berhasil memasang skill pack Numa dan kontrak arsitektur.');
    } catch (e) {
      if (e instanceof ApiError) {
        console.error(`Error [${e.status}]: ${e.message}`);
      } else {
        console.error('Error:', e instanceof Error ? e.message : e);
      }
      process.exit(1);
    }
  });

program
  .command('sync')
  .description('Kumpulkan ringkasan workspace (file tree dan manifest) dan kirim ke server.')
  .option('--dir <path>', 'Direktori workspace (default: direktori saat ini)')
  .action(async (opts: { dir?: string }) => {
    try {
      const cfg = loadConfig();
      const targetDir = path.resolve(opts.dir || process.cwd());
      console.log(`Mengumpulkan ringkasan workspace: ${targetDir}`);

      // 1. Recursive file tree walk (skip ignored dirs, max depth 6, max 800 files)
      const ignoredDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'vendor', 'coverage', '.numa', '.claude']);
      const files: string[] = [];

      function walk(current: string, depth: number) {
        if (depth > 6 || files.length >= 800) return;
        try {
          const entries = fs.readdirSync(current, { withFileTypes: true });
          for (const ent of entries) {
            if (ent.isDirectory()) {
              if (!ignoredDirs.has(ent.name) && !ent.name.startsWith('.')) {
                walk(path.join(current, ent.name), depth + 1);
              }
            } else if (ent.isFile()) {
              const rel = path.relative(targetDir, path.join(current, ent.name));
              files.push(rel);
              if (files.length >= 800) break;
            }
          }
        } catch {
          // Abaikan folder yang tidak bisa dibaca
        }
      }

      walk(targetDir, 0);

      // 2. Kumpulkan manifests penting (maks 25KB per file)
      const manifestNames = [
        'package.json',
        'composer.json',
        'prisma/schema.prisma',
        'tsconfig.json',
        '.env.example',
        'README.md',
      ];
      const manifests: Record<string, string> = {};

      for (const m of manifestNames) {
        const full = path.join(targetDir, m);
        if (fs.existsSync(full)) {
          try {
            const stat = fs.statSync(full);
            if (stat.size <= 25000) {
              manifests[m] = fs.readFileSync(full, 'utf-8');
            } else {
              manifests[m] = fs.readFileSync(full, 'utf-8').slice(0, 20000) + '\n...[dipotong]';
            }
          } catch {
            // skip
          }
        }
      }

      const summary = {
        generatedAt: new Date().toISOString(),
        fileCount: files.length,
        files: files.slice(0, 800),
        manifests,
        stats: {
          totalFiles: files.length,
          hasPackageJson: !!manifests['package.json'],
          hasComposerJson: !!manifests['composer.json'],
          hasPrisma: !!manifests['prisma/schema.prisma'],
        },
      };

      console.log(`Mengirim ringkasan (${files.length} berkas terindeks) ke server...`);
      const res = await api.saveRepoSummary(cfg, summary);
      console.log(`Ringkasan workspace berhasil disimpan di server (waktu: ${res.savedAt}).`);
    } catch (e) {
      if (e instanceof ApiError) {
        console.error(`Error [${e.status}]: ${e.message}`);
      } else {
        console.error('Error:', e instanceof Error ? e.message : e);
      }
      process.exit(1);
    }
  });

program.parseAsync(process.argv).catch((e) => {
  if (e instanceof ApiError) {
    console.error(`Error [${e.status}]: ${e.message}`);
    if (e.status === 401) {
      console.error('Token ditolak. Coba: numa login <token>');
    }
  } else {
    console.error('Error:', e instanceof Error ? e.message : e);
  }
  process.exit(1);
});
