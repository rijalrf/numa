// Shared constants & helpers untuk wizard stages

export const STAGE_ORDER: Record<string, number> = {
  chat: 0,
  interview: 1, // backward compat: project lama yang masih ber-wizardStep 'interview'
  techstack: 1,
  prd: 2,
  brd: 2, // backward compat
  tree: 3,
  board: 4,
  guide: 5,
  done: 6,
};

export const STAGE_LABELS: Record<string, string> = {
  chat: 'Brainstorming',
  interview: 'Interview',
  techstack: 'Tech Stack',
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
