// Dialog Master Prompt: pilih mode eksekusi, lalu salin prompt dari API (satu sumber) untuk coding agent lokal.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { X, Clipboard, Check, KeyRound } from 'lucide-react';

type ExecutionMode = 'confirm' | 'auto';

interface ExecutionDialogProps {
  projectId: string;
  projectName?: string;
  isOpen: boolean;
  onClose: () => void;
}

const MODES: Array<{ id: ExecutionMode; title: string; description: string }> = [
  {
    id: 'confirm',
    title: 'Dengan konfirmasi per layer',
    description: 'Agent mengerjakan satu layer sampai selesai, berhenti, menampilkan ringkasan, dan meminta konfirmasi Anda di percakapan sebelum lanjut.',
  },
  {
    id: 'auto',
    title: 'Otomatis penuh',
    description: 'Agent menjalankan semua task sampai selesai tanpa meminta konfirmasi, kecuali macet atau gagal.',
  },
];

const modeStorageKey = (projectId: string) => `numa_exec_mode_${projectId}`;

/** Pilihan terakhir diingat per project di browser ini; bukan data penting jadi cukup localStorage. */
function loadMode(projectId: string): ExecutionMode {
  try {
    const saved = localStorage.getItem(modeStorageKey(projectId));
    return saved === 'auto' || saved === 'confirm' ? saved : 'confirm';
  } catch {
    return 'confirm';
  }
}

export function ExecutionDialog({ projectId, projectName, isOpen, onClose }: ExecutionDialogProps) {
  const [mode, setMode] = useState<ExecutionMode>('confirm');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) setMode(loadMode(projectId));
  }, [isOpen, projectId]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    api<{ prompt: string }>(`/api/projects/${projectId}/master-prompt?mode=${mode}`)
      .then((res) => {
        if (!cancelled) setPrompt(res.prompt);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPrompt('');
          setLoadError(err instanceof Error ? err.message : 'Gagal memuat Master Prompt.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, projectId, mode]);

  if (!isOpen) return null;

  const chooseMode = (next: ExecutionMode) => {
    setMode(next);
    try {
      localStorage.setItem(modeStorageKey(projectId), next);
    } catch {
      // penyimpanan tidak tersedia: pilihan hanya berlaku selama dialog terbuka
    }
  };

  const handleCopyPrompt = async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Gagal salin prompt:', err);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto no-scrollbar">
      <div className="bg-card border border-border rounded-md shadow-2xl max-w-2xl w-full p-6 space-y-5 my-8 text-foreground transition-all">
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div>
            <h2 className="text-base font-semibold leading-tight">Master Prompt{projectName ? `: ${projectName}` : ''}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Pilih mode eksekusi, lalu salin prompt untuk asisten AI coding lokal Anda</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog"
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-foreground mb-1.5">Mode eksekusi</legend>
            {MODES.map((m) => (
              <label
                key={m.id}
                htmlFor={`exec-mode-${m.id}`}
                className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                  mode === m.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
                }`}
              >
                <input
                  id={`exec-mode-${m.id}`}
                  type="radio"
                  name="execution-mode"
                  className="mt-0.5"
                  checked={mode === m.id}
                  onChange={() => chooseMode(m.id)}
                />
                <span className="space-y-0.5">
                  <span className="block text-xs font-semibold">
                    {m.title}
                    {m.id === 'confirm' ? ' (default)' : ''}
                  </span>
                  <span className="block text-[11px] text-muted-foreground leading-relaxed">{m.description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <KeyRound className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
            <span>
              Login CLI terjadi otomatis di pemakaian pertama: CLI menampilkan alamat dan kode, lalu Anda menyetujuinya di browser. Tidak ada token yang
              perlu disalin.
            </span>
          </div>

          <div className="rounded-md border border-border overflow-hidden space-y-0">
            <div className="bg-muted/70 px-3 py-2 border-b flex items-center justify-between gap-2">
              <span className="text-xs font-mono font-medium text-foreground">Master-Prompt-Loop.md</span>
              <Button type="button" size="sm" onClick={handleCopyPrompt} disabled={loading || !prompt} className="h-7 px-2.5 text-xs gap-1.5 font-medium">
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-primary" />
                    <span>Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Clipboard className="h-3.5 w-3.5" />
                    <span>Salin Master Prompt</span>
                  </>
                )}
              </Button>
            </div>
            {loadError ? (
              <p className="p-3 text-xs text-destructive">{loadError}</p>
            ) : (
              <pre className="p-3 bg-muted/20 text-[11px] font-mono max-h-64 overflow-y-auto no-scrollbar whitespace-pre-wrap break-words text-foreground/90 leading-relaxed">
                {loading ? 'Memuat Master Prompt...' : prompt}
              </pre>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-1 border-t border-border/60">
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
            Tutup
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
