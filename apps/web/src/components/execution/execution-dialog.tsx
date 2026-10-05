// Dialog Popup Panduan Eksekusi: Master Prompt Coding Agent
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { resolveApiUrl } from '@/lib/http';
import { Button } from '@/components/ui/button';
import {
  X,
  Clipboard,
  Check,
  ShieldAlert,
} from 'lucide-react';

interface ExecutionDialogProps {
  projectId: string;
  projectName?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ExecutionDialog({ projectId, projectName, isOpen, onClose }: ExecutionDialogProps) {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [inputToken, setInputToken] = useState('');

  useEffect(() => {
    if (isOpen) {
      const stored = localStorage.getItem('numa_active_pat') || '';
      setInputToken(stored);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const activeToken = inputToken.trim() || '<TOKEN_PAT_ANDA>';
  const apiUrl = resolveApiUrl();

  const installCommand = 'npm install -g numa-cli@latest';
  const loginCommand = `numa login ${activeToken} --api-url ${apiUrl}`;

  const executionLoopText = `## 2. Loop Eksekusi (Wajib Persetujuan Pengguna Tiap Task)
Untuk setiap task yang dikerjakan:
1. Jalankan \`numa next\` untuk mengambil task aktif berikutnya. Jika sudah tidak ada task lagi, hentikan loop.
2. Jalankan \`numa start\` untuk mengunci task menjadi status IN_PROGRESS.
3. Jalankan \`numa context\` untuk membaca batasan Bounded Context (file yang boleh/dilarang diubah serta kriteria penerimaan).
4. Implementasikan kode sesuai kriteria penerimaan dan batasan file.
5. Verifikasi bahwa kode berjalan dengan baik dan bebas error.
6. PENTING: Tampilkan hasil pekerjaan dan MINTA PERSETUJUAN PENGGUNA sebelum menandai selesai.
7. Setelah disetujui pengguna, jalankan \`numa done\` untuk menyelesaikan task.
8. PENTING (Checkpoint Gate): Jika sistem meminta verifikasi checkpoint setelah \`done\`, berhenti dan minta konfirmasi pengguna sebelum lanjut.`;

  const masterPromptText = `# Master Prompt — AI Agent Loop untuk Proyek "${projectName || projectId}"

Anda adalah AI Coding Agent otonom. Tugas Anda: mengeksekusi task-task implementasi proyek secara berurutan menggunakan CLI \`numa\`.

## 0. Persiapan Instalasi CLI (Cukup Sekali)
Pastikan CLI \`numa\` terpasang versi terbaru (jalankan 1x di awal):
\`${installCommand}\`

## 1. Identitas & Autentikasi
- Project ID: ${projectId}
- Login CLI: \`${loginCommand}\`
- Switch Project (jika diperlukan): \`numa switch ${projectId}\`
- Baca Spesifikasi PRD: \`numa prd\`

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

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto no-scrollbar">
      <div className="bg-card border border-border rounded-md shadow-2xl max-w-2xl w-full p-6 space-y-5 my-8 text-foreground transition-all">
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div>
            <h2 className="text-base font-semibold leading-tight">Master Prompt</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Salin Master Prompt siap pakai untuk asisten AI coding lokal
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Peringatan Keamanan Token */}
          {inputToken ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3.5 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
              <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Peringatan Keamanan Token PAT:</span>
                <span className="opacity-90">
                  Jangan bagikan prompt ini ke publik atau commit ke repositori terbuka karena mengandung token otentikasi pribadi Anda.
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3.5 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
              <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Token PAT Belum Ditemukan:</span>
                <span className="opacity-90">
                  Token PAT belum tersimpan di browser. Silakan buat Token PAT default pada pengaturan profil, lalu ganti placeholder &lt;TOKEN_PAT_ANDA&gt; pada prompt di bawah.
                </span>
              </div>
            </div>
          )}

          {/* Master Prompt Code Block */}
          <div className="rounded-md border border-border overflow-hidden space-y-0">
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

        {/* Footer */}
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
