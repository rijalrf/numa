import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/auth-client';
import { api } from '@/lib/http';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertCircle, Code, Compass, User } from 'lucide-react';
import { useWizardNav } from '@/components/layout/wizard-nav';

const EXPERIENCE_OPTIONS = [
  { id: 'pemula', label: 'Pemula', desc: 'Baru belajar atau baru mulai mencoba pemrograman' },
  { id: 'menengah', label: 'Menengah', desc: 'Sudah terbiasa membangun fitur atau aplikasi kecil' },
  { id: 'mahir', label: 'Mahir', desc: 'Berpengalaman mendesain arsitektur dan sistem produksi' },
] as const;

const REFERRAL_OPTIONS = [
  { id: 'google', label: 'Google', desc: 'Pencarian web atau artikel tutorial' },
  { id: 'media_sosial', label: 'Media sosial', desc: 'Twitter/X, LinkedIn, Instagram, atau TikTok' },
  { id: 'teman', label: 'Teman', desc: 'Rekomendasi rekan kerja, teman, atau komunitas' },
  { id: 'lainnya', label: 'Lainnya', desc: 'Sumber lain di luar pilihan di atas' },
] as const;

export function OnboardingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: session } = useSession();

  const [step, setStep] = useState(0);
  const [name, setName] = useState(session?.user?.name || '');
  const [experience, setExperience] = useState<string>('');
  const [source, setSource] = useState<string>('');
  const [sourceDetail, setSourceDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (skip = false) => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    try {
      const payload = skip
        ? {}
        : {
            name: name.trim() || undefined,
            codingExperience: experience || undefined,
            referralSource: source || undefined,
            referralDetail: source === 'lainnya' && sourceDetail.trim() ? sourceDetail.trim() : undefined,
          };

      await api('/api/user/onboarding', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      await qc.invalidateQueries({ queryKey: ['user-profile'] });
      navigate('/chat', { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan profil.';
      setError(msg);
      setSubmitting(false);
    }
  };

  const isNextDisabled =
    submitting ||
    (step === 0 && !name.trim()) ||
    (step === 1 && !experience) ||
    (step === 2 && (!source || (source === 'lainnya' && !sourceDetail.trim())));

  useWizardNav({
    back: step > 0 ? { label: 'Kembali', onClick: () => setStep((s) => s - 1), disabled: submitting } : null,
    next: {
      label: step === 2 ? (submitting ? 'Menyimpan...' : 'Selesai') : 'Lanjut',
      onClick: () => (step < 2 ? setStep((s) => s + 1) : handleSubmit(false)),
      disabled: isNextDisabled,
      loading: submitting,
    },
    extra: (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => handleSubmit(true)}
        disabled={submitting}
        className="text-xs h-8 text-muted-foreground hover:text-foreground"
      >
        Lewati
      </Button>
    ),
  });

  return (
    <div className="max-w-xl mx-auto py-10 px-4 space-y-6">
      {/* Indikator Langkah */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Langkah {step + 1} dari 3</span>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((idx) => (
            <div
              key={idx}
              className={`h-1.5 rounded-full transition-all ${
                idx === step ? 'w-6 bg-primary' : idx < step ? 'w-2 bg-primary/50' : 'w-2 bg-muted'
              }`}
            />
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Step 0: Nama */}
      {step === 0 && (
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center gap-2 text-primary text-xs font-medium mb-1">
              <User className="h-4 w-4" />
              <span>Profil Pengguna</span>
            </div>
            <CardTitle className="text-xl">Siapa nama Anda?</CardTitle>
            <CardDescription>
              Nama ini akan ditampilkan pada profil dan sesi kerja coding agent Anda.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="user-name" className="text-xs font-medium text-foreground">
                Nama Lengkap / Panggilan
              </label>
              <Input
                id="user-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Budi Santoso"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim()) {
                    e.preventDefault();
                    setStep(1);
                  }
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Pengalaman Ngoding */}
      {step === 1 && (
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center gap-2 text-primary text-xs font-medium mb-1">
              <Code className="h-4 w-4" />
              <span>Keahlian Teknis</span>
            </div>
            <CardTitle className="text-xl">Seberapa pengalaman Anda ngoding?</CardTitle>
            <CardDescription>
              Informasi ini membantu AI menyesuaikan penjelasan arsitektur dan tingkat detail task.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {EXPERIENCE_OPTIONS.map((opt) => {
              const isSelected = experience === opt.id;
              return (
                <div
                  key={opt.id}
                  onClick={() => setExperience(opt.id)}
                  className={`p-3.5 rounded-md border text-xs cursor-pointer transition-all flex items-start gap-3 ${
                    isSelected
                      ? 'border-primary bg-primary/10 text-foreground font-medium shadow-2xs'
                      : 'border-border/70 hover:bg-muted/40 text-foreground/80'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    <div
                      className={`h-4 w-4 rounded-full border flex items-center justify-center transition-colors ${
                        isSelected ? 'border-primary' : 'border-muted-foreground/40'
                      }`}
                    >
                      {isSelected && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">{opt.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Dari mana tahu Numa */}
      {step === 2 && (
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center gap-2 text-primary text-xs font-medium mb-1">
              <Compass className="h-4 w-4" />
              <span>Sumber Informasi</span>
            </div>
            <CardTitle className="text-xl">Dari mana Anda tahu Numa?</CardTitle>
            <CardDescription>
              Bantu kami mengetahui kanal komunikasi yang paling bermanfaat bagi Anda.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {REFERRAL_OPTIONS.map((opt) => {
              const isSelected = source === opt.id;
              return (
                <div
                  key={opt.id}
                  onClick={() => setSource(opt.id)}
                  className={`p-3.5 rounded-md border text-xs cursor-pointer transition-all flex items-start gap-3 ${
                    isSelected
                      ? 'border-primary bg-primary/10 text-foreground font-medium shadow-2xs'
                      : 'border-border/70 hover:bg-muted/40 text-foreground/80'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    <div
                      className={`h-4 w-4 rounded-full border flex items-center justify-center transition-colors ${
                        isSelected ? 'border-primary' : 'border-muted-foreground/40'
                      }`}
                    >
                      {isSelected && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">{opt.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</div>
                  </div>
                </div>
              );
            })}

            {source === 'lainnya' && (
              <div className="pt-2 space-y-2">
                <label htmlFor="source-detail" className="text-xs font-medium text-foreground">
                  Sebutkan sumbernya:
                </label>
                <Input
                  id="source-detail"
                  value={sourceDetail}
                  onChange={(e) => setSourceDetail(e.target.value)}
                  placeholder="Contoh: Podcast teknologi, grup Telegram..."
                  autoFocus
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
