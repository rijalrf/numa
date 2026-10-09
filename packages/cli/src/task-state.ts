// State lokal task aktif di workspace: .numa/state.json (diabaikan git).
// Menyimpan baseline saat `numa start` agar guard hanya menilai perubahan sejak task dimulai.
import fs from 'node:fs';
import { ensureNumaGitignore } from './numa-gitignore.js';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { findWorkspaceRoot } from './config.js';

export type TaskState = {
  taskId: string;
  startedAt: string;
  /** SHA HEAD saat task dimulai; null bila bukan repo git atau belum ada commit. */
  baselineSha: string | null;
  /** Hash isi file yang sudah kotor sebelum task dimulai (path -> hash). */
  dirtyAtStart: Record<string, string>;
};

const MAX_HASHED_FILES = 500;

function git(cwd: string, args: string[]): { ok: boolean; out: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim() };
}

export function stateFile(workDir: string): string {
  const root = findWorkspaceRoot(workDir) ?? path.resolve(workDir);
  return path.join(root, '.numa', 'state.json');
}

export function listDirtyFiles(cwd: string): string[] {
  const r = spawnSync('git', ['status', '--porcelain', '--untracked-files=all', '-z'], { cwd, encoding: 'utf-8' });
  if (r.status !== 0) return [];
  const parts = (r.stdout ?? '').split('\0').filter(Boolean);
  const files: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    const code = entry.slice(0, 2);
    files.push(entry.slice(3));
    // Rename/copy: entri berikutnya adalah path asal, lewati.
    if (code[0] === 'R' || code[0] === 'C') i += 1;
  }
  return files;
}

export function hashFile(cwd: string, file: string): string {
  const r = git(cwd, ['hash-object', '--', file]);
  return r.ok ? r.out : 'missing';
}

export function captureTaskState(taskId: string, workDir: string): TaskState {
  const head = git(workDir, ['rev-parse', 'HEAD']);
  const dirty = listDirtyFiles(workDir);
  const dirtyAtStart: Record<string, string> = {};
  if (dirty.length <= MAX_HASHED_FILES) {
    for (const f of dirty) dirtyAtStart[f] = hashFile(workDir, f);
  }
  return {
    taskId,
    startedAt: new Date().toISOString(),
    baselineSha: head.ok ? head.out : null,
    dirtyAtStart,
  };
}

export function saveTaskState(workDir: string, state: TaskState): void {
  const file = stateFile(workDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf-8');
  ensureNumaGitignore(path.dirname(file));
}

export function loadTaskState(workDir: string, taskId: string): TaskState | null {
  try {
    const state = JSON.parse(fs.readFileSync(stateFile(workDir), 'utf-8')) as TaskState;
    return state.taskId === taskId ? state : null;
  } catch {
    return null;
  }
}

/**
 * File yang berubah sejak task dimulai: perubahan di worktree + commit setelah baseline,
 * dikurangi file yang sudah kotor sejak awal dan isinya tidak berubah.
 */
export function changedSinceStart(workDir: string, state: TaskState | null): string[] {
  const changed = new Set<string>(listDirtyFiles(workDir));

  if (state?.baselineSha) {
    const r = spawnSync('git', ['diff', '--name-only', '-z', state.baselineSha, 'HEAD'], { cwd: workDir, encoding: 'utf-8' });
    if (r.status === 0) {
      for (const f of (r.stdout ?? '').split('\0').filter(Boolean)) changed.add(f);
    }
  }

  if (!state) return [...changed];
  return [...changed].filter((f) => {
    const before = state.dirtyAtStart[f];
    return before === undefined || before !== hashFile(workDir, f);
  });
}
