// ChangeRequestPanel: panel kanan untuk mengajukan perubahan. Langkah mengikuti status siklus di server:
// input -> analisis dampak -> (klarifikasi bila kabur) -> ringkasan dan konfirmasi -> perancangan task.
import { useState, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/http';
import { useChangeRequest } from '@/hooks/use-change-request';
import { clarifyRoundCount } from '@/lib/cycle';
import { AlertBanner } from '@/components/ui/alert-banner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ChangeRequestClarify } from './change-request-clarify';
import { ChangeRequestSummary } from './change-request-summary';
import { GitCommit, X, Send, Loader2, RefreshCw } from 'lucide-react';

interface ChangeRequestPanelProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  /** Dipanggil saat task siklus baru selesai dirancang; Board memuat ulang data dan memilih siklus itu. */
  onFinished: (cycleId: string) => void;
}

interface UserPlanInfo {
  charLimit: number;
}

export function ChangeRequestPanel({ projectId, isOpen, onClose, onFinished }: ChangeRequestPanelProps) {
  const cr = useChangeRequest({ projectId, isOpen, onFinished });

  if (!isOpen) return null;

  const { state } = cr;
  const draft = state?.draft ?? null;

  let body: ReactNode;
  if (!state) {
    body = (
      <Centered>
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Memuat status perubahan...</p>
      </Centered>
    );
  } else if (state.phase === 'input') {
    body = <RequestForm busy={cr.busy} onSubmit={cr.submitRequest} onClose={onClose} />;
  } else if (state.phase === 'analyzing' || state.phase === 'generating') {
    const generating = state.phase === 'generating';
    body = (
      <Centered>
        {cr.timedOut ? (
          <>
            <p className="text-sm font-semibold text-foreground">Proses masih berjalan di server</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Pemrosesan memakan waktu lebih lama dari biasanya. Periksa lagi beberapa saat lagi.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void cr.refresh()} className="h-8 text-xs gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Periksa Ulang</span>
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm font-semibold text-foreground">
              {generating ? 'Merancang task perubahan' : 'Menganalisis dampak perubahan'}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Proses berjalan di latar belakang. Panel ini boleh ditutup lalu dibuka lagi.
            </p>
          </>
        )}
        {draft && <RequestQuote text={draft.request} />}
      </Centered>
    );
  } else if (state.phase === 'clarify' && draft) {
    body = (
      <ChangeRequestClarify
        key={`${draft.id}:${clarifyRoundCount(draft.clarify)}`}
        request={draft.request}
        questions={draft.impact?.clarificationQuestions ?? []}
        round={clarifyRoundCount(draft.clarify) + 1}
        busy={cr.busy}
        onSubmit={(answers) => cr.submitClarification(draft.id, answers)}
        onCancel={() => cr.cancelDraft(draft.id)}
      />
    );
  } else if (state.phase === 'summary' && draft) {
    body = (
      <ChangeRequestSummary
        key={draft.id}
        draft={draft}
        jobError={state.jobError}
        busy={cr.busy}
        onConfirm={(split) => cr.confirm(draft.id, split)}
        onCancel={() => cr.cancelDraft(draft.id)}
      />
    );
  } else if (draft && (state.phase === 'not_analyzed' || state.phase === 'analyze_failed')) {
    const failed = state.phase === 'analyze_failed';
    body = (
      <Centered>
        <p className="text-sm font-semibold text-foreground">
          {failed ? 'Analisis perubahan gagal' : 'Draf perubahan belum dianalisis'}
        </p>
        {failed && state.jobError && <p className="text-xs text-destructive leading-relaxed">{state.jobError}</p>}
        <RequestQuote text={draft.request} />
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => cr.cancelDraft(draft.id)} disabled={cr.busy} className="h-8 text-xs">
            Batalkan Draf
          </Button>
          <Button type="button" size="sm" onClick={() => cr.retryAnalysis(draft.id)} disabled={cr.busy} className="h-8 text-xs gap-1.5">
            {cr.busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>{failed ? 'Coba Lagi' : 'Analisis Dampak'}</span>
          </Button>
        </div>
      </Centered>
    );
  } else {
    // blocked: ada siklus yang masih berjalan (dan mungkin draf sisa pemecahan yang menunggu)
    const open = state.open;
    body = (
      <Centered>
        <p className="text-sm font-semibold text-foreground">Perubahan baru belum bisa diajukan</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {open
            ? `Siklus #${open.number} "${open.title}" masih berjalan. Selesaikan semua task di siklus itu sebelum mengajukan perubahan baru.`
            : 'Masih ada siklus yang berjalan.'}
        </p>
        {draft && (
          <>
            <p className="text-xs text-muted-foreground leading-relaxed">Draf berikutnya menunggu siklus itu selesai:</p>
            <RequestQuote text={draft.request} />
            <Button type="button" variant="outline" size="sm" onClick={() => cr.cancelDraft(draft.id)} disabled={cr.busy} className="h-8 text-xs">
              Batalkan Draf
            </Button>
          </>
        )}
      </Centered>
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in-0"
      onClick={onClose}
    >
      <div
        className="relative h-full w-full max-w-[500px] bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/80 px-5 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <GitCommit className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Minta Perubahan</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
            aria-label="Tutup panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {cr.error && (
          <div className="px-5 pt-4 shrink-0">
            <AlertBanner variant="destructive" onDismiss={cr.dismissError} dismissLabel="Tutup pesan kesalahan">
              {cr.error}
            </AlertBanner>
          </div>
        )}

        {body}
      </div>
    </div>,
    document.body
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col justify-center items-center text-center gap-3">
      {children}
    </div>
  );
}

function RequestQuote({ text }: { text: string }) {
  return (
    <p className="w-full max-h-32 overflow-y-auto text-left text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap rounded-md border border-border/80 bg-muted/20 p-2.5">
      {text}
    </p>
  );
}

function RequestForm({ busy, onSubmit, onClose }: { busy: boolean; onSubmit: (request: string) => void; onClose: () => void }) {
  const [request, setRequest] = useState('');
  const [userPlan, setUserPlan] = useState<UserPlanInfo | null>(null);

  const charLimit = userPlan?.charLimit ?? 1000;

  useEffect(() => {
    api<UserPlanInfo>('/api/user/plan')
      .then(setUserPlan)
      .catch((err) => console.warn('Gagal memuat info plan:', err));
  }, []);

  const canSubmit = !busy && request.trim().length >= 8 && request.length <= charLimit;

  const handleSubmit = () => {
    if (canSubmit) onSubmit(request.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col justify-center items-center text-center space-y-4">
        <div className="max-w-sm space-y-2.5">
          <h3 className="text-sm font-semibold text-foreground">Alur Pengajuan Perubahan</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Jelaskan perubahan atau fitur baru yang ingin Anda tambahkan. Numa menganalisis dampaknya terhadap PRD dan
            task yang sudah selesai, lalu hanya merancang task untuk perubahan itu.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Survei, tech stack, dan PRD tidak diulang. Task yang sudah selesai tidak diubah. Anda meninjau hasil analisis
            dan mengonfirmasinya sebelum task dirancang.
          </p>
        </div>
      </div>

      <div className="border-t border-border/80 p-4 shrink-0 bg-card space-y-3">
        <div className="rounded-md border border-border/80 bg-background p-3 focus-within:border-primary transition-all space-y-2 shadow-xs">
          <Textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Jelaskan perubahan atau fitur baru yang Anda inginkan..."
            className="resize-none border-0 focus-visible:ring-0 shadow-none p-0 text-sm bg-transparent leading-relaxed min-h-[90px] max-h-[200px]"
            disabled={busy}
            maxLength={charLimit}
            rows={4}
            autoFocus
          />

          <div className="flex items-center justify-between pt-2 border-t border-border/60 text-[11px] text-muted-foreground">
            <span>{request.trim().length < 8 ? 'Minimal 8 karakter' : 'Siap dikirim'}</span>
            <span className="font-mono">
              {request.length}/{charLimit} karakter
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            Tekan <kbd className="px-1.5 py-0.5 rounded-md bg-muted font-mono text-[10px]">Enter</kbd> untuk kirim
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy} className="h-8 text-xs font-medium">
              Batal
            </Button>
            <Button type="button" size="sm" onClick={handleSubmit} disabled={!canSubmit} className="h-8 text-xs font-medium gap-1.5">
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Mengirim</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  <span>Kirim</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
