// Dialog Popup Alur "Minta Perubahan": Analisis Dampak, Klarifikasi, dan Konfirmasi Pembuatan Task Siklus
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  X,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Loader2,
  FileCode,
  FileText,
  AlertCircle,
  CheckCircle2,
  Layers,
  Split,
  HelpCircle,
} from 'lucide-react';

interface ClarificationQuestion {
  id: string;
  label: string;
  kind: 'radio' | 'checkbox';
  options: string[];
  required: boolean;
  suggestion?: string;
}

interface AnalysisResult {
  clarity: 'CLEAR' | 'VAGUE';
  clarificationQuestions?: ClarificationQuestion[];
  type: 'FEATURE' | 'BUGFIX' | 'REFACTOR' | 'MIXED';
  size: 'SMALL' | 'MEDIUM' | 'LARGE';
  summary: string;
  impactedFiles: string[];
  impactedPrd: string[];
  impactedTree: string[];
  needsPrdChange: boolean;
  prdChangeSummary?: string;
  newRequirements: Array<{ id: string; title: string; description: string; priority?: string }>;
  estimatedTasks: number;
  splitProposal?: {
    reason: string;
    partA: string;
    partB: string;
  };
}

interface ChangeCycleDialogProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onCycleGenerated: () => void;
  viewCycleId?: string | null;
}

export function ChangeCycleDialog({
  projectId,
  isOpen,
  onClose,
  onCycleGenerated,
  viewCycleId,
}: ChangeCycleDialogProps) {
  const [step, setStep] = useState<'input' | 'clarify' | 'confirm' | 'generating' | 'readonly'>('input');
  const [requestText, setRequestText] = useState('');
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<string, string | string[]>>({});
  const [splitChoice, setSplitChoice] = useState<'single' | 'a' | 'b'>('single');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read-only state saat melihat cycle yang sudah ada
  const [readonlyCycle, setReadonlyCycle] = useState<any>(null);

  useEffect(() => {
    if (!isOpen) return;

    if (viewCycleId) {
      setStep('readonly');
      setLoading(true);
      setError(null);
      api<{ cycle: any }>(`/api/projects/${projectId}/cycles/${viewCycleId}`)
        .then((res) => {
          setReadonlyCycle(res.cycle);
        })
        .catch((e: any) => {
          setError(e?.message || 'Gagal memuat detail siklus.');
        })
        .finally(() => setLoading(false));
    } else {
      setStep('input');
      setRequestText('');
      setCycleId(null);
      setAnalysis(null);
      setClarifyAnswers({});
      setSplitChoice('single');
      setError(null);
    }
  }, [isOpen, viewCycleId, projectId]);

  const extractErrorMessage = (err: any, fallback: string) => {
    const detail = err?.detail?.detail || (typeof err?.detail?.error === 'string' && err.detail.error !== err.message ? err.detail.error : null);
    if (detail && detail !== err?.message) {
      return `${err.message || fallback} (${detail})`;
    }
    return err?.message || fallback;
  };

  if (!isOpen) return null;

  // Step 1: Analisis Permintaan
  const handleAnalyze = async () => {
    if (!requestText.trim() || requestText.trim().length < 8) {
      setError('Mohon tuliskan permintaan perubahan minimal 8 karakter.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api<{
        needsClarification: boolean;
        cycleId: string;
        questions?: ClarificationQuestion[];
        analysis: AnalysisResult;
      }>(`/api/projects/${projectId}/cycles/analyze`, {
        method: 'POST',
        body: JSON.stringify({ request: requestText.trim() }),
      });

      setCycleId(res.cycleId);
      setAnalysis(res.analysis);

      if (res.needsClarification && res.questions && res.questions.length > 0) {
        // Inisialisasi default jawaban dari saran jika ada
        const defaults: Record<string, string | string[]> = {};
        for (const q of res.questions) {
          if (q.suggestion) {
            defaults[q.id] = q.suggestion;
          }
        }
        setClarifyAnswers(defaults);
        setStep('clarify');
      } else {
        setStep('confirm');
      }
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Gagal menganalisis dampak perubahan.'));
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Kirim Jawaban Klarifikasi
  const handleClarifySubmit = async () => {
    if (!cycleId || !analysis?.clarificationQuestions) return;

    setLoading(true);
    setError(null);

    try {
      const answersList = analysis.clarificationQuestions.map((q) => {
        const ans = clarifyAnswers[q.id];
        const text = Array.isArray(ans) ? ans.join(', ') : (ans || '');
        return { question: q.label, answer: text };
      });

      const res = await api<{
        ok: boolean;
        cycleId: string;
        analysis: AnalysisResult;
      }>(`/api/projects/${projectId}/cycles/${cycleId}/clarify`, {
        method: 'POST',
        body: JSON.stringify({ answers: answersList }),
      });

      setAnalysis(res.analysis);
      setStep('confirm');
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Gagal mengirim klarifikasi.'));
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Konfirmasi dan Generate Tasks
  const handleGenerateCycle = async () => {
    if (!cycleId) return;

    setStep('generating');
    setLoading(true);
    setError(null);

    try {
      let partRequest: string | undefined;
      if (splitChoice === 'a' && analysis?.splitProposal?.partA) {
        partRequest = analysis.splitProposal.partA;
      } else if (splitChoice === 'b' && analysis?.splitProposal?.partB) {
        partRequest = analysis.splitProposal.partB;
      }

      await api(`/api/projects/${projectId}/cycles/${cycleId}/generate`, {
        method: 'POST',
        body: JSON.stringify({
          confirm: true,
          split: splitChoice,
          partRequest,
        }),
      });

      onCycleGenerated();
      onClose();
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Gagal merancang task untuk siklus perubahan.'));
      setStep('confirm');
    } finally {
      setLoading(false);
    }
  };

  const typeLabels: Record<string, string> = {
    FEATURE: 'Fitur Baru',
    BUGFIX: 'Perbaikan Bug',
    REFACTOR: 'Refaktor Kode',
    MIXED: 'Campuran',
  };

  const sizeLabels: Record<string, string> = {
    SMALL: 'Kecil (1-3 task)',
    MEDIUM: 'Sedang (4-6 task)',
    LARGE: 'Besar (≥7 task)',
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto no-scrollbar">
      <div className="bg-card border border-border rounded-md shadow-2xl max-w-2xl w-full p-6 space-y-5 my-8 text-foreground transition-all">
        {/* Header Dialog */}
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            {step === 'clarify' && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep('input')}
                className="h-8 w-8 p-0 mr-1"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            {step === 'confirm' && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => (analysis?.clarificationQuestions?.length ? setStep('clarify') : setStep('input'))}
                className="h-8 w-8 p-0 mr-1"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div>
              <h2 className="text-base font-semibold leading-tight">
                {step === 'readonly'
                  ? `Detail Siklus #${readonlyCycle?.number ?? ''}`
                  : 'Minta Perubahan Proyek'}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {step === 'input' && 'Tuliskan kebutuhan perbaikan atau penambahan fitur baru.'}
                {step === 'clarify' && 'Bantu AI memperjelas ruang lingkup perubahan.'}
                {step === 'confirm' && 'Tinjau analisis dampak sebelum task dirancang.'}
                {step === 'generating' && 'AI sedang menyusun atomic tasks untuk siklus ini.'}
                {step === 'readonly' && readonlyCycle?.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Banner Pesan Error */}
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
            {step === 'input' && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAnalyze}
                disabled={loading || requestText.trim().length < 8}
                className="h-7 text-xs border-destructive/40 hover:bg-destructive/20 text-destructive shrink-0"
              >
                Coba Lagi
              </Button>
            )}
          </div>
        )}

        {/* STEP 1: Input Teks Bebas Permintaan */}
        {step === 'input' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Deskripsi Perubahan yang Diinginkan
              </label>
              <Textarea
                rows={5}
                value={requestText}
                onChange={(e) => setRequestText(e.target.value)}
                placeholder="Contoh:&#10;- Saat stok barang 0, tombol beli harus disabled dan tampil pesan error yang jelas&#10;- Tambahkan fitur ekspor riwayat transaksi ke format CSV di halaman admin&#10;- Ganti warna skema tombol checkout menjadi hijau emerald"
                className="text-xs resize-none"
              />
              <p className="text-[11px] text-muted-foreground">
                AI akan membaca PRD, struktur fitur, riwayat task sebelumnya, dan ringkasan codebase dari komputer Anda.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs h-8">
                Batal
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleAnalyze}
                disabled={loading || requestText.trim().length < 8}
                className="gap-1.5 text-xs h-8 font-medium"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                <span>{loading ? 'Menganalisis...' : 'Analisis Dampak'}</span>
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: Klarifikasi Jawaban */}
        {step === 'clarify' && analysis?.clarificationQuestions && (
          <div className="space-y-4">
            <div className="rounded-md bg-muted/40 p-3 border border-border/60 text-xs text-muted-foreground flex items-start gap-2">
              <HelpCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>
                Permintaan Anda memerlukan penegasan teknis agar task yang dirancang tepat sasaran. Jawab pertanyaan berikut:
              </span>
            </div>

            <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1">
              {analysis.clarificationQuestions.map((q) => (
                <div key={q.id} className="rounded-md border border-border/80 p-3.5 bg-background space-y-2.5">
                  <div className="text-xs font-semibold text-foreground">{q.label}</div>
                  <div className="space-y-1.5">
                    {q.options.map((opt) => {
                      const isSelected = q.kind === 'checkbox'
                        ? Array.isArray(clarifyAnswers[q.id]) && (clarifyAnswers[q.id] as string[]).includes(opt)
                        : clarifyAnswers[q.id] === opt;

                      return (
                        <label
                          key={opt}
                          className={`flex items-center gap-2 p-2 rounded-md border text-xs cursor-pointer transition-colors ${
                            isSelected
                              ? 'border-primary bg-primary/10 text-foreground font-medium'
                              : 'border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40'
                          }`}
                        >
                          <input
                            type={q.kind === 'checkbox' ? 'checkbox' : 'radio'}
                            name={q.id}
                            value={opt}
                            checked={isSelected}
                            onChange={() => {
                              if (q.kind === 'checkbox') {
                                const cur = (clarifyAnswers[q.id] as string[]) || [];
                                const next = cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt];
                                setClarifyAnswers((prev) => ({ ...prev, [q.id]: next }));
                              } else {
                                setClarifyAnswers((prev) => ({ ...prev, [q.id]: opt }));
                              }
                            }}
                            className="sr-only"
                          />
                          <span>{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setStep('input')} className="text-xs h-8">
                Kembali
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleClarifySubmit}
                disabled={loading}
                className="gap-1.5 text-xs h-8 font-medium"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                <span>{loading ? 'Memproses...' : 'Lanjutkan'}</span>
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: Konfirmasi Rencana Siklus */}
        {step === 'confirm' && analysis && (
          <div className="space-y-4">
            {/* Kartu Ringkasan Klasifikasi */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-md border border-border/80 bg-muted/20 p-2.5 space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Tipe Perubahan</span>
                <div className="text-xs font-semibold text-foreground">
                  {typeLabels[analysis.type] || analysis.type}
                </div>
              </div>
              <div className="rounded-md border border-border/80 bg-muted/20 p-2.5 space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Estimasi Skala</span>
                <div className="text-xs font-semibold text-foreground">
                  {sizeLabels[analysis.size] || analysis.size}
                </div>
              </div>
              <div className="rounded-md border border-border/80 bg-muted/20 p-2.5 space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Dokumen PRD</span>
                <div className="text-xs font-semibold text-foreground">
                  {analysis.needsPrdChange ? 'Diperbarui (v+1)' : 'Tetap (No-op)'}
                </div>
              </div>
              <div className="rounded-md border border-border/80 bg-muted/20 p-2.5 space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Perkiraan Task</span>
                <div className="text-xs font-semibold text-foreground">
                  ~{analysis.estimatedTasks} task
                </div>
              </div>
            </div>

            {/* Ringkasan Analisis AI */}
            <div className="rounded-md border border-border/80 bg-muted/10 p-3 space-y-1.5 text-xs">
              <span className="font-semibold text-foreground">Ringkasan Analisis Teknis</span>
              <p className="text-muted-foreground leading-relaxed">{analysis.summary}</p>
            </div>

            {/* Berkas Terdampak */}
            {analysis.impactedFiles?.length > 0 && (
              <div className="rounded-md border border-border/80 p-3 space-y-2 text-xs">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <FileCode className="h-3.5 w-3.5 text-primary" />
                  Berkas yang Diperkirakan Berubah ({analysis.impactedFiles.length})
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {analysis.impactedFiles.map((file) => (
                    <Badge key={file} variant="outline" className="font-mono text-[11px] font-normal">
                      {file}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Usulan Split Siklus jika perubahan terlalu besar */}
            {analysis.splitProposal && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 space-y-2.5 text-xs">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400 font-semibold">
                  <Split className="h-4 w-4 shrink-0" />
                  <span>Usulan: Permintaan ini disarankan dibagi menjadi 2 siklus berurutan</span>
                </div>
                <p className="text-amber-900/80 dark:text-amber-200/80 text-[11px] leading-relaxed">
                  {analysis.splitProposal.reason}
                </p>
                <div className="space-y-1.5 pt-1">
                  <label
                    onClick={() => setSplitChoice('a')}
                    className={`flex items-start gap-2 p-2 rounded-md border text-xs cursor-pointer transition-colors ${
                      splitChoice === 'a'
                        ? 'border-amber-500 bg-background font-medium'
                        : 'border-amber-500/30 bg-background/50 hover:bg-background'
                    }`}
                  >
                    <input
                      type="radio"
                      name="split"
                      checked={splitChoice === 'a'}
                      onChange={() => setSplitChoice('a')}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="font-semibold">Kerjakan Bagian 1 Dulu (Disarankan):</span>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{analysis.splitProposal.partA}</p>
                    </div>
                  </label>

                  <label
                    onClick={() => setSplitChoice('single')}
                    className={`flex items-start gap-2 p-2 rounded-md border text-xs cursor-pointer transition-colors ${
                      splitChoice === 'single'
                        ? 'border-amber-500 bg-background font-medium'
                        : 'border-amber-500/30 bg-background/50 hover:bg-background'
                    }`}
                  >
                    <input
                      type="radio"
                      name="split"
                      checked={splitChoice === 'single'}
                      onChange={() => setSplitChoice('single')}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="font-semibold">Jalankan Sekaligus dalam 1 Siklus</span>
                    </div>
                  </label>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setStep('input')} className="text-xs h-8">
                Kembali
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleGenerateCycle}
                disabled={loading}
                className="gap-1.5 text-xs h-8 font-medium"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                <span>Rancang Task Siklus</span>
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: Animasi Generating */}
        {step === 'generating' && (
          <div className="py-12 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto animate-pulse">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">Menyusun Atomic Tasks Siklus...</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                AI sedang menganalisis titik modifikasi kode pada berkas existing dan memetakan acceptance criteria.
              </p>
            </div>
          </div>
        )}

        {/* READONLY VIEW: Arsip Siklus Lama */}
        {step === 'readonly' && readonlyCycle && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-md border border-border/80 bg-muted/20 p-2.5 space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Status</span>
                <div>
                  <Badge
                    variant={readonlyCycle.status === 'DONE' ? 'success' : 'default'}
                    className="text-[10px] h-4"
                  >
                    {readonlyCycle.status === 'DONE' ? 'Selesai' : readonlyCycle.status === 'OPEN' ? 'Terbuka' : 'Draf'}
                  </Badge>
                </div>
              </div>
              <div className="rounded-md border border-border/80 bg-muted/20 p-2.5 space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Tipe</span>
                <div className="text-xs font-semibold text-foreground">
                  {typeLabels[readonlyCycle.type] || readonlyCycle.type}
                </div>
              </div>
              <div className="rounded-md border border-border/80 bg-muted/20 p-2.5 space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Skala</span>
                <div className="text-xs font-semibold text-foreground">
                  {sizeLabels[readonlyCycle.size] || readonlyCycle.size}
                </div>
              </div>
              <div className="rounded-md border border-border/80 bg-muted/20 p-2.5 space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Jumlah Task</span>
                <div className="text-xs font-semibold text-foreground">
                  {readonlyCycle.tasks?.length ?? 0} task
                </div>
              </div>
            </div>

            <div className="rounded-md border border-border/80 bg-muted/10 p-3 space-y-1 text-xs">
              <span className="font-semibold text-foreground">Permintaan Asli</span>
              <p className="text-muted-foreground leading-relaxed">{readonlyCycle.request}</p>
            </div>

            {readonlyCycle.impact?.summary && (
              <div className="rounded-md border border-border/80 p-3 space-y-1 text-xs">
                <span className="font-semibold text-foreground">Analisis Dampak</span>
                <p className="text-muted-foreground leading-relaxed">{readonlyCycle.impact.summary}</p>
              </div>
            )}

            <div className="flex items-center justify-end pt-2">
              <Button type="button" size="sm" onClick={onClose} className="text-xs h-8">
                Tutup
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
