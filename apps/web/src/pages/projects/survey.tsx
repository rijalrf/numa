// Halaman Survey Wizard: wawancara kebutuhan adaptif terstruktur per putaran
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/lib/http';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PricingDialog } from '@/components/billing/pricing-dialog';
import { MarkdownView } from '@/components/ui/markdown-view';
import {
  Loader2,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { useWizardNav } from '@/components/layout/wizard-nav';

interface SurveyQuestion {
  id: string;
  round: number;
  order: number;
  label: string;
  context?: string;
  kind: 'radio' | 'checkbox';
  options: string[];
  required: boolean;
  suggestion?: string;
  suggestionReason?: string;
  answer?: string;
  value?: any;
}

interface SurveyData {
  projectId: string;
  projectName: string;
  idea: string;
  round: number;
  totalRounds: number;
  isComplete: boolean;
  summary?: string;
  wizardStep: string;
  plan: 'free' | 'starter' | 'pro';
  questions: SurveyQuestion[];
}

export function SurveyPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [surveyData, setSurveyData] = useState<SurveyData | null>(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [otherText, setOtherText] = useState<Record<string, string>>({});
  const [showOtherInput, setShowOtherInput] = useState<Record<string, boolean>>({});
  const [pricingOpen, setPricingOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSurvey = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api<SurveyData>(`/api/projects/${projectId}/survey`);
      setSurveyData(data);
      setCurrentRound(data.round);

      // Inisialisasi state jawaban hanya dari data tersimpan (tanpa pre-select saran)
      const initialAnswers: Record<string, string | string[]> = {};
      const initialOthers: Record<string, string> = {};
      const initialShowOthers: Record<string, boolean> = {};

      for (const q of data.questions) {
        if (q.value !== null && q.value !== undefined) {
          initialAnswers[q.id] = q.value;
        } else if (q.answer) {
          if (q.kind === 'checkbox') {
            const splitted = q.answer.split(',').map((s) => s.trim());
            initialAnswers[q.id] = splitted;
          } else {
            initialAnswers[q.id] = q.answer;
          }
        }
      }

      setAnswers(initialAnswers);
      setOtherText(initialOthers);
      setShowOtherInput(initialShowOthers);
    } catch (err) {
      console.error('Gagal memuat survey:', err);
      setError('Gagal memuat pertanyaan survey.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadSurvey();
  }, [loadSurvey]);

  const handleRadioSelect = (questionId: string, val: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: val }));
    setShowOtherInput((prev) => ({ ...prev, [questionId]: false }));
  };

  const handleCheckboxToggle = (questionId: string, val: string) => {
    setAnswers((prev) => {
      const current = (prev[questionId] as string[]) || [];
      const next = current.includes(val)
        ? current.filter((item) => item !== val)
        : [...current, val];
      return { ...prev, [questionId]: next };
    });
  };

  const handleSelectSuggestion = (q: SurveyQuestion) => {
    if (!q.suggestion) return;
    if (q.kind === 'checkbox') {
      setAnswers((prev) => ({
        ...prev,
        [q.id]: [q.suggestion!],
      }));
    } else {
      setAnswers((prev) => ({
        ...prev,
        [q.id]: q.suggestion!,
      }));
    }
    setShowOtherInput((prev) => ({ ...prev, [q.id]: false }));
  };

  const handleOtherChange = (questionId: string, text: string) => {
    setOtherText((prev) => ({ ...prev, [questionId]: text }));
    setAnswers((prev) => ({ ...prev, [questionId]: text }));
  };

  const handleOtherClick = (questionId: string) => {
    setShowOtherInput((prev) => ({ ...prev, [questionId]: true }));
    const currentText = otherText[questionId] || '';
    setAnswers((prev) => ({ ...prev, [questionId]: currentText }));
  };

  const handleSubmitRound = async () => {
    if (!surveyData || submitting) return;
    const currentQuestions = surveyData.questions.filter((q) => q.round === currentRound);

    // Validasi kelengkapan jawaban
    const answersToSubmit: Array<{ questionId: string; value: string | string[] }> = [];

    for (const q of currentQuestions) {
      let val = answers[q.id];

      // Jika opsional dan tidak diisi, gunakan saran sebagai fallback
      if (!val || (Array.isArray(val) && val.length === 0)) {
        if (!q.required && q.suggestion) {
          val = q.kind === 'checkbox' ? [q.suggestion] : q.suggestion;
        } else if (q.required) {
          setError(`Harap jawab pertanyaan: "${q.label}"`);
          return;
        }
      }

      if (val !== undefined && val !== null) {
        answersToSubmit.push({ questionId: q.id, value: val });
      }
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await api<{
        done: boolean;
        nextRound?: number;
        totalRounds: number;
        name?: string;
        summary?: string;
      }>(`/api/projects/${projectId}/survey/submit`, {
        method: 'POST',
        body: JSON.stringify({
          round: currentRound,
          answers: answersToSubmit,
        }),
      });

      if (res.done) {
        // Survey selesai, perbarui data summary
        await loadSurvey();
      } else if (res.nextRound) {
        // Pindah ke putaran berikutnya
        await loadSurvey();
      }
    } catch (err: any) {
      console.error('Gagal kirim jawaban survey:', err);
      setError(err?.message || 'Gagal mengirimkan jawaban survey.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleProceedToTechStack = async () => {
    if (!surveyData) return;
    if (surveyData.plan === 'free') {
      setPricingOpen(true);
      return;
    }

    try {
      await api(`/api/projects/${projectId}/survey/complete`, {
        method: 'POST',
      });
      navigate(`/projects/${projectId}/techstack`);
    } catch (err: any) {
      if (err?.code === 'plan_upgrade_required') {
        setPricingOpen(true);
      } else {
        alert(err?.message || 'Gagal melanjutkan.');
      }
    }
  };

  const handlePreviousRound = () => {
    if (currentRound > 1) {
      setCurrentRound((prev) => prev - 1);
    }
  };

  useWizardNav(
    loading || !surveyData
      ? null
      : {
          back:
            currentRound > 1 && !surveyData.isComplete
              ? {
                  label: 'Kembali',
                  onClick: handlePreviousRound,
                  disabled: submitting,
                }
              : null,
          next: {
            label: submitting ? 'Menyimpan...' : 'Lanjut',
            onClick: surveyData.isComplete ? handleProceedToTechStack : handleSubmitRound,
            disabled: submitting,
          },
        }
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Menyiapkan pertanyaan wawancara kebutuhan...</p>
      </div>
    );
  }

  if (!surveyData) {
    return (
      <div className="p-8 text-center text-sm text-destructive">
        Proyek atau data survey tidak ditemukan.
      </div>
    );
  }

  // Tampilan ketika seluruh round survey telah selesai — polos tanpa wrapper
  if (surveyData.isComplete && surveyData.summary) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 pb-12">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {surveyData.projectName || 'Aplikasi Baru'}
        </h1>

        <MarkdownView content={surveyData.summary} />

        <PricingDialog
          isOpen={pricingOpen}
          onClose={() => setPricingOpen(false)}
          title="Lanjut ke PRD & Eksekusi Proyek"
          description="Paket Free Anda telah menyelesaikan survey kebutuhan dan ringkasan produk. Upgrade ke paket Starter atau Pro untuk menghasilkan dokumen PRD lengkap, diagram arsitektur, dan eksekusi coding agent."
        />
      </div>
    );
  }

  // Tampilan Pertanyaan Round Berjalan
  const currentQuestions = surveyData.questions.filter((q) => q.round === currentRound);

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {error && (
        <div className="p-3.5 rounded-md border border-destructive/30 bg-destructive/10 text-xs text-destructive flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs underline ml-2"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Kartu Pertanyaan */}
      <div className="space-y-4">
        {currentQuestions.map((q) => {
          const selectedVal = answers[q.id];
          const isCheckbox = q.kind === 'checkbox';
          const selectedArray = Array.isArray(selectedVal) ? selectedVal : [];
          const isOtherActive = showOtherInput[q.id];

          return (
            <Card key={q.id} className="border-border/80 shadow-xs">
              <CardHeader className="pb-3 pt-4 px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {q.required ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium text-foreground">
                          Wajib
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground border-dashed">
                          Opsional
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-sm font-semibold leading-snug text-foreground">
                      {q.label}
                    </CardTitle>
                  </div>

                  {q.suggestion && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleSelectSuggestion(q)}
                      className="text-xs h-7 px-2.5 text-primary border-primary/30 hover:bg-primary/10 shrink-0 gap-1"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>Saran AI</span>
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="px-5 pb-5 pt-0 space-y-2.5">
                {/* Opsi Terstruktur */}
                {q.options.map((opt) => {
                  const isSelected = isCheckbox
                    ? selectedArray.includes(opt)
                    : selectedVal === opt;

                  return (
                    <div
                      key={opt}
                      onClick={() =>
                        isCheckbox
                          ? handleCheckboxToggle(q.id, opt)
                          : handleRadioSelect(q.id, opt)
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
                  onClick={() => handleOtherClick(q.id)}
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
                      value={otherText[q.id] || ''}
                      onChange={(e) => handleOtherChange(q.id, e.target.value)}
                      className="text-xs bg-background h-8"
                    />
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic">
                      Klik untuk menuliskan jawaban bebas jika opsi di atas tidak sesuai.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
