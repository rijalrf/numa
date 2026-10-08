// Urutan tahapan wizard proyek (chat -> survey -> techstack -> prd -> board).
// Dipakai lintas route: projects, wizard-step, prd, tasks, techstack.

export const STAGE_ORDER: Record<string, number> = {
  chat: 0,
  survey: 1,
  interview: 1, // backward compat
  techstack: 2,
  prd: 3,
  brd: 3, // backward compat
  board: 4,
  guide: 5, // Kompatibilitas data lama
  done: 6,
};

export function isStageLocked(currentStep: string | undefined | null, targetStage: string): boolean {
  const currentRank = STAGE_ORDER[currentStep ?? 'techstack'] ?? 1;
  const targetRank = STAGE_ORDER[targetStage] ?? 0;
  return currentRank > targetRank;
}

// Tahap terjauh yang dicapai project: max(wizardStep, artefak yang sudah ada).
// Dipakai kartu project untuk "Buka Tahap Terakhir" — wizardStep bisa saja
// mundur sengaja (mis. balik brainstorm / alur perubahan), tapi pekerjaan
// terjauh tetap di papan.
export function furthestStage(p: {
  wizardStep: string | null;
  prd: { id: string } | null;
  _count: { stacks: number; tasks: number };
}): string {
  let rank = STAGE_ORDER[p.wizardStep ?? 'techstack'] ?? 1;
  if (p._count.stacks > 0) rank = Math.max(rank, STAGE_ORDER.techstack);
  if (p.prd) rank = Math.max(rank, STAGE_ORDER.prd);
  if (p._count.tasks > 0) rank = Math.max(rank, STAGE_ORDER.board);
  if (rank <= STAGE_ORDER.survey) return 'survey';
  if (rank === STAGE_ORDER.techstack) return 'techstack';
  if (rank === STAGE_ORDER.prd) return 'prd';
  return 'board'; // board | guide | done -> papan
}
