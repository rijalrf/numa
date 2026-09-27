// PRD page: View atau real-time streaming PRD murni (plain markdown)
import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { Lock, Copy, Check, Sparkles, RefreshCw, Loader2, ArrowRight } from 'lucide-react';
import { isStageLocked } from '@/lib/constants';
import { useWizardNav } from '@/components/layout/wizard-nav';
import { PricingDialog } from '@/components/billing/pricing-dialog';

export function PrdPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [markdown, setMarkdown] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [userPlan, setUserPlan] = useState<{ plan: string; planName: string } | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Load status project & PRD saat mount
  useEffect(() => {
    if (!projectId) return;

    const loadPrd = async () => {
      try {
        const [projectRes, billingRes] = await Promise.all([
          api<{ project?: { wizardStep?: string } }>(`/api/projects/${projectId}`),
          api<{ plan: string; planName: string }>('/api/billing/usage').catch(() => null),
        ]);

        if (billingRes) setUserPlan(billingRes);

        const currentStep = projectRes.project?.wizardStep || 'prd';
        const locked = isStageLocked(currentStep, 'prd');
        setIsLocked(locked);

        const json = await api<{ prd?: { content: any }; brd?: { content: any } }>(`/api/projects/${projectId}/prd`);
        const content = json.prd?.content ?? json.brd?.content;

        if (content) {
          if (typeof content === 'string') {
            setMarkdown(content);
          } else if (content.markdown) {
            setMarkdown(content.markdown);
          } else {
            // Fallback backward compatibility untuk data JSON lama
            setMarkdown(JSON.stringify(content, null, 2));
          }
        } else if (!locked) {
          // Otomatis streaming jika belum ada PRD
          await streamPrd();
        }
      } catch (err) {
        console.error('Gagal load PRD:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPrd();
  }, [projectId]);

  // Streaming generator SSE
  const streamPrd = async () => {
    if (!projectId || isLocked || generating) return;
    setGenerating(true);
    setMarkdown('');

    try {
      const resp = await fetch(`/api/projects/${projectId}/prd/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!resp.ok) {
        throw new Error('Gagal menghubungi server untuk generate PRD');
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('ReadableStream tidak didukung browser');

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const block of parts) {
          for (const line of block.split('\n')) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.delta) {
                  accumulated += data.delta;
                  setMarkdown(accumulated);
                }
                if (data.error) {
                  console.error('Error dari SSE stream:', data.error);
                }
              } catch {}
            }
          }
        }
      }
    } catch (err) {
      console.error('Error streaming PRD:', err);
    } finally {
      setGenerating(false);
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!markdown) return;
    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBackToTechStack = async () => {
    if (!projectId) return;
    try {
      await api(`/api/projects/${projectId}/wizard-step`, {
        method: 'POST',
        body: JSON.stringify({ step: 'techstack' }),
      });
      navigate(`/projects/${projectId}/techstack`);
    } catch {
      navigate(`/projects/${projectId}/techstack`);
    }
  };

  const handleNextStep = () => {
    if (userPlan?.plan === 'free') {
      setPricingOpen(true);
      return;
    }
    navigate(`/projects/${projectId}/tree`);
  };

  useWizardNav({
    back: {
      label: 'Kembali ke Pilihan Teknologi',
      onClick: handleBackToTechStack,
    },
    next: {
      label: userPlan?.plan === 'free' ? 'Upgrade untuk Lanjut (Diagram & Task)' : 'Lihat Diagram Struktur',
      onClick: handleNextStep,
      disabled: !markdown || generating,
    },
  });

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6">
      {/* Banner terkunci jika sudah lewat PRD */}
      {isLocked && (
        <div className="flex items-center gap-2.5 p-3.5 bg-muted/70 border border-border rounded-xl text-xs text-muted-foreground shadow-xs">
          <Lock className="h-4 w-4 text-primary shrink-0" />
          <span>
            Tahap Dokumen PRD telah selesai dan terkunci (Read-Only). Spesifikasi kebutuhan tersimpan permanen.
          </span>
        </div>
      )}

      {/* Paywall Banner untuk Free Plan */}
      {userPlan?.plan === 'free' && markdown && !generating && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-200">
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span>Dokumen PRD Selesai (Batas Paket Free Trial)</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Paket Free Trial selesai pada penyusunan PRD. Upgrade ke paket Starter atau Pro untuk membuka Diagram Struktur, Board Task, dan eksekusi AI coding agent.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setPricingOpen(true)}
            className="shrink-0 gap-1.5 font-medium shadow-xs"
          >
            Upgrade Sekarang
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Dokumen Kebutuhan Produk (PRD)</h2>
          <p className="text-xs text-muted-foreground">
            Spesifikasi arsitektur dan kebutuhan produk komprehensif tanpa format user story atau gherkin.
          </p>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          {markdown && (
            <Button onClick={handleCopy} size="sm" variant="outline" className="gap-1.5 h-8 text-xs">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Tersalin' : 'Salin Teks'}
            </Button>
          )}
          {!isLocked && !generating && (
            <Button onClick={streamPrd} size="sm" variant="outline" className="gap-1.5 h-8 text-xs">
              <RefreshCw className="h-3.5 w-3.5" />
              Generate Ulang
            </Button>
          )}
        </div>
      </div>

      {/* PRD Content: Teks Polos Streaming */}
      <div ref={contentRef} className="rounded-xl border border-border bg-card p-6 shadow-xs min-h-[400px]">
        {loading && !generating ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs">Memuat dokumen PRD...</p>
          </div>
        ) : generating && !markdown ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs">AI sedang menyusun Product Requirements Document secara mendalam...</p>
          </div>
        ) : markdown ? (
          <div className="space-y-4">
            {generating && (
              <div className="flex items-center gap-2 text-xs text-primary font-medium pb-2 border-b border-border/60">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Menulis dokumen secara langsung (streaming)...</span>
              </div>
            )}
            <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground select-text selection:bg-primary/20">
              {markdown}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <p className="text-xs italic">Belum ada dokumen PRD yang dibuat.</p>
            {!isLocked && (
              <Button onClick={streamPrd} size="sm" className="gap-1.5">
                Generate PRD Sekarang
              </Button>
            )}
          </div>
        )}
      </div>

      <PricingDialog isOpen={pricingOpen} onClose={() => setPricingOpen(false)} />
    </div>
  );
}
