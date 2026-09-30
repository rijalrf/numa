// Halaman PRD: View atau real-time streaming dokumen kebutuhan produk
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, downloadFile } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { Sparkles, RefreshCw, Loader2, ArrowRight, Download, AlertCircle, X } from 'lucide-react';
import { isStageLocked } from '@/lib/constants';
import { useWizardNav } from '@/components/layout/wizard-nav';
import { PricingDialog } from '@/components/billing/pricing-dialog';
import { MarkdownView } from '@/components/ui/markdown-view';

export function PrdPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState<string>('');
  const [markdown, setMarkdown] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPrd, setDownloadingPrd] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [userPlan, setUserPlan] = useState<{ plan: string; planName: string } | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);
  const streamingRef = useRef(false);

  // Generator PRD via SSE: kumpulkan seluruh respons sebelum render untuk mencegah kedipan layar
  const streamPrd = useCallback(async () => {
    if (!projectId || isLocked || generating || streamingRef.current) return;
    streamingRef.current = true;
    setGenerating(true);
    setError(null);
    setMarkdown('');

    let accumulated = '';
    let streamError: string | null = null;

    try {
      const resp = await fetch(`/api/projects/${projectId}/prd/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!resp.ok) {
        if (resp.status === 409) {
          // Sedang berjalan di proses lain, tunggu data dari GET
          return;
        }
        throw new Error('Gagal menghubungi server untuk generate PRD');
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('ReadableStream tidak didukung browser');

      const decoder = new TextDecoder();
      let buffer = '';

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
                }
                if (data.error) {
                  console.error('Error dari SSE stream:', data.error);
                  streamError = data.error;
                }
              } catch {}
            }
          }
        }
      }

      // Render sekali penuh saat stream selesai
      if (accumulated) {
        setMarkdown(accumulated);
        setError(null);
      } else if (streamError) {
        setError(streamError);
      }
    } catch (err: any) {
      console.error('Error streaming PRD:', err);
      if (!accumulated) {
        setError(err?.message || 'Terjadi kesalahan saat menyusun PRD.');
      }
    } finally {
      streamingRef.current = false;
      setGenerating(false);
      setLoading(false);
    }
  }, [projectId, isLocked, generating]);

  // Load status project & PRD saat mount
  useEffect(() => {
    if (!projectId) return;

    const loadPrd = async () => {
      try {
        const [projectRes, billingRes] = await Promise.all([
          api<{ project?: { wizardStep?: string; name?: string } }>(`/api/projects/${projectId}`),
          api<{ plan: string; planName: string }>('/api/billing/usage').catch(() => null),
        ]);

        if (billingRes) setUserPlan(billingRes);
        if (projectRes.project?.name) setProjectName(projectRes.project.name);

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
            setMarkdown(JSON.stringify(content, null, 2));
          }
        } else if (!locked) {
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

  const handleDownloadPrd = async () => {
    if (!projectId) return;
    setDownloadingPrd(true);
    setDownloadError(null);
    try {
      await downloadFile(`/api/projects/${projectId}/prd/download`, `${projectName || 'Proyek'}_PRD.md`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengunduh PRD.';
      setDownloadError(msg);
    } finally {
      setDownloadingPrd(false);
    }
  };

  const extraNav = useMemo(
    () => (
      <Button
        size="sm"
        variant="outline"
        onClick={handleDownloadPrd}
        disabled={downloadingPrd || !markdown || generating}
        className="gap-1.5 font-medium h-8"
      >
        {downloadingPrd ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        <span>{downloadingPrd ? 'Mengunduh...' : 'Unduh PRD'}</span>
      </Button>
    ),
    [downloadingPrd, markdown, generating, projectName, projectId]
  );

  useWizardNav({
    back: {
      label: 'Kembali',
      onClick: handleBackToTechStack,
    },
    next: {
      label: 'Lanjut',
      onClick: handleNextStep,
      disabled: !markdown || generating,
    },
    extra: extraNav,
  });

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6 pb-16">
      {/* Banner Pesan Error Unduhan */}
      {downloadError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{downloadError}</span>
            {downloadError.includes('upgrade') && (
              <button
                type="button"
                onClick={() => setPricingOpen(true)}
                className="underline font-semibold ml-1 hover:text-foreground cursor-pointer"
              >
                Lihat Paket
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setDownloadError(null)}
            className="p-1 hover:bg-destructive/20 rounded text-destructive shrink-0 cursor-pointer"
            aria-label="Tutup pesan error"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Paywall Banner untuk Free Plan */}
      {userPlan?.plan === 'free' && markdown && !generating && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-200">
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

      {/* Error state: tombol Generate Ulang hanya tampil saat gagal */}
      {error && !generating && (
        <div className="p-4 rounded-md border border-destructive/30 bg-destructive/10 text-xs text-destructive flex items-center justify-between">
          <span>{error}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={streamPrd}
            className="gap-1.5 h-8 text-xs border-destructive/40 hover:bg-destructive/20 ml-3 shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Generate Ulang
          </Button>
        </div>
      )}

      {/* Tampilan Konten PRD — Langsung viewer tanpa wrapper box */}
      {loading && !generating ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-xs">Memuat dokumen PRD...</p>
        </div>
      ) : generating && !markdown ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-xs">Menyusun dokumen PRD...</p>
        </div>
      ) : markdown ? (
        <div className="select-text pt-2">
          <MarkdownView content={markdown} />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <p className="text-xs italic">Belum ada dokumen PRD.</p>
          {!isLocked && (
            <Button onClick={streamPrd} size="sm" className="gap-1.5">
              Generate PRD Sekarang
            </Button>
          )}
        </div>
      )}

      <PricingDialog isOpen={pricingOpen} onClose={() => setPricingOpen(false)} />
    </div>
  );
}
