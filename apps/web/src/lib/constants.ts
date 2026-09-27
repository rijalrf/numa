// Shared constants & helpers untuk wizard stages

export const STAGE_ORDER: Record<string, number> = {
  chat: 0,
  survey: 1,
  interview: 1, // backward compat: project lama yang masih ber-wizardStep 'interview'
  techstack: 2,
  prd: 3,
  brd: 3, // backward compat
  tree: 4,
  board: 5,
  guide: 6,
  done: 7,
};

export const STAGE_LABELS: Record<string, string> = {
  chat: 'Brainstorming',
  survey: 'Survey Kebutuhan',
  interview: 'Survey Kebutuhan',
  techstack: 'Pilih Teknologi',
  prd: 'Dokumen PRD',
  brd: 'Dokumen PRD', // backward compat
  tree: 'Diagram Struktur',
  board: 'Board Task',
  guide: 'Panduan Eksekusi',
  done: 'Selesai',
};

export function isStageLocked(currentStep: string | undefined | null, targetStage: string): boolean {
  const currentRank = STAGE_ORDER[currentStep ?? 'techstack'] ?? 1;
  const targetRank = STAGE_ORDER[targetStage] ?? 0;
  return currentRank > targetRank;
}
