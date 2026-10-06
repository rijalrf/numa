// Logic command `sync` — kumpulkan ringkasan workspace (file tree + manifest) lalu kirim ke server.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { api, ApiError } from '../api-client.js';

// Walk rekursif file tree (skip ignored dirs, maks depth 6, maks 800 file).
function walkFiles(targetDir: string): string[] {
  const ignoredDirs = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    'vendor',
    'coverage',
    '.numa',
    '.claude',
    '.agents',
  ]);
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
  return files;
}

// Kumpulkan manifest penting (maks 25KB per file).
function collectManifests(targetDir: string): Record<string, string> {
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

  return manifests;
}

export async function runSync(opts: { dir?: string }): Promise<void> {
  try {
    const cfg = loadConfig();
    const targetDir = path.resolve(opts.dir || process.cwd());
    console.log(`Mengumpulkan ringkasan workspace: ${targetDir}`);

    // 1. Recursive file tree walk
    const files = walkFiles(targetDir);

    // 2. Kumpulkan manifests penting
    const manifests = collectManifests(targetDir);

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
}
