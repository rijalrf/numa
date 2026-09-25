// StructuredForm: Render form pertanyaan interaktif dari AI dengan dukungan single/multiple choice & uncheck
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2, Check, Send, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type Question = {
  id: string;
  label?: string;
  question?: string;
  type?: 'radio' | 'checkbox';
  options: string[];
  required?: boolean;
};

interface StructuredFormProps {
  questions: Question[];
  onSubmit: (answers: Record<string, string>) => void;
  disabled?: boolean;
}

export function StructuredForm({ questions, onSubmit, disabled }: StructuredFormProps) {
  // Setiap questionId menyimpan array string jawaban yang terpilih
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [others, setOthers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  // Helper untuk menentukan apakah pertanyaan bersifat mandatory (wajib)
  const isQuestionMandatory = (q: Question, idx: number) => {
    return q.required !== undefined ? q.required : idx === 0;
  };

  // Helper untuk label pertanyaan yang human-readable
  const getQuestionLabel = (q: Question, idx: number) => {
    const text = q.question?.trim() || q.label?.trim();
    if (text && text.toLowerCase() !== 'pertanyaan') {
      return text;
    }
    if (q.id && !q.id.startsWith('q-') && !q.id.startsWith('form-')) {
      const formatted = q.id.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      return formatted;
    }
    return `Pertanyaan ${idx + 1}`;
  };

  // Toggle pilihan: single-choice (radio) atau multiple-choice (checkbox)
  const handleToggleOption = (q: Question, idx: number, optionValue: string) => {
    if (submitted || disabled) return;
    const qId = q.id || `q-${idx}`;
    const isMultiple = q.type === 'checkbox';

    setAnswers((prev) => {
      const current = prev[qId] || [];
      if (isMultiple) {
        // Checkbox: tambah jika belum ada, hapus jika sudah ada
        const exists = current.includes(optionValue);
        const next = exists ? current.filter((x) => x !== optionValue) : [...current, optionValue];
        return { ...prev, [qId]: next };
      } else {
        // Radio: klik opsi yang sama -> uncheck, klik opsi beda -> ganti pilihan
        const isSame = current.includes(optionValue);
        return { ...prev, [qId]: isSame ? [] : [optionValue] };
      }
    });
  };

  const handleToggleOther = (q: Question, idx: number) => {
    if (submitted || disabled) return;
    const qId = q.id || `q-${idx}`;
    const otherKey = `other:${qId}`;
    const isMultiple = q.type === 'checkbox';

    setAnswers((prev) => {
      const current = prev[qId] || [];
      if (isMultiple) {
        const exists = current.includes(otherKey);
        const next = exists ? current.filter((x) => x !== otherKey) : [...current, otherKey];
        return { ...prev, [qId]: next };
      } else {
        const isSame = current.includes(otherKey);
        return { ...prev, [qId]: isSame ? [] : [otherKey] };
      }
    });
  };

  const handleOtherTextChange = (questionId: string, value: string) => {
    if (submitted || disabled) return;
    setOthers((prev) => ({ ...prev, [questionId]: value }));
  };

  const isOptionSelected = (qId: string, option: string) => {
    return (answers[qId] || []).includes(option);
  };

  const isOtherSelected = (qId: string) => {
    return (answers[qId] || []).includes(`other:${qId}`);
  };

  // Hitung jumlah pertanyaan yang sudah memiliki jawaban valid
  const getAnsweredCount = () => {
    let count = 0;
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qId = q.id || `q-${i}`;
      const selected = answers[qId] || [];
      if (selected.length === 0) continue;

      if (selected.includes(`other:${qId}`)) {
        if (others[qId]?.trim() || selected.length > 1) {
          count++;
        }
      } else {
        count++;
      }
    }
    return count;
  };

  // Validasi tombol kirim:
  // 1. Semua pertanyaan mandatory harus terjawab.
  // 2. Pertanyaan optional boleh dilewati.
  // 3. Jika opsi "Lainnya" dipilih, teks wajib diisi.
  const canSubmit = () => {
    if (submitted) return true;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qId = q.id || `q-${i}`;
      const selected = answers[qId] || [];
      const mandatory = isQuestionMandatory(q, i);
      const hasOther = selected.includes(`other:${qId}`);

      if (hasOther && !others[qId]?.trim()) {
        return false;
      }

      if (mandatory && selected.length === 0) {
        return false;
      }
    }

    return true;
  };

  const handleSubmit = () => {
    if (!canSubmit() || disabled) return;

    const finalAnswers: Record<string, string> = {};
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qId = q.id || `q-${i}`;
      const selected = answers[qId] || [];

      if (selected.length === 0) continue;

      const questionLabel = getQuestionLabel(q, i);
      const formatted = selected
        .map((val) => {
          if (val === `other:${qId}`) {
            return others[qId]?.trim() || '';
          }
          return val;
        })
        .filter(Boolean);

      if (formatted.length > 0) {
        finalAnswers[questionLabel] = formatted.join(', ');
      }
    }

    onSubmit(finalAnswers);
    setSubmitted(true);
  };

  const answeredCount = getAnsweredCount();
  const mandatoryCount = questions.filter((q, i) => isQuestionMandatory(q, i)).length;
  const mandatoryAnsweredCount = questions.filter((q, i) => {
    if (!isQuestionMandatory(q, i)) return false;
    const qId = q.id || `q-${i}`;
    const selected = answers[qId] || [];
    if (selected.length === 0) return false;
    if (selected.includes(`other:${qId}`) && !others[qId]?.trim() && selected.length === 1) return false;
    return true;
  }).length;
  const isMandatoryComplete = mandatoryAnsweredCount >= mandatoryCount;

  if (submitted) {
    return (
      <Card className="border-primary/40 bg-primary/5 dark:bg-primary/10 mt-2 mb-2 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-primary text-base font-semibold">
            <CheckCircle2 className="h-5 w-5" />
            Jawaban Disimpan
          </CardTitle>
          <CardDescription className="text-xs">
            Jawaban telah dikirim ke AI untuk memperjelas konteks proyek
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 pt-1">
            {questions.map((q, idx) => {
              const qId = q.id || `q-${idx}`;
              const label = getQuestionLabel(q, idx);
              const mandatory = isQuestionMandatory(q, idx);
              const selected = answers[qId] || [];
              const answerText = selected
                .map((val) => (val === `other:${qId}` ? others[qId] || 'Lainnya' : val))
                .join(', ');

              return (
                <div key={idx} className="text-sm rounded-md bg-background/80 p-3 border border-border/50">
                  <div className="font-medium text-foreground flex items-center gap-1">
                    <span>{label}</span>
                    {mandatory && <span className="text-destructive font-bold text-base leading-none">*</span>}
                  </div>
                  <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                    <span className="font-semibold text-primary">Jawaban:</span>
                    <span>{answerText || '(dilewati / tidak dijawab)'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border shadow-sm mt-2 mb-2 overflow-hidden">
      <CardHeader className="pb-3 bg-muted/20 border-b border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-primary" />
            Konteks & Kebutuhan Aplikasi
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {answeredCount} dari {questions.length} dijawab
          </span>
        </div>
        <CardDescription className="text-xs text-muted-foreground">
          Pilih jawaban yang sesuai. Pertanyaan dengan tanda (<span className="text-destructive font-bold">*</span>) wajib dijawab. Klik opsi lagi untuk membatalkan pilihan.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6 pt-5">
        {questions.map((q, idx) => {
          const qId = q.id || `q-${idx}`;
          const qLabel = getQuestionLabel(q, idx);
          const isMultiple = q.type === 'checkbox';
          const mandatory = isQuestionMandatory(q, idx);
          const hasOther = isOtherSelected(qId);

          return (
            <div key={idx} className="space-y-3">
              <div className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold mt-0.5">
                  {idx + 1}
                </span>
                <div className="text-sm font-semibold text-foreground leading-relaxed flex items-center flex-wrap gap-1.5">
                  <span>{qLabel}</span>
                  {mandatory && (
                    <span className="text-destructive font-bold text-base leading-none" title="Wajib diisi">
                      *
                    </span>
                  )}
                  <span className="text-[11px] font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {isMultiple ? 'Boleh pilih lebih dari 1' : 'Pilih 1'}
                  </span>
                </div>
              </div>

              {/* Daftar Opsi: 3 opsi relevan + 1 opsi Lainnya */}
              <div className="grid gap-2 pl-7">
                {q.options
                  .filter((opt) => !/^lainnya/i.test(opt.trim()) && !/^other/i.test(opt.trim()))
                  .slice(0, 3)
                  .map((option, optIdx) => {
                    const isSelected = isOptionSelected(qId, option);

                    return (
                      <button
                        key={optIdx}
                        type="button"
                        disabled={disabled}
                        onClick={() => handleToggleOption(q, idx, option)}
                        className={cn(
                          'w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all text-sm',
                          isSelected
                            ? 'border-primary bg-primary/10 dark:bg-primary/20 text-foreground ring-1 ring-primary shadow-xs font-medium'
                            : 'border-border bg-card/60 hover:bg-accent/50 hover:border-primary/40 text-foreground/90'
                        )}
                      >
                        {/* Indikator: radio (lingkaran) atau checkbox (kotak) */}
                        <div
                          className={cn(
                            'h-4 w-4 shrink-0 flex items-center justify-center transition-colors border',
                            isMultiple ? 'rounded-md' : 'rounded-full',
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-muted-foreground/40 bg-background'
                          )}
                        >
                          {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                        </div>

                        <span className="flex-1 leading-snug">{option}</span>
                      </button>
                    );
                  })}

                {/* Opsi ke-4: "Lainnya" */}
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => handleToggleOther(q, idx)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all text-sm',
                      hasOther
                        ? 'border-primary bg-primary/10 dark:bg-primary/20 text-foreground ring-1 ring-primary shadow-xs font-medium'
                        : 'border-border bg-card/60 hover:bg-accent/50 hover:border-primary/40 text-foreground/90'
                    )}
                  >
                    <div
                      className={cn(
                        'h-4 w-4 shrink-0 flex items-center justify-center transition-colors border',
                        isMultiple ? 'rounded-md' : 'rounded-full',
                        hasOther
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground/40 bg-background'
                      )}
                    >
                      {hasOther && <Check className="h-3 w-3 stroke-[3]" />}
                    </div>
                    <span className="flex-1 leading-snug">Lainnya</span>
                  </button>

                  {hasOther && (
                    <div className="pl-7 pt-1">
                      <Input
                        placeholder="Ketik jawaban spesifik Anda di sini..."
                        value={others[qId] || ''}
                        onChange={(e) => handleOtherTextChange(qId, e.target.value)}
                        disabled={disabled}
                        className="text-sm bg-background border-primary/50 focus-visible:ring-primary"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Footer aksi tombol */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-border">
          <div className="text-xs text-muted-foreground">
            {!isMandatoryComplete
              ? 'Jawab pertanyaan bertanda bintang merah (*) untuk mengirim'
              : answeredCount === questions.length
              ? 'Semua pertanyaan telah dijawab'
              : `${answeredCount} dari ${questions.length} pertanyaan dijawab`}
          </div>

          <Button
            type="button"
            size="md"
            onClick={handleSubmit}
            disabled={!canSubmit() || disabled}
            className="w-full sm:w-auto gap-2"
          >
            <Send className="h-4 w-4" />
            Kirim Jawaban
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
