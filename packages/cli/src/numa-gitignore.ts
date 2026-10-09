// .numa/.gitignore: berkas runtime lokal (state, konteks galat, screenshot pemeriksaan tampilan) tidak ikut ter-commit.
import fs from 'node:fs';
import path from 'node:path';

const IGNORED = ['state.json', 'failure-context.json', 'screenshots/'];

/** Pastikan .gitignore di folder .numa memuat semua entri; entri yang sudah ada dipertahankan. */
export function ensureNumaGitignore(numaDir: string): void {
  const file = path.join(numaDir, '.gitignore');
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
  const have = new Set(existing.split('\n').map((l) => l.trim()));
  const missing = IGNORED.filter((e) => !have.has(e));
  if (missing.length === 0) return;
  const prefix = existing === '' || existing.endsWith('\n') ? existing : `${existing}\n`;
  fs.writeFileSync(file, `${prefix}${missing.join('\n')}\n`, 'utf-8');
}
