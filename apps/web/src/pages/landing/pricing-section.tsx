import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Minus, Loader2 } from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { api } from '@/lib/http';

const PLANS = [
  {
    id: 'free',
    name: 'Free Trial',
    price: 'Rp 0',
    period: '',
    description: 'Coba siklus penuh untuk 1 proyek pertama Anda.',
    features: [
      '1 proyek (sekali coba)',
      '10 putaran chat brainstorming',
      'Maksimal 1.000 karakter per pesan',
      'Rekomendasi Tech Stack & PRD',
      'Board task atomik',
      'Akses CLI numa aktif',
    ],
    cta: 'Mulai Gratis',
    tier: 'free' as const,
    highlight: false,
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 'Rp 49.000',
    period: '/bln',
    description: 'Cocok untuk solo developer dan indie hacker.',
    features: [
      '2 proyek aktif per bulan',
      '15 putaran chat per proyek',
      'Maksimal 2.000 karakter per pesan',
      'Rekomendasi Tech Stack & PRD',
      'Board task atomik',
      'Ekspor dokumen PRD (.md)',
      'Akses CLI numa aktif',
    ],
    cta: 'Pilih Starter',
    tier: 'starter' as const,
    highlight: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'Rp 129.000',
    period: '/bln',
    description: 'Untuk freelancer dan pengembang aktif.',
    features: [
      '6 proyek aktif per bulan',
      '25 putaran chat per proyek',
      'Maksimal 4.000 karakter per pesan',
      'Rekomendasi Tech Stack & PRD',
      'Board task atomik + edge cases',
      'Ekspor paket lengkap (.zip & .md)',
      'Prioritas antrean AI',
      'Akses CLI numa aktif',
    ],
    cta: 'Pilih Pro',
    tier: 'pro' as const,
    highlight: false,
  },
];

export function PricingSection() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSelectPlan = async (tier: 'free' | 'starter' | 'pro') => {
    setErrorMsg(null);

    if (tier === 'free') {
      if (session?.user) {
        navigate('/chat');
      } else {
        navigate('/login');
      }
      return;
    }

    if (!session?.user) {
      navigate('/login');
      return;
    }

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

  return (
    <section id="pricing" className="py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center mb-16">
          <p className="font-mono text-xs tracking-[0.3em] uppercase text-numa-primary mb-4">Harga</p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-foreground dark:text-white">Mulai gratis. Skalakan sesuai kebutuhan.</h2>
          <p className="mt-3 text-muted-foreground dark:text-numa-muted-light text-base">Pembayaran lokal via QRIS, Virtual Account, dan e-Wallet tanpa kartu kredit.</p>
          {errorMsg && (
            <p className="mt-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md py-2 px-4 inline-block">
              {errorMsg}
            </p>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl border ${
                plan.highlight
                  ? 'border-numa-primary shadow-[0_0_50px_-15px_rgba(45,126,121,.25)] ring-1 ring-numa-primary/50'
                  : 'border-border/80 shadow-sm dark:border-white/[.06] dark:shadow-none'
              } bg-card dark:bg-numa-card p-8 flex flex-col pricing-card`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-numa-primary text-white text-[11px] font-mono uppercase tracking-wider rounded-full shadow-sm">
                  Paling Populer
                </div>
              )}
              <div className="flex items-center justify-between mb-4">
                <p className={`font-mono text-xs uppercase tracking-wider ${plan.highlight ? 'text-numa-primary dark:text-numa-accent font-semibold' : 'text-muted-foreground dark:text-numa-muted'}`}>
                  {plan.name}
                </p>
                <div>
                  <span className="text-2xl font-extrabold text-foreground dark:text-white">{plan.price}</span>
                  {plan.period && <span className="text-xs text-muted-foreground dark:text-numa-muted">{plan.period}</span>}
                </div>
              </div>
              <p className="text-xs text-muted-foreground dark:text-numa-muted-light mb-6 min-h-[32px]">{plan.description}</p>
              <ul className="space-y-3 text-sm text-foreground/80 dark:text-numa-text flex-1">
                {plan.features.map((feat, j) => (
                  <li key={j} className="flex items-start gap-3">
                    <Minus size={14} className={`mt-0.5 flex-shrink-0 ${plan.highlight ? 'text-numa-primary' : 'text-muted-foreground/50 dark:text-numa-dim'}`} />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => handleSelectPlan(plan.tier)}
                disabled={loadingTier !== null}
                className={`mt-8 w-full rounded-full py-3 text-sm font-medium text-center flex items-center justify-center gap-2 transition-all ${
                  plan.highlight
                    ? 'bg-numa-primary text-white font-semibold hover:shadow-[0_0_30px_rgba(45,126,121,0.35)]'
                    : 'border border-border bg-background text-foreground/80 hover:bg-accent hover:text-foreground dark:border-white/[.08] dark:bg-transparent dark:text-numa-text dark:hover:border-white/20 dark:hover:text-white'
                }`}
              >
                {loadingTier === plan.tier ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  plan.cta
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
