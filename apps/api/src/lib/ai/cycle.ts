// Modul analisis dampak perubahan, klarifikasi, dan perakitan delta PRD/spec untuk Change Cycle Numa
import { z } from 'zod';
import { generateJson } from './ai-service.js';
import { SurveyQuestionItemSchema } from '../survey.js';
import { readPrdContent, type PrdDoc } from './prd.js';
import { SpecEntitySchema, SpecEndpointSchema, SpecJourneySchema, type ProductSpec } from './product-spec.js';
import { PROMPT_VERSIONS } from './prompts.js';

/** Jumlah maksimal putaran jawaban klarifikasi; setelah itu analisis dipaksa CLEAR. */
export const MAX_CLARIFY_ROUNDS = 2;

/** Tambahan spec terstruktur dari sebuah perubahan (hanya entitas, endpoint, dan journey yang baru atau berubah). */
export const SpecDeltaSchema = z.object({
  entities: z.array(SpecEntitySchema).default([]),
  endpoints: z.array(SpecEndpointSchema).default([]),
  journeys: z.array(SpecJourneySchema).default([]),
});

export type SpecDelta = z.infer<typeof SpecDeltaSchema>;

const stringArray = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

export const ImpactSchema = z.object({
  clarity: z
    .preprocess((v) => (typeof v === 'string' && v.toUpperCase() === 'VAGUE' ? 'VAGUE' : 'CLEAR'), z.enum(['CLEAR', 'VAGUE']))
    .default('CLEAR'),
  clarificationQuestions: z
    .preprocess((v) => (Array.isArray(v) && v.length > 0 ? v : undefined), z.array(SurveyQuestionItemSchema).optional())
    .nullable()
    .optional(),
  type: z
    .preprocess((v) => (typeof v === 'string' ? v.toUpperCase() : 'FEATURE'), z.enum(['FEATURE', 'BUGFIX', 'REFACTOR', 'MIXED']))
    .default('FEATURE'),
  size: z
    .preprocess((v) => (typeof v === 'string' ? v.toUpperCase() : 'SMALL'), z.enum(['SMALL', 'MEDIUM', 'LARGE']))
    .default('SMALL'),
  summary: z.preprocess((val) => (typeof val === 'string' && val.trim() ? val : 'Perubahan sistem'), z.string()).default('Perubahan sistem'),
  impactedFiles: z.preprocess(stringArray, z.array(z.string())).default([]),
  impactedPrd: z.preprocess(stringArray, z.array(z.string())).default([]),
  impactedTree: z.preprocess(stringArray, z.array(z.string())).default([]),
  /** ID fitur roadmap (database) yang kodenya terdampak; sudah dipetakan dari label F1..Fn dan disaring. */
  impactedFeatureIds: z.preprocess(stringArray, z.array(z.string())).default([]),
  needsPrdChange: z
    .preprocess((val) => (typeof val === 'boolean' ? val : val === 'true' || val === 1), z.boolean())
    .default(false),
  prdChangeSummary: z
    .preprocess((v) => (typeof v === 'string' && v.trim() ? v : undefined), z.string().optional())
    .nullable()
    .optional(),
  newRequirements: z
    .preprocess(
      (v) => (Array.isArray(v) ? v : []),
      z.array(
        z.object({
          id: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v : 'NEW-1'), z.string()).default('NEW-1'),
          title: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v : 'Perubahan fitur'), z.string()).default('Perubahan fitur'),
          description: z.preprocess((v) => (typeof v === 'string' ? v : String(v ?? '')), z.string()).default(''),
          priority: z.preprocess((val) => {
            if (typeof val === 'string') {
              const up = val.toUpperCase().trim();
              if (up === 'MUST' || up === 'CRITICAL') return 'HIGH';
              if (up === 'SHOULD') return 'MEDIUM';
              if (up === 'COULD' || up === 'WONT') return 'LOW';
              if (['HIGH', 'MEDIUM', 'LOW'].includes(up)) return up;
            }
            return 'MEDIUM';
          }, z.enum(['HIGH', 'MEDIUM', 'LOW']).default('MEDIUM')),
        })
      )
    )
    .default([]),
  /** Tambahan spec; bentuk yang tidak valid dibuang (undefined) agar analisis tidak gagal total. */
  specDelta: z
    .preprocess((v) => {
      const parsed = SpecDeltaSchema.safeParse(v);
      return parsed.success ? parsed.data : undefined;
    }, SpecDeltaSchema.optional())
    .nullable()
    .optional(),
  estimatedTasks: z.preprocess((val) => {
    const num = Number(val);
    return Number.isFinite(num) && num >= 1 ? Math.round(num) : 3;
  }, z.number().int().min(1).default(3)),
  splitProposal: z
    .preprocess((v) => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
      return v;
    }, z.object({
      reason: z.preprocess((v) => (typeof v === 'string' ? v : ''), z.string()).default(''),
      partA: z
        .preprocess((v) => (typeof v === 'object' && v !== null ? (v as any).title ?? JSON.stringify(v) : String(v ?? '')), z.string())
        .default(''),
      partB: z
        .preprocess((v) => (typeof v === 'object' && v !== null ? (v as any).title ?? JSON.stringify(v) : String(v ?? '')), z.string())
        .default(''),
    }).optional())
    .nullable()
    .optional(),
});

export type ImpactResult = z.infer<typeof ImpactSchema>;
export type CycleRequirement = ImpactResult['newRequirements'][number];

export type CycleRoadmapFeature = { id: string; title: string; phase: string };
export type CompletedTaskSummary = { title: string; layer: string; files: string[] };

// ---------------------------------------------------------------------------
// Input analisis (fungsi murni)
// ---------------------------------------------------------------------------

const MARKDOWN_FALLBACK_LIMIT = 8000;

/**
 * Konteks PRD ringkas untuk analisis dampak: indeks requirement dan ringkasan spec (nama entitas dan kolom, endpoint,
 * journey). Markdown hanya dipakai bila spec belum ada. Jauh lebih kecil dan tidak terpotong dibanding JSON seluruh PRD.
 */
export function buildCyclePrdContext(prd: PrdDoc | null | undefined): unknown {
  if (!prd) return null;
  const { spec } = prd;
  if (!spec) {
    return { requirements: prd.requirementIndex, markdown: prd.markdown.slice(0, MARKDOWN_FALLBACK_LIMIT) };
  }
  return {
    requirements: prd.requirementIndex,
    rules: spec.rules,
    entities: spec.entities.map((e) => ({ name: e.name, fields: e.fields.map((f) => f.name) })),
    endpoints: spec.endpoints.map((e) => `${e.method} ${e.path}`),
    journeys: spec.journeys.map((j) => j.name),
  };
}

/** Ringkas task DONE (judul, layer, berkas) sebagai ganti ringkasan repo; `tasks` urut naik, yang terbaru dipertahankan. */
export function summarizeCompletedTasks(
  tasks: Array<{ title: string; layer: string; aiContext: unknown }>,
  limit = 60
): CompletedTaskSummary[] {
  return tasks.slice(-limit).map((t) => {
    const ctx = (t.aiContext ?? {}) as { files_to_create?: unknown; files_to_modify?: unknown };
    const files = [...stringArray(ctx.files_to_create), ...stringArray(ctx.files_to_modify)];
    return { title: t.title, layer: t.layer, files: [...new Set(files)].slice(0, 8) };
  });
}

/** Label fitur untuk prompt (F1..Fn); label lebih mudah dipakai AI dibanding ID database yang panjang. */
function featureLabel(index: number): string {
  return `F${index + 1}`;
}

/** Petakan jawaban AI (label F1..Fn atau ID database) ke ID fitur yang dikenal; yang tidak dikenal dibuang. */
export function mapFeatureLabels(raw: string[], features: CycleRoadmapFeature[]): string[] {
  const byLabel = new Map(features.map((f, i) => [featureLabel(i), f.id]));
  const knownIds = new Set(features.map((f) => f.id));
  const result: string[] = [];
  for (const item of raw) {
    const key = item.trim();
    const id = byLabel.get(key.toUpperCase()) ?? (knownIds.has(key) ? key : undefined);
    if (id && !result.includes(id)) result.push(id);
  }
  return result;
}

/**
 * Hasil dipaksa CLEAR (pertanyaan dibuang) bila klarifikasi tidak diizinkan lagi (batas putaran) atau bila AI menilai
 * VAGUE tanpa pertanyaan sama sekali: tanpa pertanyaan, user tidak punya apa pun untuk dijawab dan alur buntu.
 */
export function enforceClarityLimit(impact: ImpactResult, allowClarification: boolean): ImpactResult {
  if (impact.clarity === 'CLEAR') return impact;
  const hasQuestions = (impact.clarificationQuestions?.length ?? 0) > 0;
  if (allowClarification && hasQuestions) return impact;
  return { ...impact, clarity: 'CLEAR', clarificationQuestions: null };
}

export async function analyzeChangeRequest(args: {
  projectId: string;
  request: string;
  prd?: PrdDoc | null;
  repoSummary?: unknown;
  completedTasks?: CompletedTaskSummary[];
  roadmapFeatures?: CycleRoadmapFeature[];
  clarifyAnswers?: Array<{ question: string; answer: string }>;
  /** false = jangan meminta klarifikasi lagi (batas putaran tercapai, atau analisis bagian hasil pemecahan). */
  allowClarification?: boolean;
}): Promise<ImpactResult> {
  const allowClarification = args.allowClarification ?? true;
  const features = args.roadmapFeatures ?? [];

  const clarityRule = allowClarification
    ? `   - Jika permintaan spesifik dan konteksnya jelas (misal: "checkout error saat stok 0", "tambah tombol ekspor data transaksi ke CSV"), set clarity: 'CLEAR'.
   - Jika permintaan sangat kabur, 1-2 kata tanpa konteks teknis (misal: "bikin bagus", "error tolong betulin"), set clarity: 'VAGUE' dan berikan 2-3 clarificationQuestions terarah menggunakan format SurveyQuestionItem (id, label, options 2-4, suggestion).`
    : `   - Klarifikasi TIDAK diizinkan lagi. WAJIB set clarity: 'CLEAR', jangan isi clarificationQuestions. Bila ada yang kurang jelas, ambil tafsir paling wajar dan sebutkan asumsinya di summary.`;

  const system = `Anda adalah Tech Lead senior. Tugas Anda adalah menganalisis permintaan perubahan (Change Request / Cycle) pada aplikasi yang SUDAH memiliki codebase dan task-task awal yang telah selesai dikerjakan.

PRINSIP ANALISIS DAMPAK:
1. Kejelasan (Clarity):
${clarityRule}
2. Klasifikasi (byproduct/label saja):
   - type: 'BUGFIX' jika memperbaiki bug yang ada; 'FEATURE' jika menambah fungsionalitas baru; 'REFACTOR' jika mengubah struktur tanpa fitur baru; 'MIXED' jika campuran.
   - size: 'SMALL' (1-3 task, 1-3 file), 'MEDIUM' (4-6 task), 'LARGE' (>= 7 task).
3. Kebutuhan Perubahan PRD (needsPrdChange):
   - Untuk 'BUGFIX' murni: needsPrdChange HARUS false, newRequirements kosong [], specDelta dihilangkan.
   - Untuk 'FEATURE' atau penambahan aturan bisnis baru: needsPrdChange bernilai true, sertakan prdChangeSummary dan newRequirements.
   - Setiap newRequirements[].id WAJIB berupa penanda sementara NEW-1, NEW-2, dst (berurutan). JANGAN memberi nomor FR sendiri: sistem yang menomori ke FR berikutnya setelah requirement terakhir di PRD. Jangan menduplikasi requirement yang sudah ada di PRD.
4. Pemetaan Dampak (Impact Mapping):
   - impactedFiles: berkas-berkas yang kemungkinan besar perlu diubah (ambil dari ringkasan task selesai dan repoSummary).
   - impactedPrd: ID requirement lama yang terdampak jika ada.
   - impactedTree: nama simpul fitur aplikasi yang tersentuh.
   - impactedFeatureIds: label fitur roadmap (F1, F2, dst, dari bagian FITUR ROADMAP) yang kodenya perlu diubah oleh perubahan ini. Kosongkan [] bila perubahan hanya menambah fitur baru yang tidak menyentuh fitur lama. Jangan mengarang label.
5. Delta Spesifikasi (specDelta), hanya bila needsPrdChange true:
   - Isi HANYA entitas, endpoint, dan journey yang BARU atau BERUBAH akibat perubahan ini, dengan bentuk { entities: [{ name, description?, fields: [{ name, type, required? }], relations: [] }], endpoints: [{ method, path, description, requestBody?, responseBody?, authRequired?, requirementIds: [] }], journeys: [{ name, steps: [], requirementIds: [], kind: 'main' | 'failure', branchFrom?: { journey, stepIndex } }] }.
   - Entitas yang sudah ada dan hanya ditambah kolom: tulis nama entitas yang sama dengan kolom tambahannya saja. Endpoint yang berubah: tulis ulang lengkap dengan method dan path yang sama.
   - requirementIds boleh berisi penanda NEW-n atau ID requirement/edge case yang sudah ada di PRD.
   - Jangan menyalin isi spec lama. Bila tidak ada perubahan entitas, endpoint, atau journey, hilangkan specDelta.
6. Pemecahan Siklus (Split Proposal):
   - Jika perkiraan task >= 8 atau size LARGE, tawarkan usulan pemecahan menjadi 2 siklus berurutan (partA dan partB berupa string teks) dengan alasan teknis rasional.
   - Jika size SMALL atau MEDIUM, hilangkan field splitProposal atau set null.
7. Format Output JSON:
   - summary: Wajib string deskripsi singkat analisis (1-2 kalimat).
   - estimatedTasks: Wajib angka integer minimal 1.
   - newRequirements[].priority: Wajib salah satu dari 'HIGH', 'MEDIUM', atau 'LOW'.
   - clarificationQuestions: Berikan array pertanyaan jika clarity VAGUE, atau abaikan jika CLEAR.

Bahasa Indonesia baku, istilah teknis pemrograman dalam bahasa Inggris, TANPA EMOJI.`;

  const fence = (label: string, data: unknown, limit = 10000) => {
    if (!data) return '';
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    const safe = text.slice(0, limit).replace(/<{3,}/g, '< < <').replace(/>{3,}/g, '> > >');
    return `\n<<<DATA: ${label}>>>\n${safe}\n<<<END DATA: ${label}>>>\n`;
  };

  const clarifyText = args.clarifyAnswers?.length
    ? `\nJAWABAN KLARIFIKASI PENGGUNA SEBELUMNYA:\n${args.clarifyAnswers.map((a) => `- Pertanyaan: ${a.question}\n  Jawaban: ${a.answer}`).join('\n')}\n`
    : '';

  const featuresText = features.length
    ? `\nFITUR ROADMAP (label: judul, fase):\n${features.map((f, i) => `- ${featureLabel(i)}: ${f.title} (${f.phase})`).join('\n')}\n`
    : '';

  const user = `PERMINTAAN PERUBAHAN PENGGUNA:
"${args.request}"
${clarifyText}
${fence('RINGKASAN PRD EKSISTING (requirement, entitas, endpoint, journey)', buildCyclePrdContext(args.prd), 16000)}
${featuresText}
${fence('RINGKASAN WORKSPACE REPO (numa sync)', args.repoSummary)}
${fence('TASK YANG SUDAH SELESAI SEBELUMNYA', args.completedTasks)}

Lakukan analisis mendalam dan kembalikan JSON sesuai schema.`;

  const out = await generateJson({
    system,
    user,
    schema: ImpactSchema,
    tier: 'reasoning',
    agentName: 'ChangeCycleAnalyzer',
    promptVersion: PROMPT_VERSIONS.cycle,
    projectId: args.projectId,
  });

  return enforceClarityLimit({ ...out, impactedFeatureIds: mapFeatureLabels(out.impactedFeatureIds, features) }, allowClarification);
}

// ---------------------------------------------------------------------------
// Merge delta ke PRD dan spec (fungsi murni)
// ---------------------------------------------------------------------------

/** Nomor FR berikutnya: satu di atas FR terbesar yang ada di markdown atau indeks requirement PRD. */
export function nextFunctionalRequirementNumber(prd: PrdDoc): number {
  let max = 0;
  const scan = (text: string) => {
    for (const m of text.matchAll(/\bFR-(\d+)\b/g)) max = Math.max(max, Number(m[1]));
  };
  scan(prd.markdown);
  for (const r of prd.requirementIndex) scan(r.id);
  return max + 1;
}

/**
 * Beri requirement baru nomor FR berurutan mulai `startNumber` (nomor ditetapkan kode, bukan AI).
 * `idMap` memetakan penanda sementara dari AI (NEW-n) ke nomor final, agar rujukan di specDelta ikut diganti.
 * Penanda yang sama dengan ID yang sudah ada di PRD dianggap rujukan ke requirement lama dan tidak dipetakan.
 */
export function assignRequirementIds(
  reqs: CycleRequirement[],
  startNumber: number,
  existingIds: Iterable<string> = []
): { requirements: CycleRequirement[]; idMap: Map<string, string> } {
  const existing = new Set([...existingIds].map((id) => id.trim().toUpperCase()));
  const idMap = new Map<string, string>();
  const requirements = reqs.map((r, i) => {
    const finalId = `FR-${String(startNumber + i).padStart(3, '0')}`;
    const key = r.id.trim().toUpperCase();
    if (!existing.has(key) && !idMap.has(key)) idMap.set(key, finalId);
    return { ...r, id: finalId };
  });
  return { requirements, idMap };
}

function remapIds(ids: string[], idMap: Map<string, string>): string[] {
  return [...new Set(ids.map((id) => idMap.get(id.trim().toUpperCase()) ?? id))];
}

/** Ganti penanda sementara (NEW-n) di requirementIds specDelta dengan nomor FR final. */
export function remapSpecDeltaIds(delta: SpecDelta, idMap: Map<string, string>): SpecDelta {
  return {
    entities: delta.entities,
    endpoints: delta.endpoints.map((e) => ({ ...e, requirementIds: remapIds(e.requirementIds, idMap) })),
    journeys: delta.journeys.map((j) => ({ ...j, requirementIds: remapIds(j.requirementIds, idMap) })),
  };
}

/**
 * Gabungkan delta ke spec: entitas bernama sama mendapat kolom dan relasi tambahan, endpoint bermethod+path sama
 * diganti versi baru, journey bernama sama dilewati. Jalur gagal yang cabangnya tidak ada dibuang.
 */
export function mergeSpecDelta(spec: ProductSpec, delta: SpecDelta): ProductSpec {
  const entities = [...spec.entities];
  for (const e of delta.entities) {
    const idx = entities.findIndex((x) => x.name.toLowerCase() === e.name.toLowerCase());
    if (idx === -1) {
      entities.push(e);
      continue;
    }
    const cur = entities[idx];
    const have = new Set(cur.fields.map((f) => f.name.toLowerCase()));
    entities[idx] = {
      ...cur,
      description: cur.description ?? e.description,
      fields: [...cur.fields, ...e.fields.filter((f) => !have.has(f.name.toLowerCase()))],
      relations: [...new Set([...cur.relations, ...e.relations])],
    };
  }

  const endpoints = [...spec.endpoints];
  for (const ep of delta.endpoints) {
    const idx = endpoints.findIndex((x) => x.method === ep.method && x.path === ep.path);
    if (idx === -1) endpoints.push(ep);
    else endpoints[idx] = { ...ep, requirementIds: [...new Set([...endpoints[idx].requirementIds, ...ep.requirementIds])] };
  }

  const journeys = [...spec.journeys];
  const names = new Set(journeys.map((j) => j.name.toLowerCase()));
  for (const j of delta.journeys) {
    if (names.has(j.name.toLowerCase())) continue;
    journeys.push(j);
    names.add(j.name.toLowerCase());
  }
  const mainNames = new Set(journeys.filter((j) => j.kind === 'main').map((j) => j.name.toLowerCase()));
  const validJourneys = journeys.filter((j) => j.kind !== 'failure' || (j.branchFrom && mainNames.has(j.branchFrom.journey.toLowerCase())));

  return { ...spec, entities, endpoints, journeys: validJourneys };
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * Render delta spec ke markdown. Perlu karena generator task memakai markdown PRD (bukan daftar terstruktur)
 * selama PRD muat penuh di prompt.
 */
export function renderSpecDeltaMarkdown(delta: SpecDelta): string[] {
  const lines: string[] = [];
  if (delta.entities.length > 0) {
    lines.push('', 'Perubahan Model Data:');
    for (const e of delta.entities) {
      const fields = e.fields.map((f) => `${f.name} (${f.type})`).join(', ');
      const relations = e.relations.length > 0 ? `; relasi: ${e.relations.join(', ')}` : '';
      lines.push(`- **${e.name}**: kolom ${fields || '-'}${relations}`);
    }
  }
  if (delta.endpoints.length > 0) {
    lines.push('', 'Perubahan Endpoint API:');
    for (const ep of delta.endpoints) {
      const reqs = ep.requirementIds.length > 0 ? ` [${ep.requirementIds.join(', ')}]` : '';
      const body = [ep.requestBody ? `request: ${oneLine(ep.requestBody)}` : '', ep.responseBody ? `response: ${oneLine(ep.responseBody)}` : '']
        .filter(Boolean)
        .join('; ');
      lines.push(`- \`${ep.method} ${ep.path}\`: ${oneLine(ep.description)}${body ? ` (${body})` : ''}${reqs}`);
    }
  }
  if (delta.journeys.length > 0) {
    lines.push('', 'Journey Tambahan:');
    for (const j of delta.journeys) {
      lines.push(`- ${j.name} (${j.kind === 'failure' ? 'jalur gagal' : 'jalur utama'}): ${j.steps.map(oneLine).join(' -> ')}`);
    }
  }
  return lines;
}

/**
 * Gabungkan requirement baru (sudah bernomor final) dan specDelta ke isi PRD: bagian "Perubahan Siklus" ditambahkan
 * ke markdown, indeks requirement diperbarui, dan spec digabung bila PRD sudah punya spec.
 */
export function mergePrdDelta(
  originalContent: unknown,
  delta: {
    summary: string;
    newRequirements: Array<{ id: string; title: string; description: string; priority?: string }>;
    specDelta?: SpecDelta | null;
    /** Pemetaan penanda sementara ke nomor FR final (dari assignRequirementIds). */
    idMap?: Map<string, string>;
    cycleNumber?: number;
  }
): Record<string, unknown> {
  const prdDoc = readPrdContent(originalContent);
  const specDelta = delta.specDelta ? remapSpecDeltaIds(delta.specDelta, delta.idMap ?? new Map()) : null;

  const heading = delta.cycleNumber ? `## Perubahan Siklus #${delta.cycleNumber}: ${oneLine(delta.summary)}` : `## Perubahan Siklus: ${oneLine(delta.summary)}`;
  const deltaLines: string[] = ['', heading, '', 'Kebutuhan Tambahan:'];
  for (const req of delta.newRequirements) {
    // AI kadang menaruh seluruh kalimat di judul dan mengosongkan deskripsi: jangan sisakan ": " kosong.
    const detail = oneLine(req.description);
    deltaLines.push(`- **${req.id}**: ${oneLine(req.title)}${detail ? `: ${detail}` : ''} (Prioritas: ${req.priority || 'MEDIUM'})`);
  }
  if (specDelta) deltaLines.push(...renderSpecDeltaMarkdown(specDelta));

  const updatedMarkdown = `${prdDoc.markdown || ''}\n${deltaLines.join('\n')}`.trim();

  const known = new Set(prdDoc.requirementIndex.map((r) => r.id));
  const requirementIndex = [
    ...prdDoc.requirementIndex,
    ...delta.newRequirements.filter((r) => !known.has(r.id)).map((r) => ({ id: r.id, title: oneLine(r.title) })),
  ];
  const spec = prdDoc.spec && specDelta ? mergeSpecDelta(prdDoc.spec, specDelta) : prdDoc.spec;

  const existingObj = typeof originalContent === 'object' && originalContent !== null ? (originalContent as Record<string, unknown>) : {};
  return {
    ...existingObj,
    markdown: updatedMarkdown,
    requirementIndex,
    ...(spec ? { spec } : {}),
  };
}
