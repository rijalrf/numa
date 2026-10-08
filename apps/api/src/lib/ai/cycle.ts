// Modul analisis dampak perubahan, klarifikasi, dan perakitan delta PRD untuk Change Cycle Numa
import { z } from 'zod';
import { generateJson } from './ai-service.js';
import { SurveyQuestionItemSchema } from '../survey.js';
import { readPrdContent } from './prd.js';
import type { PrdTaskContext } from './tasks.js';
import { PROMPT_VERSIONS } from './prompts.js';

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
  impactedFiles: z
    .preprocess((v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []), z.array(z.string()))
    .default([]),
  impactedPrd: z
    .preprocess((v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []), z.array(z.string()))
    .default([]),
  impactedTree: z
    .preprocess((v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []), z.array(z.string()))
    .default([]),
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
          id: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v : 'FR-CYCLE-001'), z.string()).default('FR-CYCLE-001'),
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

export async function analyzeChangeRequest(args: {
  projectId: string;
  request: string;
  prd?: PrdTaskContext | null;
  repoSummary?: unknown;
  completedTasks?: Array<{ title: string; layer: string; files: string[] }>;
  clarifyAnswers?: Array<{ question: string; answer: string }>;
}): Promise<ImpactResult> {
  const system = `Anda adalah Tech Lead senior. Tugas Anda adalah menganalisis permintaan perubahan (Change Request / Cycle) pada aplikasi yang SUDAH memiliki codebase dan task-task awal yang telah selesai dikerjakan.

PRINSIP ANALISIS DAMPAK:
1. Kejelasan (Clarity):
   - Jika permintaan spesifik dan konteksnya jelas (misal: "checkout error saat stok 0", "tambah tombol ekspor data transaksi ke CSV"), set clarity: 'CLEAR'.
   - Jika permintaan sangat kabur, 1-2 kata tanpa konteks teknis (misal: "bikin bagus", "error tolong betulin"), set clarity: 'VAGUE' dan berikan 2-3 clarificationQuestions terarah menggunakan format SurveyQuestionItem (id, label, options 2-4, suggestion).
2. Klasifikasi (byproduct/label saja):
   - type: 'BUGFIX' jika memperbaiki bug yang ada; 'FEATURE' jika menambah fungsionalitas baru; 'REFACTOR' jika mengubah struktur tanpa fitur baru; 'MIXED' jika campuran.
   - size: 'SMALL' (1-3 task, 1-3 file), 'MEDIUM' (4-6 task), 'LARGE' (>= 7 task).
3. Kebutuhan Perubahan PRD (needsPrdChange):
   - Untuk 'BUGFIX' murni: needsPrdChange HARUS false, newRequirements kosong [].
   - Untuk 'FEATURE' atau penambahan aturan bisnis baru: needsPrdChange bernilai true, sertakan prdChangeSummary dan newRequirements dengan ID terstruktur (misal FR-CYCLE-001).
4. Pemetaan Dampak (Impact Mapping):
   - impactedFiles: berkas-berkas yang kemungkinan besar perlu diubah (ambil dari ringkasan codebase/repoSummary/task sebelumnya).
   - impactedPrd: ID requirement lama yang terdampak jika ada.
   - impactedTree: nama simpul fitur aplikasi yang tersentuh.
5. Pemecahan Siklus (Split Proposal):
   - Jika perkiraan task >= 8 atau size LARGE, tawarkan usulan pemecahan menjadi 2 siklus berurutan (partA dan partB berupa string teks) dengan alasan teknis rasional.
   - Jika size SMALL atau MEDIUM, hilangkan field splitProposal atau set null.
6. Format Output JSON:
   - summary: Wajib string deskripsi singkat analisis (1-2 kalimat).
   - estimatedTasks: Wajib angka integer minimal 1.
   - newRequirements[].priority: Wajib salah satu dari 'HIGH', 'MEDIUM', atau 'LOW'.
   - clarificationQuestions: Berikan array pertanyaan jika clarity VAGUE, atau abaikan jika CLEAR.

Bahasa Indonesia baku, istilah teknis pemrograman dalam bahasa Inggris, TANPA EMOJI.`;

  const fence = (label: string, data: unknown) => {
    if (!data) return '';
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const safe = text.slice(0, 10000).replace(/<{3,}/g, '< < <').replace(/>{3,}/g, '> > >');
    return `\n<<<DATA: ${label}>>>\n${safe}\n<<<END DATA: ${label}>>>\n`;
  };

  const clarifyText = args.clarifyAnswers?.length
    ? `\nJAWABAN KLARIFIKASI PENGGUNA SEBELUMNYA:\n${args.clarifyAnswers.map((a) => `- Pertanyaan: ${a.question}\n  Jawaban: ${a.answer}`).join('\n')}\n`
    : '';

  const user = `PERMINTAAN PERUBAHAN PENGGUNA:
"${args.request}"
${clarifyText}
${fence('DOKUMEN PRD EKSISTING', args.prd)}
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

  return out;
}

export function mergePrdDelta(
  originalContent: unknown,
  delta: {
    summary: string;
    newRequirements: Array<{ id: string; title: string; description: string; priority?: string }>;
  }
): Record<string, unknown> {
  const prdDoc = readPrdContent(originalContent);
  const existingMarkdown = prdDoc.markdown || '';

  const deltaLines: string[] = [
    '',
    `## Perubahan Siklus: ${delta.summary}`,
    '',
    'Kebutuhan Tambahan:',
  ];

  for (const req of delta.newRequirements) {
    deltaLines.push(`- **[${req.id}] ${req.title}**: ${req.description} (Prioritas: ${req.priority || 'MEDIUM'})`);
  }

  const updatedMarkdown = `${existingMarkdown}\n${deltaLines.join('\n')}`.trim();

  // Gabungkan ke structure JSON
  const existingObj = typeof originalContent === 'object' && originalContent !== null ? (originalContent as Record<string, unknown>) : {};
  const currentReqs = Array.isArray(existingObj.functionalRequirements) ? (existingObj.functionalRequirements as unknown[]) : [];

  return {
    ...existingObj,
    markdown: updatedMarkdown,
    functionalRequirements: [
      ...currentReqs,
      ...delta.newRequirements.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        priority: r.priority || 'MEDIUM',
      })),
    ],
  };
}
