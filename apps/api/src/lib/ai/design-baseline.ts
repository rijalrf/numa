// Baseline desain yang disuntikkan deterministik (tanpa AI) ke task FRONTEND: kriteria Fondasi UI, kriteria komponen
// untuk halaman, dan definition of done pemeriksaan tampilan. Polanya sama dengan security-baseline.ts.
import type { TaskGen } from './tasks.js';
import type { SpecDesign } from './product-spec.js';
import type { Finding } from './validation-report.js';

const PREFIX = 'Desain:';

const FOUNDATION_TITLE = /fondasi\s*ui|ui\s*foundation|fondasi\s*desain|design\s*system/i;
const FOUNDATION_FEATURE = /ui-foundation|fondasi-ui|fondasi/i;

/** Task Fondasi UI: layout, guard, navigasi, token, komponen internal, dan API client. */
export function isFoundationTask(task: Pick<TaskGen, 'layer' | 'title' | 'featureId'>): boolean {
  return task.layer === 'FRONTEND' && (FOUNDATION_TITLE.test(task.title) || FOUNDATION_FEATURE.test(task.featureId ?? ''));
}

function designHint(design?: SpecDesign): string {
  if (!design) return '';
  const parts = [
    design.tone && `nuansa ${design.tone}`,
    design.palette.primary && `primary ${design.palette.primary}`,
    design.palette.neutral && `netral ${design.palette.neutral}`,
  ].filter(Boolean);
  return parts.length > 0 ? ` dan nilainya mengikuti Arah Desain PRD (${parts.join(', ')})` : '';
}

function fontHint(design?: SpecDesign): string {
  const fonts = [design?.typography.heading, design?.typography.body].filter((f): f is string => Boolean(f));
  return fonts.length > 0 ? ` (${[...new Set(fonts)].join(' dan ')})` : '';
}

function foundationCriteria(design?: SpecDesign): string[] {
  return [
    `${PREFIX} token desain (warna primary, surface, border, teks, success, warning, danger, info; radius; bayangan; tipografi) didefinisikan di satu tempat (tema Tailwind atau CSS variable)${designHint(design)}; komponen tidak memakai warna mentah.`,
    `${PREFIX} font dimuat lewat mekanisme font framework${fontHint(design)} dan font bawaan sistem (Arial, Helvetica) tidak dipakai kecuali Arah Desain memintanya.`,
    `${PREFIX} pustaka komponen internal (components/ui atau padanannya) memuat minimal Button, Input, Select, Textarea, Modal, Card, Badge, Table, Skeleton, EmptyState, AlertBanner, dan Toast.`,
    `${PREFIX} layout publik (tanpa sidebar) dan layout aplikasi (sidebar per peran), guard rute, file navigasi, dan API client satu-satunya tersedia sehingga halaman lain memakainya ulang.`,
  ];
}

const PAGE_CRITERIA = `${PREFIX} halaman disusun dari komponen internal (components/ui) dan token desain, tanpa kelas warna mentah atau gaya warna lokal, dan lolos pemeriksaan gaya pada numa done.`;

const VISUAL_DOD =
  'Pemeriksaan tampilan: aplikasi dijalankan dan halaman diperiksa lewat screenshot lebar 390 px dan 1280 px (simpan di .numa/screenshots/): token dan komponen terpakai, layout sesuai peta halaman, tidak ada gulir horizontal, state kosong dan galat terlihat wajar.';

const norm = (v: string) => v.trim().toLowerCase();

function withAdded(list: string[] | undefined, extra: string[]): string[] {
  const have = new Set((list ?? []).map(norm));
  return [...(list ?? []), ...extra.filter((e) => !have.has(norm(e)))];
}

export type DesignBaselineResult = { tasks: TaskGen[]; findings: Finding[]; touched: number };

/**
 * Suntik baseline desain ke task FRONTEND.
 * - Task Fondasi UI mendapat kriteria fondasi. Bila tidak ada (UI_FOUNDATION_MISSING), kriteria itu ditempel ke task
 *   FRONTEND dengan urutan paling awal.
 * - Task FRONTEND lain mendapat kriteria komponen dan depends_on ke task fondasi (bila fondasi lebih awal).
 * - Semua task FRONTEND mendapat definition of done pemeriksaan tampilan.
 * Siklus perubahan (`cycle`) tidak menjalankan baseline fondasi karena codebase sudah memilikinya; hanya kriteria
 * komponen dan pemeriksaan tampilan yang ditambahkan, tanpa depends_on.
 */
export function applyDesignBaseline(tasks: TaskGen[], opts: { design?: SpecDesign; cycle?: boolean } = {}): DesignBaselineResult {
  const frontend = tasks.filter((t) => t.layer === 'FRONTEND');
  if (frontend.length === 0) return { tasks, findings: [], touched: 0 };

  const findings: Finding[] = [];
  const byOrder = [...frontend].sort((a, b) => a.order - b.order);
  let foundations = opts.cycle ? [] : byOrder.filter(isFoundationTask);

  if (!opts.cycle && foundations.length === 0) {
    foundations = [byOrder[0]];
    findings.push({
      code: 'UI_FOUNDATION_MISSING',
      severity: 'warning',
      message: `Fase FRONTEND tidak memiliki task Fondasi UI. Kriteria fondasi desain ditempelkan ke task paling awal (${byOrder[0].title}).`,
      refs: [byOrder[0].taskId ?? byOrder[0].title],
    });
  }
  const foundationIds = new Set(foundations.map((t) => t.taskId).filter((id): id is string => Boolean(id)));
  const lastFoundation = foundations.length > 0 ? foundations[foundations.length - 1] : undefined;

  let touched = 0;
  const result = tasks.map((task) => {
    if (task.layer !== 'FRONTEND') return task;
    const isFoundation = foundations.includes(task);
    const criteria = isFoundation ? foundationCriteria(opts.design) : [PAGE_CRITERIA];
    const next: TaskGen = {
      ...task,
      acceptanceCriteria: withAdded(task.acceptanceCriteria, criteria),
      definition_of_done: withAdded(task.definition_of_done, [VISUAL_DOD]),
    };
    if (!isFoundation && lastFoundation && lastFoundation.order < task.order) {
      const deps = task.depends_on ?? [];
      const alreadyDepends = deps.some((d) => foundationIds.has(d));
      if (!alreadyDepends && lastFoundation.taskId) next.depends_on = [...deps, lastFoundation.taskId];
    }
    touched++;
    return next;
  });

  if (touched > 0) {
    findings.push({ code: 'DESIGN_BASELINE_APPLIED', severity: 'info', message: `Baseline desain ditambahkan ke ${touched} task FRONTEND.` });
  }
  return { tasks: result, findings, touched };
}
