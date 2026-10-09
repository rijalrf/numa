// Tipe dan logika murni siklus perubahan (Change Cycle) di sisi web.
// Langkah panel Minta Perubahan diturunkan dari status siklus dan job di server, bukan dari state lokal,
// sehingga panel yang ditutup lalu dibuka lagi (atau halaman yang dimuat ulang) melanjutkan dari tempat terakhir.

export type CycleStatus = 'DRAFT' | 'OPEN' | 'DONE';

export interface ClarifyQuestion {
  id: string;
  label: string;
  kind: 'radio' | 'checkbox';
  options: string[];
  suggestion?: string;
  suggestionReason?: string;
}

export interface ClarifyEntry {
  question: string;
  answer: string;
  /** Nomor putaran jawaban; entri tanpa nomor dianggap putaran 1. */
  round?: number;
}

export interface CycleRequirement {
  id: string;
  title: string;
  description: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface CycleImpact {
  clarity?: 'CLEAR' | 'VAGUE';
  clarificationQuestions?: ClarifyQuestion[] | null;
  type?: string;
  size?: string;
  summary?: string;
  impactedFiles?: string[];
  impactedFeatureIds?: string[];
  needsPrdChange?: boolean;
  newRequirements?: CycleRequirement[];
  estimatedTasks?: number;
  splitProposal?: { reason: string; partA: string; partB: string } | null;
}

export interface ProjectCycleItem {
  id: string;
  number: number;
  title: string;
  request: string;
  status: CycleStatus;
  type: string;
  size: string;
  impact?: CycleImpact;
  clarify?: ClarifyEntry[];
  prdDelta?: { summary?: string } | Record<string, never>;
  createdAt: string;
  taskCounts: {
    total: number;
    done: number;
  };
}

export type CycleJobStatus = 'idle' | 'generating' | 'done' | 'failed' | 'cancelled';

export interface CycleJobInfo {
  status: CycleJobStatus;
  error: string | null;
  /** Siklus pemilik job terakhir; job siklus lain diabaikan. */
  cycleId: string | null;
}

export interface CyclesSnapshot {
  cycles: ProjectCycleItem[];
  openCycleId: string | null;
  draftCycleId: string | null;
  initialTaskCounts: { total: number; done: number };
  jobs: { analyze: CycleJobInfo; generate: CycleJobInfo };
}

export const MAX_CLARIFY_ROUNDS = 2;

export const CYCLE_TYPE_LABELS: Record<string, string> = {
  FEATURE: 'Fitur Baru',
  BUGFIX: 'Perbaikan Bug',
  REFACTOR: 'Refaktor Kode',
  MIXED: 'Campuran',
};

export const CYCLE_SIZE_LABELS: Record<string, string> = {
  SMALL: 'Kecil',
  MEDIUM: 'Menengah',
  LARGE: 'Besar',
};

export type ChangeRequestPhase =
  | 'input'
  | 'blocked'
  | 'analyzing'
  | 'analyze_failed'
  | 'not_analyzed'
  | 'clarify'
  | 'summary'
  | 'generating';

export interface ChangeRequestState {
  phase: ChangeRequestPhase;
  draft: ProjectCycleItem | null;
  open: ProjectCycleItem | null;
  /** Pesan gagal job yang relevan dengan langkah ini (analisis gagal, atau generate gagal di langkah ringkasan). */
  jobError: string | null;
}

/** Hasil analisis tersimpan bila objek impact memuat ringkasan. */
export function isAnalyzed(impact: CycleImpact | undefined | null): impact is CycleImpact {
  return typeof impact?.summary === 'string';
}

/** Jumlah putaran jawaban klarifikasi yang sudah dikirim. */
export function clarifyRoundCount(entries: ClarifyEntry[] | undefined | null): number {
  return (entries ?? []).reduce((max, e) => Math.max(max, e.round ?? 1), 0);
}

export function deriveChangeRequestState(snapshot: CyclesSnapshot): ChangeRequestState {
  const draft = snapshot.cycles.find((c) => c.status === 'DRAFT') ?? null;
  const open = snapshot.cycles.find((c) => c.status === 'OPEN') ?? null;
  const { analyze, generate } = snapshot.jobs;
  const state = (phase: ChangeRequestPhase, jobError: string | null = null): ChangeRequestState => ({ phase, draft, open, jobError });

  if (!draft) return state(open ? 'blocked' : 'input');

  const forDraft = (job: CycleJobInfo) => job.cycleId === draft.id;
  if (generate.status === 'generating' && forDraft(generate)) return state('generating');
  // Draf berikutnya (sisa pemecahan) menunggu siklus yang sedang berjalan selesai.
  if (open) return state('blocked');
  if (analyze.status === 'generating' && forDraft(analyze)) return state('analyzing');

  if (!isAnalyzed(draft.impact)) {
    return analyze.status === 'failed' && forDraft(analyze) ? state('analyze_failed', analyze.error) : state('not_analyzed');
  }

  const questions = draft.impact.clarificationQuestions ?? [];
  if (draft.impact.clarity === 'VAGUE' && questions.length > 0) return state('clarify');

  // Generate yang gagal tetap di ringkasan: user boleh mengonfirmasi ulang.
  return state('summary', generate.status === 'failed' && forDraft(generate) ? generate.error : null);
}

/** Susun jawaban klarifikasi ke bentuk kiriman API; null bila masih ada pertanyaan yang belum dijawab. */
export function buildClarifyAnswers(
  questions: ClarifyQuestion[],
  answers: Record<string, string | string[]>
): Array<{ questionId: string; answer: string }> | null {
  const result: Array<{ questionId: string; answer: string }> = [];
  for (const q of questions) {
    const raw = answers[q.id];
    const text = (Array.isArray(raw) ? raw.join(', ') : raw ?? '').trim();
    if (!text) return null;
    result.push({ questionId: q.id, answer: text });
  }
  return result;
}
