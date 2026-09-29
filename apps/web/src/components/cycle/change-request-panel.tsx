// ChangeRequestPanel: panel kanan untuk mengirim permintaan perubahan, lalu lanjut ke survei kebutuhan.
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { GitCommit, X, Send, Loader2, AlertCircle } from 'lucide-react';

interface ChangeRequestPanelProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface UserPlanInfo {
  charLimit: number;
}

export function ChangeRequestPanel({ projectId, isOpen, onClose }: ChangeRequestPanelProps) {
  const navigate = useNavigate();
  const [request, setRequest] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userPlan, setUserPlan] = useState<UserPlanInfo | null>(null);

  const charLimit = userPlan?.charLimit ?? 1000;

  useEffect(() => {
    if (!isOpen) return;
    api<UserPlanInfo>('/api/user/plan')
      .then(setUserPlan)
      .catch((err) => console.warn('Gagal memuat info plan:', err));
  }, [isOpen]);

  if (!isOpen) return null;

  const canSubmit = !loading && request.trim().length >= 8 && request.length <= charLimit;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      await api(`/api/projects/${projectId}/change-request`, {
        method: 'POST',
        body: JSON.stringify({ request: request.trim() }),
      });
      navigate(`/projects/${projectId}/survey`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim permintaan perubahan.');
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) {
        handleSubmit();
      }
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in-0"
      onClick={onClose}
    >
      <div
        className="relative h-full w-full max-w-[420px] bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Panel */}
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

        {/* Tengah: Konten / Panduan / Pesan Error */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="rounded-md border border-border/80 bg-muted/20 p-3.5 space-y-2">
            <div className="text-xs font-semibold text-foreground">
              Alur Pengajuan Perubahan
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Jelaskan perubahan atau fitur baru yang ingin Anda tambahkan. AI akan memperbarui PRD
              dengan sistem delta append tanpa menghapus task yang telah selesai.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Setelah dikirim, Anda akan diarahkan ke survei kebutuhan — sama seperti saat membuat
              proyek baru — agar AI dapat menyusun rencana perubahan yang tepat.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md border border-destructive/30 bg-destructive/10 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Bawah: Kolom Textarea & Aksi Input */}
        <div className="border-t border-border/80 p-4 shrink-0 bg-card space-y-3">
          <div className="rounded-md border border-border/80 bg-background p-3 focus-within:border-primary transition-all space-y-2 shadow-xs">
            <Textarea
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Jelaskan perubahan atau fitur baru yang Anda inginkan..."
              className="resize-none border-0 focus-visible:ring-0 shadow-none p-0 text-sm bg-transparent leading-relaxed min-h-[90px] max-h-[200px]"
              disabled={loading}
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={loading}
                className="h-8 text-xs font-medium"
              >
                Batal
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="h-8 text-xs font-medium gap-1.5"
              >
                {loading ? (
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
      </div>
    </div>,
    document.body
  );
}
