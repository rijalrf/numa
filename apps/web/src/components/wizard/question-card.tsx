import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2 } from 'lucide-react';

interface SurveyQuestion {
  id: string;
  label: string;
  kind: 'radio' | 'checkbox';
  options: string[];
  suggestion?: string;
}

type Props = {
  question: SurveyQuestion;
  selectedValue: string | string[] | undefined;
  isOtherActive: boolean;
  isSkipped: boolean;
  otherTextValue: string;
  onRadioSelect: (questionId: string, val: string) => void;
  onCheckboxToggle: (questionId: string, val: string) => void;
  onSelectSuggestion: (q: SurveyQuestion) => void;
  onOtherClick: (questionId: string) => void;
  onOtherChange: (questionId: string, text: string) => void;
  onSkipToggle: (questionId: string) => void;
};

export function QuestionCard({
  question,
  selectedValue,
  isOtherActive,
  isSkipped,
  otherTextValue,
  onRadioSelect,
  onCheckboxToggle,
  onSelectSuggestion,
  onOtherClick,
  onOtherChange,
  onSkipToggle,
}: Props) {
  const q = question;
  const isCheckbox = q.kind === 'checkbox';
  const selectedArray = Array.isArray(selectedValue) ? selectedValue : [];

  return (
    <Card className={`border-border/80 shadow-xs transition-opacity ${isSkipped ? 'opacity-55' : ''}`}>
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-sm font-semibold leading-snug text-foreground">
            {q.label}
          </CardTitle>

          <div className="flex items-center gap-1.5 shrink-0">
            {q.suggestion && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onSelectSuggestion(q)}
                disabled={isSkipped}
                className="text-xs h-7 px-2.5 text-primary border-primary/30 hover:bg-primary/10"
              >
                <span>Saran AI</span>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-5 pt-0 space-y-2.5">
        {/* Opsi Terstruktur */}
        {q.options.map((opt) => {
          const isSelected = isCheckbox
            ? selectedArray.includes(opt)
            : selectedValue === opt;

          return (
            <div
              key={opt}
              onClick={() =>
                isCheckbox
                  ? onCheckboxToggle(q.id, opt)
                  : onRadioSelect(q.id, opt)
              }
              className={`p-3 rounded-md border text-xs cursor-pointer transition-all flex items-start justify-between gap-3 ${
                isSelected
                  ? 'border-primary bg-primary/10 text-foreground font-medium shadow-2xs'
                  : 'border-border/70 hover:bg-muted/40 text-foreground/80'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 shrink-0">
                  {isCheckbox ? (
                    <div
                      className={`h-4 w-4 rounded-md border flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-muted-foreground/40'
                      }`}
                    >
                      {isSelected && <CheckCircle2 className="h-3 w-3" />}
                    </div>
                  ) : (
                    <div
                      className={`h-4 w-4 rounded-full border flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'border-primary'
                          : 'border-muted-foreground/40'
                      }`}
                    >
                      {isSelected && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </div>
                  )}
                </div>
                <span className="leading-relaxed">{opt}</span>
              </div>
            </div>
          );
        })}

        {/* Opsi Lainnya */}
        <div
          onClick={() => onOtherClick(q.id)}
          className={`p-3 rounded-md border text-xs cursor-pointer transition-all ${
            isOtherActive
              ? 'border-primary bg-primary/5 text-foreground'
              : 'border-dashed border-border hover:bg-muted/30 text-muted-foreground'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="font-medium">Opsi Lainnya (Ketik Sendiri):</span>
          </div>
          {isOtherActive ? (
            <Input
              autoFocus
              placeholder="Tuliskan kebutuhan atau spesifikasi Anda di sini..."
              value={otherTextValue || ''}
              onChange={(e) => onOtherChange(q.id, e.target.value)}
              className="text-xs bg-background h-8"
            />
          ) : (
            <p className="text-[11px] text-muted-foreground italic">
              Klik untuk menuliskan jawaban bebas jika opsi di atas tidak sesuai.
            </p>
          )}
        </div>

        {/* Tombol Lewati di bawah */}
        <div className="flex justify-end pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSkipToggle(q.id)}
            className="text-xs h-7 px-2.5 text-muted-foreground hover:text-foreground"
          >
            {isSkipped ? 'Batal Lewati' : 'Lewati'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
