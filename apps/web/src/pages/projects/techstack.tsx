// Halaman Pemilihan Teknologi: 4 Golden Pack terstandarisasi atau Rekomendasi AI
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Sparkles,
  Package,
  Layers,
  Lock,
  AlertCircle,
} from 'lucide-react';
import { api } from '@/lib/http';
import { pollAiJob, type AiJobResponse } from '@/lib/ai-job';
import { isStageLocked } from '@/lib/constants';
import { useWizardNav } from '@/components/layout/wizard-nav';
import { ModeCard } from '@/components/wizard/mode-card';
import { GoldenPackList } from '@/components/wizard/golden-pack-list';
import { SelectedTechsList } from '@/components/wizard/selected-techs-list';
import { AiRecommendationCard, type RecommendationStatus } from '@/components/wizard/ai-recommendation-card';

export const GOLDEN_PACKS = [
  {
    id: 'react-express',
    title: 'React + Express',
    description: 'Fullstack TypeScript modular: React 18, Express, Prisma ORM',
    tags: ['frontend:React v18', 'backend:TypeScript + Express', 'styling:Tailwind CSS', 'testing:Playwright'],
    dbOptions: [
      { id: 'database:PostgreSQL + Prisma', label: 'PostgreSQL + Prisma' },
      { id: 'database:SQLite + Prisma', label: 'SQLite + Prisma (Lokal)' },
      { id: 'database:MySQL + Prisma', label: 'MySQL + Prisma' },
      { id: 'database:Supabase (Postgres) + Prisma', label: 'Supabase (Postgres)' },
    ],
  },
  {
    id: 'vue-nest',
    title: 'Vue + NestJS',
    description: 'Arsitektur modular enterprise: NestJS (DI/Providers), Vue 3, Prisma ORM',
    tags: ['frontend:Vue.js v3', 'backend:NestJS', 'styling:Tailwind CSS', 'testing:Playwright'],
    dbOptions: [
      { id: 'database:PostgreSQL + Prisma', label: 'PostgreSQL + Prisma' },
      { id: 'database:SQLite + Prisma', label: 'SQLite + Prisma (Lokal)' },
      { id: 'database:MySQL + Prisma', label: 'MySQL + Prisma' },
      { id: 'database:Supabase (Postgres) + Prisma', label: 'Supabase (Postgres)' },
    ],
  },
  {
    id: 'nextjs-fullstack',
    title: 'Next.js Fullstack',
    description: 'Framework all-in-one React: App Router, Server Actions, Prisma ORM',
    tags: ['frontend:Next.js 14', 'backend:Next.js', 'styling:Tailwind CSS', 'testing:Playwright'],
    dbOptions: [
      { id: 'database:PostgreSQL + Prisma', label: 'PostgreSQL + Prisma' },
      { id: 'database:SQLite + Prisma', label: 'SQLite + Prisma (Lokal)' },
      { id: 'database:MySQL + Prisma', label: 'MySQL + Prisma' },
      { id: 'database:Supabase (Postgres) + Prisma', label: 'Supabase (Postgres)' },
    ],
  },
  {
    id: 'laravel',
    title: 'Laravel PHP',
    description: 'Monolit MVC tangguh: Laravel, Tailwind CSS, Eloquent ORM',
    tags: ['frontend:Tailwind CSS', 'backend:Laravel PHP', 'styling:Tailwind CSS', 'testing:Playwright'],
    dbOptions: [
      { id: 'database:MySQL + Eloquent', label: 'MySQL + Eloquent' },
      { id: 'database:PostgreSQL + Eloquent', label: 'PostgreSQL + Eloquent' },
      { id: 'database:SQLite + Eloquent', label: 'SQLite + Eloquent' },
    ],
  },
] as const;

// Polling lebih rapat dari default (3 dtk): job rekomendasi pendek.
const RECOMMEND_POLL_INTERVAL_MS = 1500;
const RECOMMEND_POLL_MAX_ATTEMPTS = 240; // 6 menit, sama dengan batas default

type Recommendation = { techStack: string[]; reasoning: string };

/** Nama Golden Pack dari daftar tag hasil rekomendasi (cocokkan tag backend). */
function packTitleOf(techStack: string[]): string | undefined {
  return GOLDEN_PACKS.find((p) => p.tags.some((t) => t.startsWith('backend:') && techStack.includes(t)))?.title;
}

export function TechStackPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [selectedMode, setSelectedMode] = useState<'ai' | 'pack'>('ai');
  const [selectedPackId, setSelectedPackId] = useState<string>('react-express');
  const [selectedDbByPack, setSelectedDbByPack] = useState<Record<string, string>>({
    'react-express': 'database:PostgreSQL + Prisma',
    'vue-nest': 'database:PostgreSQL + Prisma',
    'nextjs-fullstack': 'database:PostgreSQL + Prisma',
    'laravel': 'database:MySQL + Eloquent',
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [recStatus, setRecStatus] = useState<RecommendationStatus>('loading');
  // Penjaga StrictMode: satu permintaan rekomendasi otomatis dan satu poller aktif.
  const autoRequested = useRef(false);
  const stopPolling = useRef<(() => void) | null>(null);
  const [saving, setSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Pantau job rekomendasi sampai selesai (hasil bisa sudah disiapkan lebih dulu oleh survey).
  const watchRecommendation = useCallback(() => {
    if (!projectId) return;
    setRecStatus('generating');
    stopPolling.current?.();
    stopPolling.current = pollAiJob(projectId, 'techstack_recommend', {
      intervalMs: RECOMMEND_POLL_INTERVAL_MS,
      maxAttempts: RECOMMEND_POLL_MAX_ATTEMPTS,
      onDone: (result) => {
        if (result?.techStack?.length) {
          setRec({ techStack: result.techStack, reasoning: result.reasoning ?? '' });
          setRecStatus('ready');
        } else {
          setRecStatus('failed');
          setErrorMessage('AI tidak menghasilkan rekomendasi teknologi. Coba lagi atau pilih paket secara manual.');
        }
      },
      onFailed: (error) => {
        setRecStatus('failed');
        setErrorMessage(error || 'AI gagal merekomendasikan teknologi.');
      },
      onTimeout: () => {
        setRecStatus('failed');
        setErrorMessage('Proses rekomendasi memakan waktu lama. Silakan coba lagi.');
      },
    });
  }, [projectId]);

  const requestRecommendation = useCallback(async () => {
    if (!projectId) return;
    setErrorMessage(null);
    setRecStatus('generating');
    try {
      await api(`/api/projects/${projectId}/techstack/recommend`, { method: 'POST' });
      watchRecommendation();
    } catch (err) {
      console.error('Gagal meminta rekomendasi teknologi:', err);
      setRecStatus('failed');
      setErrorMessage((err as Error).message || 'Terjadi kesalahan saat meminta rekomendasi AI.');
    }
  }, [projectId, watchRecommendation]);

  // Saat halaman terbuka: pakai hasil yang sudah siap, tunggu yang sedang berjalan, atau minta baru.
  const loadRecommendation = useCallback(async () => {
    if (!projectId) return;
    try {
      const job = await api<AiJobResponse>(`/api/projects/${projectId}/ai-jobs?type=techstack_recommend`);
      if (job.status === 'done' && job.result?.techStack?.length) {
        setRec({ techStack: job.result.techStack, reasoning: job.result.reasoning ?? '' });
        setRecStatus('ready');
      } else if (job.status === 'queued' || job.status === 'running' || job.status === 'generating') {
        watchRecommendation();
      } else if (job.status === 'failed') {
        setRecStatus('failed');
        setErrorMessage(job.error || 'AI gagal merekomendasikan teknologi.');
      } else if (!autoRequested.current) {
        autoRequested.current = true;
        await requestRecommendation();
      }
    } catch (err) {
      console.error('Gagal memuat rekomendasi teknologi:', err);
      setRecStatus('failed');
    }
  }, [projectId, watchRecommendation, requestRecommendation]);

  // Load status project dan teknologi yang tersimpan
  useEffect(() => {
    if (!projectId) return;

    const loadTechStack = async () => {
      try {
        const json = await api<{ project?: { wizardStep?: string; stacks?: Array<{ name: string; category?: string }> } }>(
          `/api/projects/${projectId}`
        );
        const currentStep = json.project?.wizardStep || 'techstack';
        const locked = isStageLocked(currentStep, 'techstack');
        setIsLocked(locked);
        if (!locked) void loadRecommendation();

        const existing = json.project?.stacks || [];
        if (existing.length > 0) {
          setSelected(existing.map((s) => (s.category ? `${s.category}:${s.name}` : s.name)));
        }
      } catch (err) {
        console.error('Gagal memuat teknologi:', err);
      }
    };

    loadTechStack();
    return () => stopPolling.current?.();
  }, [projectId, loadRecommendation]);

  // Simpan rekomendasi AI yang sudah dikonfirmasi user, lalu lanjut ke PRD
  const handleAiProceed = async () => {
    if (!projectId || saving || isLocked || !rec) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      await api(`/api/projects/${projectId}/techstack`, {
        method: 'PUT',
        body: JSON.stringify({ techStack: rec.techStack }),
      });
      navigate(`/projects/${projectId}/prd`);
    } catch (err) {
      console.error('Gagal menyimpan tech stack:', err);
      setErrorMessage((err as Error).message || 'Gagal menyimpan pilihan teknologi.');
    } finally {
      setSaving(false);
    }
  };

  // Simpan pilihan Golden Pack manual
  const handlePackProceed = async () => {
    if (!projectId || saving || isLocked) return;
    const pack = GOLDEN_PACKS.find((p) => p.id === selectedPackId);
    if (!pack) return;

    const dbOption = selectedDbByPack[pack.id] || pack.dbOptions[0].id;
    const fullStack = [...pack.tags, dbOption];

    setSaving(true);
    setErrorMessage(null);

    try {
      await api(`/api/projects/${projectId}/techstack`, {
        method: 'PUT',
        body: JSON.stringify({ techStack: fullStack }),
      });
      navigate(`/projects/${projectId}/prd`);
    } catch (err) {
      console.error('Error menyimpan pilihan paket:', err);
      setErrorMessage((err as Error).message || 'Terjadi kesalahan saat menyimpan pilihan teknologi.');
    } finally {
      setSaving(false);
    }
  };

  const handleBackToChat = async () => {
    if (!projectId) return;
    try {
      const res = await api<{ ok: boolean; chatSessionId?: string }>(`/api/projects/${projectId}/wizard-step`, {
        method: 'POST',
        body: JSON.stringify({ step: 'chat' }),
      });
      if (res.chatSessionId) {
        navigate(`/chat/${res.chatSessionId}`);
        return;
      }
      navigate('/');
    } catch {
      navigate('/');
    }
  };

  const aiNotReady = selectedMode === 'ai' && recStatus !== 'ready';

  useWizardNav(
    isLocked
      ? {
          back: {
            label: 'Kembali',
            onClick: handleBackToChat,
          },
          next: {
            label: 'Lanjut',
            onClick: () => navigate(`/projects/${projectId}/prd`),
          },
        }
      : {
          back: {
            label: 'Kembali',
            onClick: handleBackToChat,
          },
          next: {
            label: saving ? 'Menyimpan...' : 'Lanjut',
            onClick: () => {
              if (selectedMode === 'ai') {
                handleAiProceed();
              } else {
                handlePackProceed();
              }
            },
            disabled: aiNotReady,
            loading: saving,
          },
        }
  );

  // ============================================================
  // TAMPILAN 1: READ-ONLY (JIKA TAHAP SUDAH DILEWATI/TERKUNCI)
  // ============================================================
  if (isLocked) {
    return (
      <div className="max-w-4xl mx-auto w-full space-y-6">
        <div className="flex items-center gap-2.5 p-3.5 bg-muted/70 border border-border rounded-md text-xs text-muted-foreground shadow-xs">
          <Lock className="h-4 w-4 text-primary shrink-0" />
          <span>
            Tahap pemilihan teknologi telah selesai dan terkunci. Konfigurasi arsitektur teknologi tersimpan permanen.
          </span>
        </div>

        <Card className="border-border shadow-xs">
          <CardHeader className="pb-3 border-b bg-muted/20">
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <span>Daftar Arsitektur Teknologi Terpilih</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Teknologi yang digunakan untuk mengimplementasikan proyek ini
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <SelectedTechsList items={selected} />
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============================================================
  // TAMPILAN UTAMA: PILIH METODE PENENTUAN TEKNOLOGI
  // ============================================================
  return (
    <div className="max-w-4xl mx-auto w-full space-y-8 py-4">
      <div className="text-center space-y-2">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Pilih Teknologi
        </h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Numa menjamin best practice dan keamanan melalui 4 Golden Stack terstandarisasi.
        </p>
      </div>

      {errorMessage && (
        <div className="p-3.5 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-md flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Grid 2 Mode Utama */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        <ModeCard
          icon={<Sparkles className="h-5 w-5" />}
          title="Rekomendasi AI"
          description="AI menganalisis kebutuhan proyek dan mencocokkan ke Golden Stack + database paling optimal secara otomatis."
          badge={{ text: 'Rekomendasi', className: 'border-primary/40 text-primary' }}
          isSelected={selectedMode === 'ai'}
          onClick={() => setSelectedMode('ai')}
        />

        <ModeCard
          icon={<Package className="h-5 w-5" />}
          title="Pilih Golden Stack"
          description="Pilih kombinasi framework teruji (React+Express, Vue+NestJS, Next.js, atau Laravel) beserta database pilihan."
          badge={{ text: '4 Paket', className: 'border-border text-muted-foreground' }}
          isSelected={selectedMode === 'pack'}
          onClick={() => setSelectedMode('pack')}
        />
      </div>

      {/* Hasil rekomendasi AI untuk dikonfirmasi jika mode 'ai' dipilih */}
      {selectedMode === 'ai' && (
        <AiRecommendationCard
          status={recStatus}
          packTitle={rec ? packTitleOf(rec.techStack) : undefined}
          techStack={rec?.techStack ?? []}
          reasoning={rec?.reasoning ?? ''}
          onRetry={requestRecommendation}
        />
      )}

      {/* Daftar 4 Golden Pack jika mode 'pack' dipilih */}
      {selectedMode === 'pack' && (
        <div className="space-y-4 pt-2">
          <div className="text-xs font-semibold text-foreground flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <span>Pilih Paket dan Database:</span>
          </div>

          <GoldenPackList
            selectedPackId={selectedPackId}
            selectedDbByPack={selectedDbByPack}
            onSelectPack={setSelectedPackId}
            onSelectDb={(packId, dbId) => {
              setSelectedPackId(packId);
              setSelectedDbByPack((prev) => ({ ...prev, [packId]: dbId }));
            }}
          />
        </div>
      )}
    </div>
  );
}
