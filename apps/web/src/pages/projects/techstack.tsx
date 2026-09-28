// Halaman Pemilihan Teknologi: Rekomendasi AI, Starter Pack, atau Pilih Manual
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  Check,
  Package,
  Layers,
  Database,
  Globe,
  Server,
  Cpu,
  Lock,
  SlidersHorizontal,
} from 'lucide-react';
import { api } from '@/lib/http';
import { cn } from '@/lib/utils';
import { isStageLocked } from '@/lib/constants';
import { useWizardNav } from '@/components/layout/wizard-nav';

const PRESET_CATEGORIES = [
  {
    id: 'frontend',
    title: 'Frontend Framework & UI',
    icon: Globe,
    description: 'Antarmuka visual, framework UI, styling, dan komponen',
    options: ['React v18', 'Next.js 14', 'Vue.js v3', 'Svelte / SvelteKit', 'Tailwind CSS', 'shadcn/ui'],
  },
  {
    id: 'backend',
    title: 'Backend & Autentikasi',
    icon: Server,
    description: 'Server aplikasi, API endpoints, logika bisnis, dan autentikasi',
    options: ['TypeScript + Express', 'Node.js + Express', 'Better Auth', 'Python + FastAPI', 'Go Fiber', 'Laravel PHP', 'NestJS'],
  },
  {
    id: 'database',
    title: 'Database & ORM',
    icon: Database,
    description: 'Penyimpanan data persisten dan layer model objek relasional',
    options: ['SQLite + Prisma (Lokal)', 'PostgreSQL + Prisma', 'MySQL + Drizzle', 'MongoDB + Mongoose', 'Supabase (Postgres)'],
  },
  {
    id: 'devops',
    title: 'Deploy & Info',
    icon: Cpu,
    description: 'Lingkungan hosting, containerization, dan informasi deployment',
    options: ['Docker + Compose', 'Railway', 'Vercel', 'VPS Linux (Ubuntu)', 'DigitalOcean'],
  },
];

const STARTER_PACKS = [
  {
    id: 'react-express',
    title: 'React + Express',
    description: 'Stack fullstack JavaScript/TypeScript paling populer & fleksibel',
    tags: ['React v18', 'TypeScript + Express', 'PostgreSQL + Prisma', 'Docker + Compose'],
  },
  {
    id: 'vue-nest',
    title: 'Vue + NestJS',
    description: 'Arsitektur modular enterprise dengan ekosistem Vue modern',
    tags: ['Vue.js v3', 'NestJS', 'PostgreSQL + Prisma', 'Docker + Compose'],
  },
  {
    id: 'nextjs',
    title: 'Next.js Fullstack',
    description: 'Framework all-in-one React dengan SSR, API Routes & serverless',
    tags: ['Next.js 14', 'TypeScript', 'PostgreSQL + Prisma', 'Vercel'],
  },
  {
    id: 'laravel-mysql',
    title: 'Laravel + MySQL',
    description: 'Backend PHP tangguh & produktif dengan Tailwind CSS & MySQL',
    tags: ['Tailwind CSS', 'Laravel PHP', 'MySQL + Drizzle', 'VPS Linux (Ubuntu)'],
  },
];

export function TechStackPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [selectedMode, setSelectedMode] = useState<'ai' | 'starter' | 'manual'>('ai');
  const [selectedStarterPack, setSelectedStarterPack] = useState<string>('react-express');
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedByCategory, setSelectedByCategory] = useState<Record<string, string>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [generatingAi, setGeneratingAi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  // Load status project dan teknologi yang tersimpan
  useEffect(() => {
    if (!projectId) return;

    const loadTechStack = async () => {
      try {
        const json = await api<{ project?: { wizardStep?: string; stacks?: Array<{ name: string }> } }>(
          `/api/projects/${projectId}`
        );
        const currentStep = json.project?.wizardStep || 'techstack';
        const locked = isStageLocked(currentStep, 'techstack');
        setIsLocked(locked);

        const existing = json.project?.stacks || [];
        if (existing.length > 0) {
          setSelected(existing.map((s) => s.name));
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

    try {
      const recRes = await api<{ techStack?: string[]; reasoning?: string }>(
        `/api/projects/${projectId}/techstack/recommend`,
        { method: 'POST' }
      );

      const stackList = recRes.techStack && recRes.techStack.length > 0 ? recRes.techStack : [];

      if (stackList.length === 0) {
        alert('Gagal menghasilkan rekomendasi teknologi dari AI. Silakan coba lagi atau pilih secara manual.');
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
      alert('Terjadi kesalahan saat memproses rekomendasi AI.');
      setGeneratingAi(false);
    }
  };

  // Simpan pilihan starter pack
  const handleStarterPackProceed = async () => {
    if (!projectId || saving || isLocked) return;
    const pack = STARTER_PACKS.find((p) => p.id === selectedStarterPack);
    if (!pack) return;

    setSaving(true);
    try {
      await api(`/api/projects/${projectId}/techstack`, {
        method: 'PUT',
        body: JSON.stringify({ techStack: pack.tags }),
      });
      navigate(`/projects/${projectId}/prd`);
    } catch (err) {
      console.error('Error menyimpan starter pack:', err);
      alert('Terjadi kesalahan saat menyimpan pilihan teknologi.');
    } finally {
      setSaving(false);
    }
  };

  const handleCategorySelectChange = (categoryId: string, val: string) => {
    setSelectedByCategory((prev) => ({ ...prev, [categoryId]: val }));
  };

  // Simpan pilihan manual dan lanjut ke PRD
  const saveManualAndContinue = async () => {
    const list: string[] = [];
    for (const cat of PRESET_CATEGORIES) {
      const val = selectedByCategory[cat.id];
      if (val === '__other__') {
        const custom = customInputs[cat.id]?.trim();
        if (custom) list.push(custom);
      } else if (val) {
        list.push(val);
      }
    }

    if (list.length === 0) {
      alert('Pilih minimal 1 teknologi untuk melanjutkan.');
      return;
    }

    setSaving(true);
    try {
      await api(`/api/projects/${projectId}/techstack`, {
        method: 'PUT',
        body: JSON.stringify({ techStack: list }),
      });

      navigate(`/projects/${projectId}/prd`);
    } catch (err) {
      console.error('Error saving teknologi:', err);
      alert('Terjadi kesalahan saat menyimpan teknologi.');
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
              } else if (selectedMode === 'starter') {
                handleStarterPackProceed();
              } else {
                saveManualAndContinue();
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
          Pilih metode penentuan teknologi aplikasi Anda. Rekomendasi otomatis AI, paket populer siap pakai, atau pilih manual.
        </p>
      </div>

      {/* Grid 3 Mode */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
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
                AI menganalisis kebutuhan aplikasi untuk menyusun kombinasi teknologi paling pas dan modern.
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

        {/* CARD 2: Starter Pack Populer */}
        <div
          onClick={() => setSelectedMode('starter')}
          className={cn(
            'group relative rounded-md border-2 p-5 flex flex-col justify-between cursor-pointer transition-all duration-200 select-none shadow-xs',
            selectedMode === 'starter'
              ? 'border-primary bg-primary/5 dark:bg-primary/10 ring-2 ring-primary/30 shadow-md'
              : 'border-border bg-card hover:border-primary/50 hover:bg-accent/40'
          )}
        >
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div
                className={cn(
                  'h-10 w-10 rounded-md flex items-center justify-center transition-colors',
                  selectedMode === 'starter'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-primary/10 text-primary group-hover:bg-primary/20'
                )}
              >
                <Package className="h-5 w-5" />
              </div>
              <div
                className={cn(
                  'h-5 w-5 rounded-md flex items-center justify-center border transition-all',
                  selectedMode === 'starter'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/40 bg-background'
                )}
              >
                {selectedMode === 'starter' && <Check className="h-3 w-3 stroke-[3]" />}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Starter Pack</h3>
                <Badge variant="outline" className="text-[9px] border-border text-muted-foreground font-medium px-1.5 py-0">
                  Paket Populer
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Pilih paket arsitektur teruji yang sering digunakan developer: React, Vue, Next.js, atau Laravel.
              </p>
            </div>
          </div>

          <div className="pt-4">
            <span
              className={cn(
                'text-xs font-medium block text-center py-1.5 rounded-md transition-colors',
                selectedMode === 'starter' ? 'text-primary font-semibold' : 'text-muted-foreground'
              )}
            >
              {selectedMode === 'starter' ? 'Pilihan Terpilih' : 'Klik untuk memilih'}
            </span>
          </div>
        </div>

        {/* CARD 3: Pilih Sendiri (Manual) */}
        <div
          onClick={() => setSelectedMode('manual')}
          className={cn(
            'group relative rounded-md border-2 p-5 flex flex-col justify-between cursor-pointer transition-all duration-200 select-none shadow-xs',
            selectedMode === 'manual'
              ? 'border-primary bg-primary/5 dark:bg-primary/10 ring-2 ring-primary/30 shadow-md'
              : 'border-border bg-card hover:border-primary/50 hover:bg-accent/40'
          )}
        >
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div
                className={cn(
                  'h-10 w-10 rounded-md flex items-center justify-center transition-colors',
                  selectedMode === 'manual'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground group-hover:bg-muted/80'
                )}
              >
                <SlidersHorizontal className="h-5 w-5" />
              </div>
              <div
                className={cn(
                  'h-5 w-5 rounded-md flex items-center justify-center border transition-all',
                  selectedMode === 'manual'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/40 bg-background'
                )}
              >
                {selectedMode === 'manual' && <Check className="h-3 w-3 stroke-[3]" />}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Pilih Sendiri</h3>
                <Badge variant="outline" className="text-[9px] text-muted-foreground font-medium px-1.5 py-0">
                  Manual
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Tentukan secara bebas kombinasi framework, database, dan deploy per kategori via dropdown.
              </p>
            </div>
          </div>

          <div className="pt-4">
            <span
              className={cn(
                'text-xs font-medium block text-center py-1.5 rounded-md transition-colors',
                selectedMode === 'manual' ? 'text-primary font-semibold' : 'text-muted-foreground'
              )}
            >
              {selectedMode === 'manual' ? 'Pilihan Terpilih' : 'Klik untuk memilih'}
            </span>
          </div>
        </div>
      </div>

      {/* Pilihan Opsi Starter Pack jika mode 'starter' dipilih */}
      {selectedMode === 'starter' && (
        <div className="space-y-3 pt-2">
          <div className="text-xs font-semibold text-foreground">
            Pilih Salah Satu Starter Pack:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {STARTER_PACKS.map((pack) => {
              const isSelected = selectedStarterPack === pack.id;
              return (
                <div
                  key={pack.id}
                  onClick={() => setSelectedStarterPack(pack.id)}
                  className={cn(
                    'p-4 rounded-md border cursor-pointer transition-all space-y-2',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border bg-card hover:border-primary/40'
                  )}
                >
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
              );
            })}
          </div>
        </div>
      )}

      {/* Panel Form Manual jika mode 'manual' dipilih */}
      {selectedMode === 'manual' && (
        <Card className="border-border shadow-xs pt-2">
          <CardHeader className="pb-3 bg-muted/20 border-b border-border">
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <span>Pilih Teknologi</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Tentukan opsi teknologi untuk setiap lapisan arsitektur aplikasi Anda
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5 pt-5">
            {PRESET_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const currentVal = selectedByCategory[cat.id] || '';
              const customVal = customInputs[cat.id] || '';

              return (
                <div key={cat.id} className="space-y-2 pb-4 border-b border-border/60 last:border-b-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary shrink-0" />
                    <label className="text-xs font-semibold text-foreground">
                      {cat.title}
                    </label>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {cat.description}
                  </p>

                  <div className="space-y-2 pt-1 max-w-md">
                    <select
                      value={currentVal}
                      onChange={(e) => handleCategorySelectChange(cat.id, e.target.value)}
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                    >
                      <option value="">Pilih {cat.title}...</option>
                      {cat.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                      <option value="__other__">Lainnya (Ketik Sendiri)...</option>
                    </select>

                    {currentVal === '__other__' && (
                      <Input
                        placeholder={`Ketik ${cat.title.toLowerCase()} kustom...`}
                        value={customVal}
                        onChange={(e) =>
                          setCustomInputs((prev) => ({ ...prev, [cat.id]: e.target.value }))
                        }
                        className="h-8 text-xs bg-background mt-1.5"
                        autoFocus
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
