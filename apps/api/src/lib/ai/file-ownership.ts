// Kepemilikan file antar task: satu file hanya boleh dibuat (files_to_create) oleh satu task.
// Pembuat kedua diubah menjadi modifikasi dan diberi depends_on ke pemilik. Deterministik, tanpa AI.
import type { TaskGen } from './tasks.js';
import type { Finding } from './validation-report.js';
import { isFoundationTask } from './design-baseline.js';
import { findSharedFile, normalizeFilePath, type UiShellContract } from './ui-shell-contract.js';

export type OwnershipResult = { tasks: TaskGen[]; findings: Finding[] };

/** Task yang berhak memiliki file bersama menurut kontrak: layer pemilik, bukan sekadar urutan. */
function matchesOwnerRole(task: TaskGen, owner: 'BOOTSTRAP' | 'FONDASI_UI' | 'BACKEND'): boolean {
  if (owner === 'FONDASI_UI') return isFoundationTask(task);
  return task.layer === owner;
}

/**
 * Pastikan satu file hanya dibuat satu task.
 * - Pemilik file bersama (kontrak UI shell) adalah task berlayer pemilik yang membuat file itu; selain itu pembuat pertama
 *   menurut urutan global.
 * - `existingFiles` (file dari task yang sudah selesai, dipakai siklus perubahan) dianggap sudah dimiliki: task baru yang
 *   membuatnya diubah menjadi modifikasi tanpa depends_on.
 */
export function enforceFileOwnership(
  tasks: TaskGen[],
  opts: { contract?: UiShellContract; existingFiles?: string[] } = {},
): OwnershipResult {
  const findings: Finding[] = [];
  const existing = new Set((opts.existingFiles ?? []).map(normalizeFilePath));
  const ordered = [...tasks].sort((a, b) => a.order - b.order);

  const creators = new Map<string, TaskGen[]>();
  for (const t of ordered) {
    for (const raw of t.files_to_create ?? []) {
      const p = normalizeFilePath(raw);
      creators.set(p, [...(creators.get(p) ?? []), t]);
    }
  }

  const ownerOf = new Map<string, TaskGen | null>(); // null = sudah ada sebelum task ini (existing)
  for (const [path, list] of creators) {
    if (existing.has(path)) {
      ownerOf.set(path, null);
      continue;
    }
    const shared = opts.contract ? findSharedFile(opts.contract, path) : undefined;
    const byRole = shared ? list.find((t) => matchesOwnerRole(t, shared.owner)) : undefined;
    ownerOf.set(path, byRole ?? list[0]);
  }

  const patches = new Map<TaskGen, { demoted: string[]; dependsOn: string[] }>();
  for (const [path, list] of creators) {
    const owner = ownerOf.get(path);
    for (const t of list) {
      if (owner === t) continue;
      const patch = patches.get(t) ?? { demoted: [], dependsOn: [] };
      patch.demoted.push(path);
      if (owner && owner.taskId) patch.dependsOn.push(owner.taskId);
      patches.set(t, patch);
      const ownerText = owner ? `task ${owner.taskId ?? owner.title}` : 'task yang sudah selesai';
      findings.push({
        code: 'FILE_CREATE_DUPLICATE',
        severity: 'warning',
        message: `File ${path} dibuat oleh lebih dari satu task. Task "${t.title}" diubah menjadi memodifikasi file itu (pemilik: ${ownerText}).`,
        refs: [path],
      });
    }
  }

  const result = tasks.map((t) => {
    const patch = patches.get(t);
    if (!patch) return t;
    const demoted = new Set(patch.demoted);
    const toModify = [...(t.files_to_modify ?? [])];
    for (const p of patch.demoted) if (!toModify.map(normalizeFilePath).includes(p)) toModify.push(p);
    const deps = [...(t.depends_on ?? [])];
    for (const d of patch.dependsOn) if (d !== t.taskId && !deps.includes(d)) deps.push(d);
    return {
      ...t,
      files_to_create: (t.files_to_create ?? []).filter((p) => !demoted.has(normalizeFilePath(p))),
      files_to_modify: toModify,
      depends_on: deps,
    };
  });
  return { tasks: result, findings };
}

const SIMILAR_STRIP = /\.(schema|validation|validations|types?|dto)$/;
// Modal dan dialog sengaja tidak masuk: modal berbeda per fitur (ProductFormModal dan StockAdjustModal) adalah hal wajar.
const DUPLICATE_PRONE_WORDS = ['banner', 'toast', 'provider'];

function stemOf(path: string): { dir: string; stem: string; base: string } {
  const p = normalizeFilePath(path);
  const slash = p.lastIndexOf('/');
  const dir = slash >= 0 ? p.slice(0, slash) : '';
  const file = slash >= 0 ? p.slice(slash + 1) : p;
  const base = file.replace(/\.[^.]+$/, '');
  return { dir, stem: base.toLowerCase().replace(SIMILAR_STRIP, ''), base };
}

function lastWord(pascal: string): string {
  const m = pascal.match(/[A-Z][a-z0-9]*$/);
  return (m?.[0] ?? '').toLowerCase();
}

/** Nama file yang mirip di folder yang sama (auth.ts dan auth.schema.ts, AlertBanner dan ErrorBanner): hanya info. */
export function findSimilarFileNames(tasks: TaskGen[]): Finding[] {
  const files = [...new Set(tasks.flatMap((t) => (t.files_to_create ?? []).map(normalizeFilePath)))];
  const byDir = new Map<string, string[]>();
  for (const f of files) {
    const { dir } = stemOf(f);
    byDir.set(dir, [...(byDir.get(dir) ?? []), f]);
  }

  const findings: Finding[] = [];
  for (const [dir, list] of byDir) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = stemOf(list[i]);
        const b = stemOf(list[j]);
        const sameStem = a.stem === b.stem && a.base !== b.base;
        const wa = lastWord(a.base);
        const sameProneWord = /(^|\/)components(\/|$)/.test(dir) && wa !== '' && wa === lastWord(b.base) && DUPLICATE_PRONE_WORDS.includes(wa) && a.base !== b.base;
        if (sameStem || sameProneWord) {
          findings.push({
            code: 'FILE_NAME_SIMILAR',
            severity: 'info',
            message: `File ${list[i]} dan ${list[j]} bernama mirip di folder yang sama; periksa apakah fungsinya ganda.`,
            refs: [list[i], list[j]],
          });
        }
      }
    }
  }
  return findings;
}
