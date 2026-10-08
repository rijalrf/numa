// Halaman Survey Wizard: wawancara kebutuhan adaptif terstruktur per putaran
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/lib/http';
import { pollAiJob } from '@/lib/ai-job';
import { PricingDialog } from '@/components/billing/pricing-dialog';
import { MarkdownView } from '@/components/ui/markdown-view';
import { NumaLoader } from '@/components/ui/numa-loader';
import { useWizardNav } from '@/components/layout/wizard-nav';
import { useSurveyAnswers } from '@/hooks/use-survey-answers';
import { QuestionCard } from '@/components/wizard/question-card';
import { SurveyProgress } from '@/components/wizard/survey-progress';

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
  generationStatus?: 'idle' | 'generating' | 'done' | 'failed';
  generationError?: string | null;
  questions: SurveyQuestion[];
}

// Survey polling lebih rapat dari default (3 dtk): job pendek, jadi rata-rata menunggu ikut berkurang.
const SURVEY_POLL_INTERVAL_MS = 1500;
const SURVEY_POLL_MAX_ATTEMPTS = 240; // 6 menit, sama dengan batas default

export function SurveyPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [surveyData, setSurveyData] = useState<SurveyData | null>(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  // Penjaga StrictMode dan efek ganda: satu POST generate per project, satu poller aktif.
  const generateRequestedFor = useRef<string | null>(null);
  const stopPolling = useRef<(() => void) | null>(null);

  const {
    answers,
    otherText,
    showOtherInput,
    skipped,
    initFromQuestions,
    handleRadioSelect,
    handleCheckboxToggle,
    handleSelectSuggestion,
    handleOtherChange,
    handleOtherClick,
    handleSkipToggle,
  } = useSurveyAnswers();

  const loadSurvey = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api<SurveyData>(`/api/projects/${projectId}/survey`);

      // Belum ada pertanyaan: kickstart generate round 1 sebagai job async
      if (data.questions.length === 0) {
        if (data.generationStatus === 'failed') {
          setSurveyData(data);
          setError(data.generationError || 'AI gagal menyusun pertanyaan survey.');
          setLoading(false);
          return;
        }
        if (data.generationStatus === 'done') {
          setSurveyData(data);
          setError('Penyusunan pertanyaan survey tidak menghasilkan hasil. Silakan muat ulang halaman.');
          setLoading(false);
          return;
        }
        if (data.generationStatus !== 'generating') {
          setGenerating(true);
          setLoading(false);
          if (generateRequestedFor.current !== projectId) {
            generateRequestedFor.current = projectId;
            try {
              await api(`/api/projects/${projectId}/survey/generate`, { method: 'POST' });
            } catch {
              // fallback: polling akan tetap mencoba membaca status
            }
          }
          pollSurveyJob('survey_round');
          return;
        }
        setGenerating(true);
        setLoading(false);
        pollSurveyJob('survey_round');
        return;
      }

      setSurveyData(data);
      setCurrentRound(data.round);
      initFromQuestions(data.questions);
    } catch (err) {
      console.error('Gagal memuat survey:', err);
      setError('Gagal memuat pertanyaan survey.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Poll job AI async (survey_round / survey_summary), lalu muat ulang data.
  const pollSurveyJob = useCallback(
    (type: 'survey_round' | 'survey_summary') => {
      if (!projectId) return;
      setGenerating(true);
      stopPolling.current?.();
      stopPolling.current = pollAiJob(projectId, type, {
        intervalMs: SURVEY_POLL_INTERVAL_MS,
        maxAttempts: SURVEY_POLL_MAX_ATTEMPTS,
        onDone: async () => {
          setGenerating(false);
          setSubmitting(false);
          await loadSurvey();
        },
        onFailed: (err) => {
          setGenerating(false);
          setSubmitting(false);
          setError(err || 'AI gagal menyusun pertanyaan survey.');
        },
        onTimeout: () => {
          setGenerating(false);
          setSubmitting(false);
          setError('Proses penyusunan survey memakan waktu lama. Silakan muat ulang halaman.');
        },
      });
    },
    [projectId, loadSurvey]
  );

  useEffect(() => {
    loadSurvey();
    return () => stopPolling.current?.();
  }, [loadSurvey]);

  const handleSubmitRound = async () => {
    if (!surveyData || submitting) return;
    const currentQuestions = surveyData.questions.filter((q) => q.round === currentRound);

    // Kumpulkan jawaban — pertanyaan yang dilewati tidak dikirim
    const answersToSubmit: Array<{ questionId: string; value: string | string[] }> = [];

    for (const q of currentQuestions) {
      if (skipped[q.id]) continue;

      let val = answers[q.id];

      // Pertanyaan yang tidak disentuh: gunakan saran AI sebagai fallback
      if (!val || (Array.isArray(val) && val.length === 0)) {
        if (q.suggestion) {
          val = q.kind === 'checkbox' ? [q.suggestion] : q.suggestion;
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
        status?: string;
      }>(`/api/projects/${projectId}/survey/submit`, {
        method: 'POST',
        body: JSON.stringify({
          round: currentRound,
          answers: answersToSubmit,
        }),
      });

      // AI generate round berikutnya / summary berjalan sebagai job async
      if (res.status === 'generating') {
        pollSurveyJob(res.done ? 'survey_summary' : 'survey_round');
        return;
      }

      if (res.done) {
        await loadSurvey();
      } else if (res.nextRound) {
        await loadSurvey();
      }
      setSubmitting(false);
    } catch (err: any) {
      console.error('Gagal kirim jawaban survey:', err);
      setError(err?.message || 'Gagal mengirimkan jawaban survey.');
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

  const isSummaryView = Boolean(surveyData?.isComplete && surveyData?.summary);

  useWizardNav(
    loading || !surveyData
      ? null
      : {
          headerTitle: isSummaryView ? 'Ringkasan Kebutuhan' : undefined,
          headerSubtitle: isSummaryView
            ? 'Rangkuman spesifikasi dan kebutuhan produk dari hasil survey'
            : undefined,
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
            loading: submitting,
          },
        }
  );

  if (!surveyData) {
    if (loading || generating) {
      return (
        <div className="flex items-center justify-center min-h-[50vh]">
          <NumaLoader
            label="Menyiapkan pertanyaan wawancara kebutuhan..."
            sublabel="AI sedang menyiapkan pertanyaan awal untuk proyek Anda"
          />
        </div>
      );
    }

    return (
      <div className="p-8 text-center text-sm text-destructive">
        Proyek atau data survey tidak ditemukan.
      </div>
    );
  }

  // Tampilan ketika seluruh round survey telah selesai
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

      <SurveyProgress currentRound={currentRound} totalRounds={surveyData.totalRounds} />

      <div className="space-y-4">
        {currentQuestions.map((q) => (
          <QuestionCard
            key={q.id}
            question={q}
            selectedValue={answers[q.id]}
            isOtherActive={!!showOtherInput[q.id]}
            isSkipped={!!skipped[q.id]}
            otherTextValue={otherText[q.id] || ''}
            onRadioSelect={handleRadioSelect}
            onCheckboxToggle={handleCheckboxToggle}
            onSelectSuggestion={handleSelectSuggestion}
            onOtherClick={handleOtherClick}
            onOtherChange={handleOtherChange}
            onSkipToggle={handleSkipToggle}
          />
        ))}
      </div>
    </div>
  );
}
