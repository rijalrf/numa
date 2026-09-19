// Dialog Popup Panduan Eksekusi: Download BRD, Download Paket ZIP, dan Master Prompt Coding Agent
import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, downloadFile } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Archive,
  Bot,
  ArrowLeft,
  X,
  Clipboard,
  Check,
  ShieldAlert,
  Sparkles,
  Loader2,
  Download,
} from 'lucide-react';

interface ExecutionDialogProps {
  projectId: string;
  projectName?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ExecutionDialog({ projectId, projectName, isOpen, onClose }: ExecutionDialogProps) {
  const [view, setView] = useState<'menu' | 'agent'>('menu');
  const [approvalMode, setApprovalMode] = useState<'approval' | 'full_auto'>('approval');
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [downloadingBrd, setDownloadingBrd] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [inputToken, setInputToken] = useState(() => {
    return localStorage.getItem('numa_active_pat') || '';
  });

  const generateTokenMut = useMutation<{ token: string }>({
    mutationFn: () =>
      api<{ token: string }>('/api/agent-tokens', {
        method: 'POST',
        body: JSON.stringify({ name: 'Token CLI Guide' }),
      }),
    onSuccess: (res) => {
      localStorage.setItem('numa_active_pat', res.token);
      setInputToken(res.token);
    },
  });

  useEffect(() => {
    if (isOpen && !inputToken && !generateTokenMut.isPending) {
      generateTokenMut.mutate();
    }
  }, [isOpen, inputToken]);

  if (!isOpen) return null;

  const activeToken = inputToken.trim() || '<TOKEN_PAT_ANDA>';
  const apiUrl =
    typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
      ? window.location.origin
      : (import.meta.env.VITE_API_URL ?? 'http://localhost:6655');

  const installCommand = `npm install -g ${apiUrl}/api/download/numa.tgz`;
  const loginCommand = `numa login ${activeToken} --api-url ${apiUrl}`;

  const executionLoopText =
    approvalMode === 'approval'
      ? `## 2. Loop Eksekusi (Wajib Persetujuan Pengguna Tiap Task)
Untuk setiap task yang dikerjakan:
1. Jalankan \`numa next\` untuk mengambil task aktif berikutnya. Jika sudah tidak ada task lagi, hentikan loop.
2. Jalankan \`numa start\` untuk mengunci task menjadi status IN_PROGRESS.
3. Jalankan \`numa context\` untuk membaca batasan Bounded Context (file yang boleh/dilarang diubah serta kriteria penerimaan).
4. Implementasikan kode sesuai kriteria penerimaan dan batasan file.
5. Verifikasi bahwa kode berjalan dengan baik dan bebas error.
6. PENTING: Tampilkan hasil pekerjaan dan MINTA PERSETUJUAN PENGGUNA sebelum menandai selesai.
7. Setelah disetujui pengguna, jalankan \`numa done\` untuk menyelesaikan task.
8. PENTING (Checkpoint Gate): Jika sistem meminta verifikasi checkpoint setelah \`done\`, berhenti dan minta konfirmasi pengguna sebelum lanjut.`
      : `## 2. Loop Eksekusi Otonom (Full Sampai Selesai Tanpa Persetujuan)
Jalankan loop berikut secara otonom tanpa henti hingga seluruh task berstatus DONE:
1. Jalankan \`numa next\` untuk mengambil task aktif berikutnya. Jika sudah tidak ada task lagi, hentikan loop.
2. Jalankan \`numa start\` untuk mengunci task menjadi status IN_PROGRESS.
3. Jalankan \`numa context\` untuk membaca batasan Bounded Context (file yang boleh/dilarang diubah serta kriteria penerimaan).
4. Implementasikan kode sesuai kriteria penerimaan dan batasan file secara tuntas.
5. Verifikasi bahwa kode berjalan dengan baik dan bebas error sintaks.
6. Langsung jalankan \`numa done\` untuk menyelesaikan task.
7. PENTING (Checkpoint Gate): Jika sistem meminta verifikasi checkpoint setelah \`done\`, berhenti dan minta konfirmasi pengguna sebelum melanjutkan ke task berikutnya.
8. Otomatis ulangi dari langkah 1.`;

  const masterPromptText = `# Master Prompt — AI Agent Loop untuk Proyek "${projectName || projectId}"

Anda adalah AI Coding Agent otonom. Tugas Anda: mengeksekusi task-task implementasi proyek secara berurutan menggunakan CLI \`numa\`.

## 0. Persiapan Instalasi CLI (Cukup Sekali)
Jika perintah \`numa\` belum terpasang di lingkungan terminal ini, jalankan:
\`${installCommand}\`

## 1. Identitas & Autentikasi
- Project ID: ${projectId}
- Login CLI: \`${loginCommand}\`
- Switch Project (jika diperlukan): \`numa switch ${projectId}\`

${executionLoopText}

## 3. Batasan & Keamanan Bounded Context
- Hanya ubah file yang diizinkan pada \`numa context\`.
- Jangan pernah menyentuh file yang berada pada daftar forbidden.
- Pastikan kode berjalan dan lolos validasi sebelum menandai task selesai.`;

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(masterPromptText);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2500);
    } catch (err) {
      console.error('Gagal salin prompt:', err);
    }
  };

  const handleDownloadBrd = async () => {
    setDownloadingBrd(true);
    setDownloadError(null);
    try {
      await downloadFile(`/api/projects/${projectId}/brd/download`, `${projectName || 'Proyek'}_BRD.md`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengunduh BRD.';
      setDownloadError(msg);
    } finally {
      setDownloadingBrd(false);
    }
  };

  const handleDownloadZip = async () => {
    setDownloadingZip(true);
    setDownloadError(null);
    try {
      await downloadFile(`/api/projects/${projectId}/export.zip`, `${projectName || 'Proyek'}_paket.zip`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengunduh Paket Lengkap.';
      setDownloadError(msg);
    } finally {
      setDownloadingZip(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto no-scrollbar">
      <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-5 my-8 text-foreground transition-all">
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            {view === 'agent' && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setView('menu')}
                className="h-8 w-8 p-0 mr-1"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div>
              <h2 className="text-base font-semibold leading-tight">
                {view === 'menu' ? 'Panduan & Eksekusi Proyek' : 'Eksekusi Coding Agent'}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {view === 'menu'
                  ? 'Pilih opsi download dokumen spesifikasi atau eksekusi otomatis via agent'
                  : 'Salin Master Prompt siap pakai untuk asisten AI coding lokal'}
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

        {/* Banner Pesan Error Unduhan */}
        {downloadError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center justify-between gap-2">
            <span>{downloadError}</span>
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

        {/* VIEW 1: Menu 3 Opsi */}
        {view === 'menu' && (
          <div className="space-y-3.5">
            {/* Opsi 1: Download BRD .md */}
            <div className="rounded-xl border border-border/80 bg-muted/20 hover:bg-muted/40 transition-colors p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5 sm:mt-0">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    Download BRD (.md)
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Dokumen Business Requirements Document lengkap dalam format Markdown
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadBrd}
                disabled={downloadingBrd}
                className="gap-1.5 text-xs shrink-0 self-start sm:self-auto font-medium"
              >
                {downloadingBrd ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                <span>{downloadingBrd ? 'Mengunduh...' : 'Unduh .md'}</span>
              </Button>
            </div>

            {/* Opsi 2: Download Paket Lengkap .zip */}
            <div className="rounded-xl border border-border/80 bg-muted/20 hover:bg-muted/40 transition-colors p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5 sm:mt-0">
                  <Archive className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      Download Paket Lengkap (.zip)
                    </span>
                    <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                      Rekomendasi
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Arsip ZIP berisi BRD.md, USER-STORIES.md (skenario Gherkin), dan TASKS.md
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadZip}
                disabled={downloadingZip}
                className="gap-1.5 text-xs shrink-0 self-start sm:self-auto font-medium border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
              >
                {downloadingZip ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                <span>{downloadingZip ? 'Mengunduh...' : 'Unduh Paket (.zip)'}</span>
              </Button>
            </div>

            {/* Opsi 3: Eksekusi Coding Agent */}
            <div className="rounded-xl border border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary text-primary-foreground shrink-0 mt-0.5 sm:mt-0">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <span>Eksekusi Coding Agent</span>
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Jalankan loop otomatis via Claude Code, Cursor, Windsurf, atau Copilot dengan CLI numa
                  </div>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => setView('agent')}
                className="gap-1.5 text-xs shrink-0 self-start sm:self-auto font-medium"
              >
                <span>Buka Master Prompt</span>
              </Button>
            </div>
          </div>
        )}

        {/* VIEW 2: Sub-Popup Coding Agent */}
        {view === 'agent' && (
          <div className="space-y-4">
            {/* Peringatan Keamanan Token */}
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
              <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Peringatan Keamanan Token PAT:</span>
                <span className="opacity-90">
                  Jangan bagikan prompt ini ke publik atau commit ke repositori terbuka karena mengandung token otentikasi pribadi Anda.
                </span>
              </div>
            </div>

            {/* Toggle Mode Persetujuan */}
            <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-2">
              <span className="text-xs font-semibold text-foreground block">
                Pilih Mode Eksekusi Agent:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setApprovalMode('approval')}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                    approvalMode === 'approval'
                      ? 'border-primary bg-primary/10 text-foreground font-medium'
                      : 'border-border/60 bg-background/50 text-muted-foreground hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Perlu Persetujuan Tiap Task</span>
                    {approvalMode === 'approval' && <Check className="h-3.5 w-3.5 text-primary" />}
                  </div>
                  <p className="text-[11px] mt-1 opacity-80">
                    Agent meminta konfirmasi Anda sebelum menandai setiap task selesai.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setApprovalMode('full_auto')}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                    approvalMode === 'full_auto'
                      ? 'border-primary bg-primary/10 text-foreground font-medium'
                      : 'border-border/60 bg-background/50 text-muted-foreground hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Full Otomatis Sampai Selesai</span>
                    {approvalMode === 'full_auto' && <Check className="h-3.5 w-3.5 text-primary" />}
                  </div>
                  <p className="text-[11px] mt-1 opacity-80">
                    Agent menyelesaikan semua task berurutan secara otonom tanpa henti.
                  </p>
                </button>
              </div>
            </div>

            {/* Master Prompt Code Block */}
            <div className="rounded-xl border border-border overflow-hidden space-y-0">
              <div className="bg-muted/70 px-3 py-2 border-b flex items-center justify-between gap-2">
                <span className="text-xs font-mono font-medium text-foreground">
                  Master-Prompt-Loop.md
                </span>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCopyPrompt}
                  className="h-7 px-2.5 text-xs gap-1.5 font-medium"
                >
                  {copiedPrompt ? (
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
              <pre className="p-3 bg-muted/20 text-[11px] font-mono max-h-64 overflow-y-auto no-scrollbar whitespace-pre-wrap break-words text-foreground/90 leading-relaxed">
{masterPromptText}
              </pre>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-1 border-t border-border/60">
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
            Tutup
          </Button>
        </div>
      </div>
    </div>
  );
}
