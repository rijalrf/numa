import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/http';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Check, Sparkles, Loader2, AlertCircle } from 'lucide-react';

interface UserPlanData {
  plan: 'free' | 'starter' | 'pro';
  planName: string;
  quotaUsed: number;
  quotaMax: number;
  surveyRounds: number;
  charLimit: number;
  expiresAt: string | null;
}

const AVAILABLE_PLANS = [
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
  },
];

export function BillingPage() {
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: planData, isLoading } = useQuery<UserPlanData>({
    queryKey: ['user-plan'],
    queryFn: () => api<UserPlanData>('/api/user/plan'),
  });

  const handleUpgrade = async (tier: 'starter' | 'pro') => {
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
      const msg = err instanceof Error ? err.message : 'Gagal memproses pembayaran.';
      setErrorMsg(msg);
    } finally {
      setLoadingTier(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Memuat data langganan...</span>
      </div>
    );
  }

  const currentPlan = planData?.plan ?? 'free';
  const quotaPercentage = planData ? Math.min(100, Math.round((planData.quotaUsed / planData.quotaMax) * 100)) : 0;

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Langganan & Paket</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pantau status paket aktif, pemakaian kuota proyek, dan kelola peningkatan paket akun Anda.
        </p>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Kartu Status Saat Ini */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                Paket Aktif Saat Ini
              </CardTitle>
              <CardDescription>
                Rincian kuota dan batasan akun berdasarkan paket yang sedang berjalan.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="success" className="text-xs uppercase tracking-wider">
                {planData?.planName || 'Free Trial'}
              </Badge>
              {currentPlan !== 'free' && (
                <Badge variant="outline" className="text-xs">
                  Aktif
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border rounded-lg p-4 bg-muted/30 space-y-2">
              <div className="text-xs text-muted-foreground font-medium">Pemakaian Kuota Proyek</div>
              <div className="text-2xl font-bold">
                {planData?.quotaUsed} / {planData?.quotaMax}
              </div>
              <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-300"
                  style={{ width: `${quotaPercentage}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Tersisa {Math.max(0, (planData?.quotaMax ?? 0) - (planData?.quotaUsed ?? 0))} proyek dalam periode ini
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-muted/30 space-y-1">
              <div className="text-xs text-muted-foreground font-medium">Kedalaman Survey Kebutuhan</div>
              <div className="text-2xl font-bold">{planData?.surveyRounds} Putaran</div>
              <p className="text-[11px] text-muted-foreground">Jumlah putaran kuesioner terstruktur dari Konsultan Produk</p>
            </div>

            <div className="border rounded-lg p-4 bg-muted/30 space-y-1">
              <div className="text-xs text-muted-foreground font-medium">Batas Karakter Ide Awal</div>
              <div className="text-2xl font-bold">{planData?.charLimit.toLocaleString('id-ID')} Karakter</div>
              <p className="text-[11px] text-muted-foreground">Panjang maksimal deskripsi ide aplikasi yang dikirimkan</p>
            </div>
          </div>

          {planData?.expiresAt && (
            <div className="text-xs text-muted-foreground border-t pt-3">
              Masa aktif paket berakhir pada:{' '}
              <span className="font-medium text-foreground">
                {new Date(planData.expiresAt).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pilihan Paket */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Pilihan Paket Langganan</h2>
          <p className="text-xs text-muted-foreground">Pilih paket yang sesuai dengan intensitas pengembangan Anda.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {AVAILABLE_PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.id;

            return (
              <div
                key={plan.id}
                className={`relative rounded-xl border p-6 flex flex-col justify-between bg-card ${
                  isCurrent
                    ? 'border-primary ring-1 ring-primary'
                    : 'border-border'
                }`}
              >
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-primary text-primary-foreground text-[11px] font-medium rounded-full shadow-sm">
                    Paket Saat Ini
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-base text-foreground">{plan.name}</h3>
                    <div>
                      <span className="text-xl font-bold">{plan.price}</span>
                      {plan.period && <span className="text-xs text-muted-foreground">{plan.period}</span>}
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground min-h-[32px] mb-5">{plan.description}</p>

                  <ul className="space-y-2.5 text-xs text-foreground mb-6">
                    {plan.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-2">
                  {isCurrent ? (
                    <Button variant="outline" className="w-full text-xs" disabled>
                      Sedang Digunakan
                    </Button>
                  ) : plan.tier === 'free' ? (
                    <Button variant="outline" className="w-full text-xs" disabled>
                      Pilihan Awal
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleUpgrade(plan.tier)}
                      disabled={loadingTier !== null}
                      className="w-full text-xs gap-1.5"
                    >
                      {loadingTier === plan.tier ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Memproses...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>Tingkatkan ke {plan.name}</span>
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
