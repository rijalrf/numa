// Halaman input ide awal aplikasi (Pintu masuk Numa)
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PricingDialog } from '@/components/billing/pricing-dialog';
import {
  Sparkles,
  ArrowRight,
  Loader2,
  Store,
  CalendarCheck,
  GraduationCap,
} from 'lucide-react';
import { api } from '@/lib/http';

export interface UserPlanInfo {
  plan: string;
  planName: string;
  quotaUsed: number;
  quotaMax: number;
  surveyRounds: number;
  charLimit: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  kind?: string;
  content: string;
  payload?: any;
  createdAt?: Date;
}

const EXAMPLE_IDEAS = [
  {
    icon: Store,
    title: 'Kasir Warung & Toko',
    text: 'Aplikasi kasir warung kelontong berbasis web dengan pencatatan inventaris barang, kasir POS cepat dengan scan barcode, dan rekap omzet harian.',
  },
  {
    icon: CalendarCheck,
    title: 'Reservasi Pasien Klinik',
    text: 'Sistem reservasi dan antrean pasien klinik gigi online dengan pemilihan jadwal dokter, reminder notifikasi WhatsApp, dan riwayat rekam medis.',
  },
  {
    icon: GraduationCap,
    title: 'LMS & Tugas Sekolah',
    text: 'Platform kelas dan tugas untuk guru dan murid dengan fitur kuis interaktif, upload tugas file PDF, dan rekap penilaian otomatis.',
  },
];

export function ChatPage() {
  const navigate = useNavigate();
  const [inputText, setInputText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userPlan, setUserPlan] = useState<UserPlanInfo | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const charLimit = userPlan?.charLimit ?? 1000;

  useEffect(() => {
    api<UserPlanInfo>('/api/user/plan')
      .then(setUserPlan)
      .catch((err) => console.warn('Gagal memuat info plan:', err));
  }, []);

  const handleSubmitIdea = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // 1. Buat sesi chat baru
      const sessionRes = await api<{ sessionId: string }>('/api/chat/sessions', {
        method: 'POST',
      });

      if (!sessionRes.sessionId) {
        throw new Error('Gagal menginisialisasi sesi.');
      }

      // 2. Langsung finalisasi sesi dengan ide mentah user -> buat draft project & redirect ke survey
      const finalizeRes = await api<{ projectId: string }>(
        `/api/chat/sessions/${sessionRes.sessionId}/finalize`,
        {
          method: 'POST',
          body: JSON.stringify({ idea: trimmed }),
        }
      );

      if (finalizeRes.projectId) {
        navigate(`/projects/${finalizeRes.projectId}/survey`);
      } else {
        throw new Error('Gagal membuat proyek baru.');
      }
    } catch (err: any) {
      console.error('Error membuat proyek dari ide:', err);
      if (err?.code === 'project_limit_reached') {
        setPricingOpen(true);
      } else {
        setErrorMessage(err?.message || 'Terjadi kesalahan saat memproses ide aplikasi Anda.');
      }
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitIdea();
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 sm:px-6 py-10 bg-background">
      <div className="max-w-2xl w-full space-y-6">
        {/* Headline & Subhead */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Dari ide mentah jadi aplikasi siap eksekusi
          </h1>

          <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
            Ceritakan ide aplikasi Anda. Numa akan memandu perancangan kebutuhan, memilih teknologi, menyusun PRD lengkap, dan menyiapkan task untuk coding agent.
          </p>
        </div>

        {/* Pesan Error jika ada */}
        {errorMessage && (
          <div className="p-3 rounded-md border border-destructive/30 bg-destructive/10 text-xs text-destructive flex items-center justify-between">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-xs underline ml-2 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Input Card */}
        <div className="rounded-md border border-border/80 bg-card p-4 sm:p-5 shadow-xs focus-within:border-primary transition-all space-y-3">
          <Textarea
            placeholder="Jelaskan aplikasi yang ingin Anda bangun, masalah yang diselesaikan, atau fitur utamanya..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
            maxLength={charLimit}
            rows={4}
            className="resize-none border-0 focus-visible:ring-0 shadow-none p-1 text-sm bg-transparent leading-relaxed"
            autoFocus
          />

          <div className="flex items-center justify-between pt-3 border-t border-border/60">
            <span className="text-[11px] text-muted-foreground">
              Tekan <kbd className="px-1.5 py-0.5 rounded-md bg-muted font-mono text-[10px]">Enter</kbd> untuk kirim • {inputText.length}/{charLimit} karakter
            </span>

            <Button
              onClick={handleSubmitIdea}
              disabled={isSubmitting || !inputText.trim()}
              size="sm"
              className="gap-2 px-4"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Menyiapkan Wawancara...</span>
                </>
              ) : (
                <>
                  <span>Kirim</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Contoh Ide Cepat */}
        <div className="space-y-2.5">
          <div className="text-xs font-medium text-muted-foreground">
            Atau pilih contoh ide untuk memulai cepat:
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {EXAMPLE_IDEAS.map((ex) => {
              const Icon = ex.icon;
              return (
                <Card
                  key={ex.title}
                  onClick={() => setInputText(ex.text)}
                  className="p-3 cursor-pointer hover:border-primary/50 hover:bg-muted/40 transition-all border-border/70 group"
                >
                  <div className="flex items-center gap-2 mb-1.5 text-xs font-semibold group-hover:text-primary transition-colors">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>{ex.title}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">
                    {ex.text}
                  </p>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal Popup Harga jika limit kuota proyek tercapai */}
      <PricingDialog
        isOpen={pricingOpen}
        onClose={() => setPricingOpen(false)}
        title="Batas Proyek Tercapai"
        description="Jumlah proyek aktif untuk paket Anda telah mencapai batas maksimal. Upgrade ke paket Starter atau Pro untuk membuka kuota proyek baru dan kedalaman survey lebih tinggi."
      />
    </div>
  );
}
