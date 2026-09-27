// Dialog Popup Pilihan & Upgrade Paket Langganan
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { X, Minus, Loader2, Sparkles, AlertCircle } from 'lucide-react';

interface UserPlanData {
  plan: 'free' | 'starter' | 'pro';
  planName: string;
  quotaUsed: number;
  quotaMax: number;
  surveyRounds: number;
  charLimit: number;
  expiresAt: string | null;
}

const PLANS = [
  {
    id: 'free',
    name: 'Free Trial',
    price: 'Rp 0',
    period: '',
    description: 'Coba siklus wawancara kebutuhan dan ringkasan produk.',
    features: [
      '1 proyek aktif',
      '1 putaran survey kebutuhan',
      'Maksimal 1.000 karakter ide awal',
      'Ringkasan kebutuhan produk',
      'Wawancara Konsultan Produk',
    ],
    tier: 'free' as const,
    cta: 'Paket Dasar',
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 'Rp 49.000',
    period: '/bln',
    description: 'Cocok untuk solo developer dan indie hacker.',
    features: [
      '2 proyek aktif per bulan',
      '3 putaran survey kebutuhan adaptif',
      'Maksimal 2.000 karakter ide awal',
      'Rekomendasi Tech Stack & PRD',
      'Board task atomik',
      'Ekspor dokumen PRD (.md)',
      'Akses CLI numa aktif',
    ],
    tier: 'starter' as const,
    cta: 'Pilih Starter',
    highlight: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'Rp 129.000',
    period: '/bln',
    description: 'Untuk freelancer dan pengembang aktif.',
    features: [
      '5 proyek aktif per bulan',
      '4 putaran survey mendalam',
      'Maksimal 4.000 karakter ide awal',
      'Rekomendasi Tech Stack & PRD',
      'Board task atomik + edge cases',
      'Ekspor paket lengkap (.zip & .md)',
      'Prioritas antrean AI',
      'Akses CLI numa aktif',
    ],
    tier: 'pro' as const,
    cta: 'Pilih Pro',
  },
];

interface PricingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
}

export function PricingDialog({
  isOpen,
  onClose,
  title = 'Tingkatkan Paket Akun Anda',
  description = 'Batas kuota telah tercapai. Pilih paket yang sesuai untuk melanjutkan perencanaan dan eksekusi proyek Anda.',
}: PricingDialogProps) {
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: planData } = useQuery<UserPlanData>({
    queryKey: ['user-plan'],
    queryFn: () => api<UserPlanData>('/api/user/plan'),
    enabled: isOpen,
  });

  if (!isOpen) return null;

  const handleSelectPlan = async (tier: 'starter' | 'pro') => {
    setErrorMsg(null);
    setLoadingTier(tier);

    try {
      const res = await api<{ redirectUrl?: string }>('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan: tier }),
      });

      if (res.redirectUrl) {
        window.location.href = res.redirectUrl;
      } else {
        setErrorMsg('Gagal mendapatkan tautan pembayaran.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memproses checkout.';
      setErrorMsg(msg);
    } finally {
      setLoadingTier(null);
    }
  };

  const currentPlan = planData?.plan || 'free';

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto no-scrollbar"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl max-w-4xl w-full p-6 space-y-6 my-8 text-foreground transition-all relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="flex items-start justify-between border-b border-border/80 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-bold leading-tight">{title}</h2>
            </div>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted cursor-pointer"
            aria-label="Tutup dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Banner Pesan Error */}
        {errorMsg && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Daftar Paket */}
        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            const isHighlight = plan.highlight && !isCurrent;

            return (
              <div
                key={plan.id}
                className={`relative rounded-xl border p-5 flex flex-col transition-all ${
                  isCurrent
                    ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/30'
                    : isHighlight
                    ? 'border-primary/40 bg-card shadow-md ring-1 ring-primary/20'
                    : 'border-border bg-card/60'
                }`}
              >
                {isCurrent ? (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-primary text-primary-foreground text-[10px] font-mono uppercase tracking-wider rounded-full shadow-xs">
                    Paket Aktif
                  </div>
                ) : isHighlight ? (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-primary/90 text-primary-foreground text-[10px] font-mono uppercase tracking-wider rounded-full shadow-xs">
                    Paling Populer
                  </div>
                ) : null}

                <div className="flex items-center justify-between mb-3 mt-1">
                  <p className="font-mono text-xs uppercase tracking-wider font-semibold text-primary">
                    {plan.name}
                  </p>
                  <div>
                    <span className="text-lg font-bold">{plan.price}</span>
                    {plan.period && <span className="text-[11px] text-muted-foreground">{plan.period}</span>}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mb-4 min-h-[32px] leading-relaxed">
                  {plan.description}
                </p>

                <ul className="space-y-2 text-xs text-foreground/85 flex-1 mb-5">
                  {plan.features.map((feat, j) => (
                    <li key={j} className="flex items-start gap-2">
                      <Minus size={12} className="mt-0.5 shrink-0 text-primary" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <Button disabled variant="outline" size="sm" className="w-full text-xs h-9">
                    Sedang Digunakan
                  </Button>
                ) : plan.tier === 'free' ? (
                  <Button disabled variant="outline" size="sm" className="w-full text-xs h-9">
                    Paket Dasar
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleSelectPlan(plan.tier)}
                    disabled={loadingTier !== null}
                    className={`w-full text-xs h-9 font-semibold gap-1.5 ${
                      plan.highlight
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'bg-primary/90 text-primary-foreground hover:bg-primary'
                    }`}
                  >
                    {loadingTier === plan.tier ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Memproses...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>{plan.cta}</span>
                      </>
                    )}
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="pt-2 border-t border-border/80 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Pembayaran via QRIS, Virtual Account, dan e-Wallet tanpa kartu kredit.</span>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 text-xs">
            Tutup
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
