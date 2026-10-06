const ROUND_LABELS: Record<number, string> = {
  1: 'Proses Saat Ini & Masalah',
  2: 'Fitur Inti & Alur Kerja',
  3: 'Aturan Bisnis & Akses',
  4: 'Batasan & Ukuran Sukses',
};

type Props = {
  currentRound: number;
  totalRounds: number;
};

export function SurveyProgress({ currentRound, totalRounds }: Props) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {ROUND_LABELS[currentRound] ? `Tahap ${currentRound}: ${ROUND_LABELS[currentRound]}` : `Tahap ${currentRound}`}
        </span>
        <span className="text-[11px]">
          {currentRound} dari {totalRounds}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
        <div
          className="bg-primary h-full transition-all duration-300 rounded-full"
          style={{
            width: `${Math.round((currentRound / Math.max(totalRounds, 1)) * 100)}%`,
          }}
        />
      </div>
    </div>
  );
}
