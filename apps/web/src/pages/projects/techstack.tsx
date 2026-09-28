// Halaman Pemilihan Teknologi: 4 Golden Pack terstandarisasi atau Rekomendasi AI
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  Check,
  Package,
  Layers,
  Database,
  Lock,
  AlertCircle,
} from 'lucide-react';
import { api } from '@/lib/http';
import { cn } from '@/lib/utils';
import { isStageLocked } from '@/lib/constants';
import { useWizardNav } from '@/components/layout/wizard-nav';

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
  const [generatingAi, setGeneratingAi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

        const existing = json.project?.stacks || [];
        if (existing.length > 0) {
          setSelected(existing.map((s) => (s.category ? `${s.category}:${s.name}` : s.name)));
        }
      } catch (err) {
        console.error('Gagal memuat teknologi:', err);
      }
    };

    loadTechStack();
  }, [projectId]);

  // Alur Rekomendasi AI
  const handleAiGenerateAndProceed = async () => {
    if (!projectId || generatingAi || isLocked) return;
    setGeneratingAi(true);
    setErrorMessage(null);

    try {
      const recRes = await api<{ techStack?: string[]; reasoning?: string }>(
        `/api/projects/${projectId}/techstack/recommend`,
        { method: 'POST' }
      );

      const stackList = recRes.techStack && recRes.techStack.length > 0 ? recRes.techStack : [];

      if (stackList.length === 0) {
        setErrorMessage('Gagal menghasilkan rekomendasi teknologi dari AI. Silakan pilih paket secara manual.');
        setGeneratingAi(false);
        return;
      }

      await api(`/api/projects/${projectId}/techstack`, {
        method: 'PUT',
        body: JSON.stringify({ techStack: stackList }),
      });

      navigate(`/projects/${projectId}/prd`);
    } catch (err) {
      console.error('Error saat generate & simpan teknologi AI:', err);
      setErrorMessage((err as Error).message || 'Terjadi kesalahan saat memproses rekomendasi AI.');
      setGeneratingAi(false);
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
            label: generatingAi || saving ? 'Menyimpan...' : 'Lanjut',
            onClick: () => {
              if (selectedMode === 'ai') {
                handleAiGenerateAndProceed();
              } else {
                handlePackProceed();
              }
            },
            loading: generatingAi || saving,
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
            {selected.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-2">
                Tidak ada data teknologi tersimpan.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selected.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 text-primary border border-primary/30 text-xs font-medium"
                  >
                    <Check className="h-3 w-3" />
                    <span>{item}</span>
                  </span>
                ))}
              </div>
            )}
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
        {/* CARD 1: Rekomendasi AI */}
        <div
          onClick={() => setSelectedMode('ai')}
          className={cn(
            'group relative rounded-md border-2 p-5 flex flex-col justify-between cursor-pointer transition-all duration-200 select-none shadow-xs',
            selectedMode === 'ai'
              ? 'border-primary bg-primary/5 dark:bg-primary/10 ring-2 ring-primary/30 shadow-md'
              : 'border-border bg-card hover:border-primary/50 hover:bg-accent/40'
          )}
        >
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div
                className={cn(
                  'h-10 w-10 rounded-md flex items-center justify-center transition-colors',
                  selectedMode === 'ai'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-primary/10 text-primary group-hover:bg-primary/20'
                )}
              >
                <Sparkles className="h-5 w-5" />
              </div>
              <div
                className={cn(
                  'h-5 w-5 rounded-md flex items-center justify-center border transition-all',
                  selectedMode === 'ai'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/40 bg-background'
                )}
              >
                {selectedMode === 'ai' && <Check className="h-3 w-3 stroke-[3]" />}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Rekomendasi AI</h3>
                <Badge variant="outline" className="text-[9px] border-primary/40 text-primary font-medium px-1.5 py-0">
                  Rekomendasi
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                AI menganalisis kebutuhan proyek dan mencocokkan ke Golden Stack + database paling optimal secara otomatis.
              </p>
            </div>
          </div>

          <div className="pt-4">
            <span
              className={cn(
                'text-xs font-medium block text-center py-1.5 rounded-md transition-colors',
                selectedMode === 'ai' ? 'text-primary font-semibold' : 'text-muted-foreground'
              )}
            >
              {selectedMode === 'ai' ? 'Pilihan Terpilih' : 'Klik untuk memilih'}
            </span>
          </div>
        </div>

        {/* CARD 2: Pilih Golden Stack */}
        <div
          onClick={() => setSelectedMode('pack')}
          className={cn(
            'group relative rounded-md border-2 p-5 flex flex-col justify-between cursor-pointer transition-all duration-200 select-none shadow-xs',
            selectedMode === 'pack'
              ? 'border-primary bg-primary/5 dark:bg-primary/10 ring-2 ring-primary/30 shadow-md'
              : 'border-border bg-card hover:border-primary/50 hover:bg-accent/40'
          )}
        >
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div
                className={cn(
                  'h-10 w-10 rounded-md flex items-center justify-center transition-colors',
                  selectedMode === 'pack'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-primary/10 text-primary group-hover:bg-primary/20'
                )}
              >
                <Package className="h-5 w-5" />
              </div>
              <div
                className={cn(
                  'h-5 w-5 rounded-md flex items-center justify-center border transition-all',
                  selectedMode === 'pack'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/40 bg-background'
                )}
              >
                {selectedMode === 'pack' && <Check className="h-3 w-3 stroke-[3]" />}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Pilih Golden Stack</h3>
                <Badge variant="outline" className="text-[9px] border-border text-muted-foreground font-medium px-1.5 py-0">
                  4 Paket
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Pilih kombinasi framework teruji (React+Express, Vue+NestJS, Next.js, atau Laravel) beserta database pilihan.
              </p>
            </div>
          </div>

          <div className="pt-4">
            <span
              className={cn(
                'text-xs font-medium block text-center py-1.5 rounded-md transition-colors',
                selectedMode === 'pack' ? 'text-primary font-semibold' : 'text-muted-foreground'
              )}
            >
              {selectedMode === 'pack' ? 'Pilihan Terpilih' : 'Klik untuk memilih'}
            </span>
          </div>
        </div>
      </div>

      {/* Daftar 4 Golden Pack jika mode 'pack' dipilih */}
      {selectedMode === 'pack' && (
        <div className="space-y-4 pt-2">
          <div className="text-xs font-semibold text-foreground flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <span>Pilih Paket dan Database:</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {GOLDEN_PACKS.map((pack) => {
              const isSelected = selectedPackId === pack.id;
              const currentDb = selectedDbByPack[pack.id] || pack.dbOptions[0].id;

              return (
                <div
                  key={pack.id}
                  onClick={() => setSelectedPackId(pack.id)}
                  className={cn(
                    'p-4 rounded-md border cursor-pointer transition-all space-y-3 flex flex-col justify-between',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border bg-card hover:border-primary/40'
                  )}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        {pack.title}
                      </span>
                      <div
                        className={cn(
                          'h-4 w-4 rounded-md flex items-center justify-center border text-[10px]',
                          isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
                        )}
                      >
                        {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {pack.description}
                    </p>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {pack.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-foreground/80 font-mono"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Pilihan Database per Pack */}
                  <div
                    className="pt-3 border-t border-border/70 space-y-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                      <Database className="h-3 w-3 text-primary" />
                      <span>Database:</span>
                    </div>
                    <div className="grid grid-cols-1 gap-1">
                      {pack.dbOptions.map((db) => {
                        const isDbSelected = currentDb === db.id;
                        return (
                          <label
                            key={db.id}
                            className={cn(
                              'flex items-center gap-2 p-1.5 rounded-md text-[11px] cursor-pointer transition-colors border',
                              isDbSelected
                                ? 'bg-primary/10 border-primary/40 text-primary font-medium'
                                : 'hover:bg-muted/60 border-transparent text-muted-foreground'
                            )}
                            onClick={() => {
                              setSelectedPackId(pack.id);
                              setSelectedDbByPack((prev) => ({ ...prev, [pack.id]: db.id }));
                            }}
                          >
                            <input
                              type="radio"
                              name={`db-${pack.id}`}
                              checked={isDbSelected}
                              onChange={() => {
                                setSelectedPackId(pack.id);
                                setSelectedDbByPack((prev) => ({ ...prev, [pack.id]: db.id }));
                              }}
                              className="h-3 w-3 text-primary focus:ring-primary border-border"
                            />
                            <span>{db.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
