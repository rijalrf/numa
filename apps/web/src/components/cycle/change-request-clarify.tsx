// Langkah klarifikasi panel Minta Perubahan: permintaan yang kabur wajib dijawab sebelum bisa dikonfirmasi.
import { useMemo } from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuestionCard } from '@/components/wizard/question-card';
import { useSurveyAnswers } from '@/hooks/use-survey-answers';
import { MAX_CLARIFY_ROUNDS, buildClarifyAnswers, type ClarifyQuestion } from '@/lib/cycle';

type Props = {
  request: string;
  questions: ClarifyQuestion[];
  /** Putaran jawaban yang sedang diisi (mulai dari 1). */
  round: number;
  busy: boolean;
  onSubmit: (answers: Array<{ questionId: string; answer: string }>) => void;
  onCancel: () => void;
};

export function ChangeRequestClarify({ request, questions, round, busy, onSubmit, onCancel }: Props) {
  const survey = useSurveyAnswers();
  const payload = useMemo(() => buildClarifyAnswers(questions, survey.answers), [questions, survey.answers]);

  const useAllSuggestions = () => {
    for (const q of questions) survey.handleSelectSuggestion(q);
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Klarifikasi {round} dari {MAX_CLARIFY_ROUNDS}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Permintaan Anda masih terlalu umum untuk dirancang. Jawab pertanyaan berikut agar Numa dapat menilai dampaknya
            dengan tepat.
          </p>
          <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap rounded-md border border-border/80 bg-muted/20 p-2.5">
            {request}
          </p>
        </div>

        {questions.map((q) => (
          <QuestionCard
            key={q.id}
            question={q}
            selectedValue={survey.answers[q.id]}
            isOtherActive={!!survey.showOtherInput[q.id]}
            isSkipped={false}
            otherTextValue={survey.otherText[q.id] || ''}
            onRadioSelect={survey.handleRadioSelect}
            onCheckboxToggle={survey.handleCheckboxToggle}
            onSelectSuggestion={survey.handleSelectSuggestion}
            onOtherClick={survey.handleOtherClick}
            onOtherChange={survey.handleOtherChange}
          />
        ))}
      </div>

      <div className="border-t border-border/80 p-4 shrink-0 bg-card flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={useAllSuggestions} disabled={busy} className="h-8 text-xs gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Pakai Semua Saran</span>
        </Button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy} className="h-8 text-xs font-medium">
            Batalkan Draf
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => payload && onSubmit(payload)}
            disabled={busy || !payload}
            className="h-8 text-xs font-medium gap-1.5"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            <span>{busy ? 'Mengirim' : 'Kirim Jawaban'}</span>
          </Button>
        </div>
      </div>
    </>
  );
}
