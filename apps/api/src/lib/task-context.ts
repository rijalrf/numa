// Penyusun konteks per task untuk `numa context`. Fungsi murni (tanpa database) agar mudah diuji.
// Prinsip: agent hanya menerima konteks yang relevan dengan task-nya (requirement, endpoint, model data),
// berikut kondisi repo yang nyata (file hasil task selesai) dan ringkasan kontrak arsitektur.
import type { ProductSpec } from './ai/product-spec.js';
import type { ArchitectureContract } from './ai/architecture-contract.js';

export type RequirementDetail = { id: string; text: string };

export type ContextEndpoint = {
  method?: string;
  path?: string;
  description?: string;
  requestBody?: string;
  responseBody?: string;
  requirementIds?: string[];
};

export type ContextEntity = ProductSpec['entities'][number];

const BLOCK_MAX_CHARS = 700;
const ITEM_START = /^(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+)?\*{0,2}((?:FR|PR|BR|EC)-\d{3})\b/;
const TABLE_START = /^\|\s*\*{0,2}((?:FR|PR|BR|EC)-\d{3})\b/;
const STRUCTURAL = /^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|\|)/;

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function cleanBlock(lines: string[]): string {
  const text = lines
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > BLOCK_MAX_CHARS ? `${text.slice(0, BLOCK_MAX_CHARS - 3)}...` : text;
}

/**
 * Memecah markdown PRD menjadi blok per ID (FR/PR/BR/EC): baris pembuka dan sub-butir/lanjutan di bawahnya
 * sampai butir berikutnya. Hanya baris yang DIAWALI ID yang membuka blok, bukan baris yang sekadar menyebut ID.
 */
export function extractRequirementBlocks(markdown: string): Map<string, string> {
  const blocks = new Map<string, string>();
  const lines = markdown.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const start = trimmed.match(ITEM_START) ?? trimmed.match(TABLE_START);
    if (!start) continue;
    const id = start[1];
    if (blocks.has(id)) continue;

    const baseIndent = indentOf(lines[i]);
    const collected = [trimmed.replace(/^(?:#{1,6}\s+)/, '')];

    if (!trimmed.startsWith('|')) {
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j];
        const nextTrim = next.trim();
        if (!nextTrim) {
          // Baris kosong hanya diteruskan bila butir berikutnya masih menjorok lebih dalam (sub-butir).
          const peek = lines.slice(j + 1).find((l) => l.trim());
          if (peek && indentOf(peek) > baseIndent && !ITEM_START.test(peek.trim())) continue;
          break;
        }
        if (ITEM_START.test(nextTrim) || TABLE_START.test(nextTrim)) break;
        if (/^#{1,6}\s/.test(nextTrim)) break;
        if (indentOf(next) <= baseIndent && STRUCTURAL.test(nextTrim)) break;
        collected.push(nextTrim);
      }
    }
    blocks.set(id, cleanBlock(collected));
  }
  return blocks;
}

export type RequirementContextInput = {
  ids: string[];
  markdown: string;
  requirementIndex: Array<{ id: string; title: string }>;
  rules: Array<{ id: string; description: string }>;
  journeys: ProductSpec['journeys'];
};

export type RequirementContext = {
  requirements: RequirementDetail[];
  edgeCases: RequirementDetail[];
  journeys: Array<{ name: string; steps: string[] }>;
};

/** Detail requirement milik task: deskripsi penuh, edge case yang menyebut requirement itu, dan journey terkait. */
export function buildRequirementContext(input: RequirementContextInput): RequirementContext {
  const idSet = new Set(input.ids);
  const blocks = extractRequirementBlocks(input.markdown);
  const ruleById = new Map(input.rules.map((r) => [r.id, r.description]));
  const titleById = new Map(input.requirementIndex.map((r) => [r.id, r.title]));

  const requirements: RequirementDetail[] = [];
  for (const id of input.ids) {
    const text = blocks.get(id) ?? ruleById.get(id) ?? titleById.get(id);
    if (text) requirements.push({ id, text });
  }

  const edgeCases: RequirementDetail[] = [];
  for (const [id, text] of blocks) {
    if (!id.startsWith('EC-')) continue;
    if ([...idSet].some((rid) => new RegExp(`\\b${rid}\\b`).test(text))) edgeCases.push({ id, text });
  }

  const journeys = input.journeys
    .filter((j) => j.requirementIds.some((rid) => idSet.has(rid)))
    .map((j) => ({ name: j.name, steps: j.steps }));

  return { requirements, edgeCases, journeys };
}

// === Filter endpoint dan model data per task ===

/** Teks pencarian relevansi: judul, deskripsi, langkah, AC, dan path file task. */
export function buildTaskHaystack(parts: Array<string | string[] | undefined | null>): string {
  return parts
    .flatMap((p) => (Array.isArray(p) ? p : [p]))
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .join(' ')
    .toLowerCase();
}

const resourceSegment = (path: string): string[] =>
  path
    .split('/')
    .filter((s) => s && s !== 'api' && !s.startsWith(':') && !s.startsWith('{') && !/^v\d+$/.test(s))
    .map((s) => s.toLowerCase());

const singular = (w: string) => (w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.endsWith('s') ? w.slice(0, -1) : w);

function mentions(haystack: string, word: string): boolean {
  const w = word.toLowerCase();
  return w.length >= 3 && (haystack.includes(w) || haystack.includes(singular(w)));
}

export type EndpointSelection = {
  endpoints: ContextEndpoint[];
  /** Jumlah endpoint total di sumber, untuk catatan "ada N endpoint lain". */
  total: number;
};

/**
 * Memilih endpoint yang relevan: kontrak milik task sendiri, endpoint yang dipanggil (consumesApis),
 * endpoint PRD yang melayani requirement task, lalu kecocokan nama resource pada teks task.
 * Kontrak aktual dari task selesai menggantikan kontrak PRD untuk method+path yang sama.
 */
export function selectEndpoints(args: {
  requirementIds: string[];
  haystack: string;
  own: ContextEndpoint[];
  consumes: ContextEndpoint[];
  completed: ContextEndpoint[];
  spec: ContextEndpoint[];
  limit?: number;
}): EndpointSelection {
  const key = (e: ContextEndpoint) => `${(e.method ?? '').toUpperCase()} ${e.path ?? ''}`;
  const idSet = new Set(args.requirementIds);

  const actual = new Map(args.completed.filter((e) => e.method && e.path).map((e) => [key(e), e]));
  const pool = new Map<string, ContextEndpoint>();
  for (const e of args.spec) pool.set(key(e), e);
  // Kontrak aktual menang untuk isi, tetapi requirementIds dari PRD dipertahankan agar tetap cocok ke requirement.
  for (const [k, e] of actual) {
    const planned = pool.get(k);
    pool.set(k, { ...planned, ...e, requirementIds: e.requirementIds?.length ? e.requirementIds : planned?.requirementIds });
  }

  const picked = new Map<string, ContextEndpoint>();
  const add = (e: ContextEndpoint) => {
    if (!e.method || !e.path) return;
    const k = key(e);
    picked.set(k, pool.get(k) ?? e);
  };

  args.own.forEach(add);
  args.consumes.forEach(add);
  for (const e of pool.values()) {
    if ((e.requirementIds ?? []).some((rid) => idSet.has(rid))) add(e);
  }
  if (picked.size === 0) {
    for (const e of pool.values()) {
      if (resourceSegment(e.path ?? '').some((seg) => mentions(args.haystack, seg))) add(e);
    }
  }

  const limit = args.limit ?? 15;
  return { endpoints: [...picked.values()].slice(0, limit), total: pool.size };
}

export type EntitySelection = { entities: ContextEntity[]; total: number; fallback: boolean };

/**
 * Memilih model data yang dipakai task: disebut di teks task/requirement, atau menjadi resource endpoint terpilih.
 * Relasi satu langkah ikut disertakan. Task DATABASE/BACKEND tanpa kecocokan jatuh ke seluruh model (dibatasi),
 * layer lain tanpa kecocokan tidak menampilkan model.
 */
export function selectEntities(args: {
  layer: string;
  entities: ContextEntity[];
  haystack: string;
  endpoints: ContextEndpoint[];
  limit?: number;
}): EntitySelection {
  const limit = args.limit ?? 6;
  const endpointText = args.endpoints
    .map((e) => `${e.path ?? ''} ${e.description ?? ''} ${e.requestBody ?? ''} ${e.responseBody ?? ''}`)
    .join(' ')
    .toLowerCase();
  const text = `${args.haystack} ${endpointText}`;

  const direct = args.entities.filter((e) => mentions(text, e.name));
  const byName = new Map(args.entities.map((e) => [e.name.toLowerCase(), e]));
  const related = new Map<string, ContextEntity>();
  for (const e of direct) related.set(e.name, e);
  for (const e of direct) {
    for (const rel of e.relations) {
      const target = byName.get(rel.split(/[\s:(]/)[0]?.toLowerCase() ?? '');
      if (target) related.set(target.name, target);
    }
  }

  if (related.size > 0) {
    return { entities: [...related.values()].slice(0, limit), total: args.entities.length, fallback: false };
  }
  if (args.layer === 'DATABASE' || args.layer === 'BACKEND') {
    return { entities: args.entities.slice(0, limit), total: args.entities.length, fallback: true };
  }
  return { entities: [], total: args.entities.length, fallback: false };
}

// === File nyata dari task selesai ===

const NOISE_FILE = /(^|\/)(node_modules|dist|build|\.next|\.git|coverage)\//;
const LOCK_FILE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|composer\.lock|bun\.lockb?)$/;

export type ActualFiles = {
  files: string[];
  total: number;
  /** true bila daftar berasal dari rencana (belum ada laporan guard), bukan dari kondisi repo. */
  planned: boolean;
};

/**
 * Daftar file proyek saat ini. Sumber utama: `changedFiles` dari laporan guard task DONE (kondisi nyata di repo).
 * Bila tak ada laporan guard sama sekali (mis. task selesai dengan --force), jatuh ke `files_to_create` rencana.
 * Urutan: file yang disebut task ini lebih dulu, lalu yang satu direktori dengannya, lalu sisanya.
 */
export function selectProjectFiles(args: {
  completed: Array<{ changedFiles?: string[]; plannedFiles?: string[] }>;
  taskFiles: string[];
  limit?: number;
}): ActualFiles {
  const limit = args.limit ?? 40;
  const actual = args.completed.flatMap((t) => t.changedFiles ?? []);
  const planned = actual.length === 0;
  const source = planned ? args.completed.flatMap((t) => t.plannedFiles ?? []) : actual;

  const unique = [...new Set(source)].filter((f) => !NOISE_FILE.test(f) && !LOCK_FILE.test(f));
  const taskSet = new Set(args.taskFiles);
  const taskDirs = new Set(args.taskFiles.map((f) => f.split('/').slice(0, -1).join('/')).filter(Boolean));
  const rank = (f: string) => (taskSet.has(f) ? 0 : taskDirs.has(f.split('/').slice(0, -1).join('/')) ? 1 : 2);

  const sorted = unique
    .map((f, idx) => ({ f, idx, r: rank(f) }))
    .sort((a, b) => a.r - b.r || a.idx - b.idx)
    .map((x) => x.f);
  return { files: sorted.slice(0, limit), total: unique.length, planned };
}

// === Ringkasan kontrak arsitektur ===

/** Ringkasan pendek kontrak arsitektur: lapisan, larangan, dan format error. Versi lengkap lewat endpoint kontrak. */
export function summarizeArchitecture(contract: ArchitectureContract): string[] {
  const layers = contract.layeringRules.map((r) => r.replace(/^\d+\.\s*/, '').split(':')[0].trim());
  return [
    `Kontrak: ${contract.title}`,
    `Lapisan: ${layers.join(' -> ')}`,
    ...contract.forbidden.map((f) => `Larangan: ${f}`),
    ...contract.errorHandling.slice(0, 1).map((e) => `Error: ${e}`),
  ];
}
