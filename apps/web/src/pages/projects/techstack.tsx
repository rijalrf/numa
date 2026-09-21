// Tech Stack page: Pilihan 2 Card (Rekomendasi AI vs Pilih Sendiri) + Form manual
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  Check,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Plus,
  X,
  Layers,
  Cpu,
  Database,
  Globe,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Lock,
} from 'lucide-react';
import { api } from '@/lib/http';
import { cn } from '@/lib/utils';
import { isStageLocked } from '@/lib/constants';
import { useWizardNav } from '@/components/layout/wizard-nav';

// Preset kategori untuk form manual
const PRESET_CATEGORIES = [
  {
    id: 'frontend',
    title: 'Frontend Framework',
    icon: Globe,
    description: 'Antarmuka visual dan pengalaman interaksi pengguna',
    options: ['React v18+', 'Next.js 14', 'Vue.js v3', 'Svelte / SvelteKit', 'Angular', 'Remix'],
  },
  {
    id: 'styling',
    title: 'Styling & UI',
    icon: Layers,
    description: 'Sistem desain, styling CSS, dan komponen UI',
    options: ['Tailwind CSS v3', 'shadcn/ui', 'Chakra UI', 'Ant Design', 'CSS Modules'],
  },
  {
    id: 'backend',
    title: 'Backend & API',
    icon: Server,
    description: 'Server aplikasi, logika bisnis, dan penyedia endpoint API',
    options: ['Node.js + Express', 'TypeScript + Express', 'Python + FastAPI', 'Go Fiber', 'Laravel PHP', 'NestJS'],
  },
  {
    id: 'database',
    title: 'Database & ORM',
    icon: Database,
    description: 'Penyimpanan data persisten dan layer model objek relasional',
    options: ['PostgreSQL + Prisma', 'MySQL + Drizzle', 'SQLite (Lokal)', 'MongoDB + Mongoose', 'Supabase (Postgres)'],
  },
  {
    id: 'auth',
    title: 'Autentikasi & Keamanan',
    icon: ShieldCheck,
    description: 'Sistem login, sesi pengguna, token PAT, dan kontrol akses',
    options: ['Better Auth', 'NextAuth / Auth.js', 'JWT Cookie Session', 'Clerk Auth', 'Supabase Auth'],
  },
  {
    id: 'devops',
    title: 'Deployment & DevOps',
    icon: Cpu,
    description: 'Lingkungan hosting, kontainerisasi, dan otomatisasi deploy',
    options: ['Docker + Compose', 'Railway', 'Vercel', 'VPS Linux (Ubuntu)', 'DigitalOcean', 'AWS EC2'],
  },
];

export function TechStackPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [selectedMode, setSelectedMode] = useState<'ai' | 'manual'>('ai');
  const [view, setView] = useState<'select' | 'manual'>('select');
  const [selected, setSelected] = useState<string[]>([]);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});

  // Load status project dan tech stack yang tersimpan
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
        console.error('Gagal load tech stack:', err);
      }
    };

    loadTechStack();
  }, [projectId]);

  // Alur Rekomendasi AI: Generate langsung & simpan ke DB lalu otomatis redirect ke PRD
  const handleAiGenerateAndProceed = async () => {
    if (!projectId || generatingAi || isLocked) return;
    setGeneratingAi(true);

    try {
      // 1. Panggil rekomendasi AI
      const recRes = await api<{ techStack?: string[]; reasoning?: string }>(
        `/api/projects/${projectId}/techstack/recommend`,
        { method: 'POST' }
      );

      const stackList = recRes.techStack && recRes.techStack.length > 0 ? recRes.techStack : [];

      if (stackList.length === 0) {
        alert('Gagal menghasilkan rekomendasi tech stack dari AI. Silakan coba lagi atau pilih secara manual.');
        setGeneratingAi(false);
        return;
      }

      // 2. Simpan tech stack terpilih ke backend (otomatis memajukan wizardStep ke prd)
      await api(`/api/projects/${projectId}/techstack`, {
        method: 'PUT',
        body: JSON.stringify({ techStack: stackList }),
      });

      // 3. Langsung navigasi ke halaman PRD
      navigate(`/projects/${projectId}/prd`);
    } catch (err) {
      console.error('Error saat generate & simpan tech stack AI:', err);
      alert('Terjadi kesalahan saat memproses rekomendasi AI.');
      setGeneratingAi(false);
    }
  };

  const toggleSelection = (label: string) => {
    if (isLocked) return;
    setSelected((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const handleAddCustom = (categoryId: string) => {
    if (isLocked) return;
    const val = customInputs[categoryId]?.trim();
    if (!val) return;

    if (!selected.includes(val)) {
      setSelected((prev) => [...prev, val]);
    }
    setCustomInputs((prev) => ({ ...prev, [categoryId]: '' }));
  };

  const handleKeyDownCustom = (e: React.KeyboardEvent<HTMLInputElement>, categoryId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCustom(categoryId);
    }
  };

  // Simpan pilihan manual dan lanjut ke PRD
  const saveAndContinue = async () => {
    if (selected.length === 0) {
      alert('Pilih minimal 1 teknologi untuk melanjutkan.');
      return;
    }

    setSaving(true);
    try {
      await api(`/api/projects/${projectId}/techstack`, {
        method: 'PUT',
        body: JSON.stringify({ techStack: selected }),
      });

      navigate(`/projects/${projectId}/prd`);
    } catch (err) {
      console.error('Error saving tech stack:', err);
      alert('Terjadi kesalahan saat menyimpan tech stack.');
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
    view === 'manual'
      ? {
          back: {
            label: 'Pilihan Metode',
            onClick: () => setView('select'),
          },
          next: {
            label: 'Simpan & Lanjut ke PRD',
            onClick: saveAndContinue,
            disabled: selected.length === 0,
            loading: saving,
          },
        }
      : isLocked
      ? {
          back: {
            label: 'Kembali ke Chat',
            onClick: handleBackToChat,
          },
          next: {
            label: 'Lanjut ke PRD',
            onClick: () => navigate(`/projects/${projectId}/prd`),
          },
        }
      : {
          back: {
            label: 'Kembali ke Chat',
            onClick: handleBackToChat,
          },
          next:
            selectedMode === 'ai'
              ? {
                  label: 'Lanjut ke PRD (Rekomendasi AI)',
                  onClick: handleAiGenerateAndProceed,
                  loading: generatingAi,
                }
              : {
                  label: 'Lanjut Pilih Manual',
                  onClick: () => setView('manual'),
                },
        }
  );

  // ============================================================
  // TAMPILAN 1: READ-ONLY (JIKA TAHAP TECH STACK SUDAH DILEWATI/TERKUNCI)
  // ============================================================
  if (isLocked) {
    return (
      <div className="max-w-4xl mx-auto w-full space-y-6">
        <div className="flex items-center gap-2.5 p-3.5 bg-muted/70 border border-border rounded-xl text-xs text-muted-foreground shadow-xs">
          <Lock className="h-4 w-4 text-primary shrink-0" />
          <span>
            Tahap Tech Stack telah selesai dan terkunci (Read-Only). Konfigurasi arsitektur teknologi tersimpan permanen dan tidak dapat diubah lagi.
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
                Tidak ada data tech stack tersimpan.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selected.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30 text-xs font-medium"
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
  // TAMPILAN 2: FORM PILIHAN MANUAL TECH STACK
  // ============================================================
  if (view === 'manual') {
    return (
      <div className="max-w-4xl mx-auto w-full space-y-6">
        {/* Status pilihan */}
        <div className="flex items-center justify-end pb-1">
          <span className="text-xs text-muted-foreground bg-muted/60 px-3 py-1 rounded-full">
            {selected.length} teknologi dipilih
          </span>
        </div>

        {/* Bagian Form Pilihan Manual per Kategori */}
        <Card className="border-border shadow-xs">
          <CardHeader className="pb-3 bg-muted/20 border-b border-border">
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <span>Pilihan Manual Tech Stack</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Pilih opsi teknologi yang tersedia atau ketik teknologi kustom Anda pada setiap lapisan aplikasi
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5 pt-4">
            {PRESET_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const customValue = customInputs[cat.id] || '';

              return (
                <div key={cat.id} className="space-y-2 pb-4 border-b border-border/60 last:border-b-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold text-foreground">
                      {cat.title}
                    </span>
                    <span className="text-[11px] text-muted-foreground hidden sm:inline">
                      — {cat.description}
                    </span>
                  </div>

                  {/* Pilihan preset badge */}
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {cat.options.map((opt) => {
                      const isSelected = selected.some(
                        (s) => s.toLowerCase().includes(opt.toLowerCase()) || opt.toLowerCase().includes(s.toLowerCase())
                      );

                      return (
                        <Badge
                          key={opt}
                          variant={isSelected ? 'default' : 'outline'}
                          onClick={() => toggleSelection(opt)}
                          className={cn(
                            'cursor-pointer px-2.5 py-1 text-xs transition-all font-normal',
                            isSelected
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'hover:border-primary/50 hover:bg-accent/50'
                          )}
                        >
                          {isSelected && <Check className="h-3 w-3 mr-1" />}
                          {opt}
                        </Badge>
                      );
                    })}
                  </div>

                  {/* Tambah kustom per kategori */}
                  <div className="flex gap-2 max-w-sm pt-1">
                    <Input
                      placeholder={`Tambah ${cat.title.toLowerCase()} lain...`}
                      value={customValue}
                      onChange={(e) =>
                        setCustomInputs((prev) => ({ ...prev, [cat.id]: e.target.value }))
                      }
                      onKeyDown={(e) => handleKeyDownCustom(e, cat.id)}
                      className="h-8 text-xs bg-background"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleAddCustom(cat.id)}
                      disabled={!customValue.trim()}
                      className="h-8 px-2.5 text-xs gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      Tambah
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Ringkasan Teknologi Terpilih */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">
              Daftar Teknologi Terpilih ({selected.length})
            </span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => setSelected([])}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors"
              >
                Kosongkan Pilihan
              </button>
            )}
          </div>

          {selected.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-1">
              Belum ada teknologi yang dipilih. Klik badge kategori di atas untuk memilih teknologi.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {selected.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/30 text-xs font-medium"
                >
                  <span className="truncate max-w-xs">{item}</span>
                  <button
                    type="button"
                    onClick={() => toggleSelection(item)}
                    className="hover:text-destructive hover:bg-destructive/10 rounded p-0.5 transition-colors"
                    title="Hapus"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Footer Form Manual */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border">
          <div className="text-xs">
            {selected.length === 0 ? (
              <span className="text-destructive font-medium">
                Pilih minimal 1 teknologi untuk melanjutkan ke penyusunan PRD
              </span>
            ) : (
              <span className="text-primary font-medium">
                {selected.length} teknologi terpilih.
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // TAMPILAN 3: DUA CARD UTAMA ("Mau Pake Teknologi apa?")
  // ============================================================
  return (
    <div className="max-w-3xl mx-auto w-full space-y-8 py-4">
      {/* Header Utama */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Mau Pake Teknologi apa?
        </h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Pilih metode penentuan tech stack aplikasi Anda. Anda dapat menyerahkan analisis arsitektur ke AI atau memilihnya secara manual.
        </p>
      </div>

      {/* Grid 2 Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
        {/* CARD 1: Rekomendasi AI (Default) */}
        <div
          onClick={() => setSelectedMode('ai')}
          className={cn(
            'group relative rounded-2xl border-2 p-6 flex flex-col justify-between cursor-pointer transition-all duration-200 select-none shadow-xs',
            selectedMode === 'ai'
              ? 'border-primary bg-primary/5 dark:bg-primary/10 ring-2 ring-primary/30 shadow-md'
              : 'border-border bg-card hover:border-primary/50 hover:bg-accent/40'
          )}
        >
          <div className="space-y-4">
            {/* Header Card: Icon & Radio Status */}
            <div className="flex items-start justify-between gap-3">
              <div
                className={cn(
                  'h-12 w-12 rounded-xl flex items-center justify-center transition-colors',
                  selectedMode === 'ai'
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                    : 'bg-primary/10 text-primary group-hover:bg-primary/20'
                )}
              >
                <Sparkles className="h-6 w-6" />
              </div>

              <div
                className={cn(
                  'h-5 w-5 rounded-full flex items-center justify-center border transition-all',
                  selectedMode === 'ai'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/40 bg-background'
                )}
              >
                {selectedMode === 'ai' && <Check className="h-3 w-3 stroke-[3]" />}
              </div>
            </div>

            {/* Konten Card */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-foreground">
                  Rekomendasi AI
                </h3>
                <Badge variant="outline" className="text-[10px] border-primary/40 text-primary font-medium">
                  Rekomendasi
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                AI menganalisis ide aplikasi dari obrolan brainstorming untuk menyusun kombinasi stack paling optimal, stabil, dan modern.
              </p>
            </div>

            {/* Poin Keunggulan */}
            <div className="space-y-1.5 pt-2 border-t border-border/60 text-xs text-foreground/80">
              <div className="flex items-center gap-2 text-[11px]">
                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>Analisis otomatis sesuai skala aplikasi</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>Kompatibilitas modul frontend & backend terjamin</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>Langsung generate & siap lanjut ke PRD</span>
              </div>
            </div>
          </div>

          <div className="pt-6">
            <span
              className={cn(
                'text-xs font-semibold block text-center py-2 rounded-lg transition-colors',
                selectedMode === 'ai'
                  ? 'text-primary'
                  : 'text-muted-foreground'
              )}
            >
              {selectedMode === 'ai' ? 'Pilihan Terpilih' : 'Klik untuk memilih'}
            </span>
          </div>
        </div>

        {/* CARD 2: Pilih Sendiri (Manual) */}
        <div
          onClick={() => setSelectedMode('manual')}
          className={cn(
            'group relative rounded-2xl border-2 p-6 flex flex-col justify-between cursor-pointer transition-all duration-200 select-none shadow-xs',
            selectedMode === 'manual'
              ? 'border-primary bg-primary/5 dark:bg-primary/10 ring-2 ring-primary/30 shadow-md'
              : 'border-border bg-card hover:border-primary/50 hover:bg-accent/40'
          )}
        >
          <div className="space-y-4">
            {/* Header Card: Icon & Radio Status */}
            <div className="flex items-start justify-between gap-3">
              <div
                className={cn(
                  'h-12 w-12 rounded-xl flex items-center justify-center transition-colors',
                  selectedMode === 'manual'
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                    : 'bg-muted text-muted-foreground group-hover:bg-muted/80'
                )}
              >
                <SlidersHorizontal className="h-6 w-6" />
              </div>

              <div
                className={cn(
                  'h-5 w-5 rounded-full flex items-center justify-center border transition-all',
                  selectedMode === 'manual'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/40 bg-background'
                )}
              >
                {selectedMode === 'manual' && <Check className="h-3 w-3 stroke-[3]" />}
              </div>
            </div>

            {/* Konten Card */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-foreground">
                  Pilih Sendiri
                </h3>
                <Badge variant="outline" className="text-[10px] text-muted-foreground font-medium">
                  Manual
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Tentukan sendiri kombinasi arsitektur per kategori (Frontend, Backend, Database, Auth, dan DevOps) sesuai standar tim Anda.
              </p>
            </div>

            {/* Poin Keunggulan */}
            <div className="space-y-1.5 pt-2 border-t border-border/60 text-xs text-foreground/80">
              <div className="flex items-center gap-2 text-[11px]">
                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>Kendali penuh atas setiap layer aplikasi</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>Daftar preset framework populer & opsi custom</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>Cocok untuk kebutuhan spesifik perusahaan</span>
              </div>
            </div>
          </div>

          <div className="pt-6">
            <span
              className={cn(
                'text-xs font-semibold block text-center py-2 rounded-lg transition-colors',
                selectedMode === 'manual'
                  ? 'text-primary'
                  : 'text-muted-foreground'
              )}
            >
              {selectedMode === 'manual' ? 'Pilihan Terpilih' : 'Klik untuk memilih'}
            </span>
          </div>
        </div>
      </div>

      {/* Info Eksekusi */}
      <div className="pt-4 border-t border-border text-center">
        <p className="text-xs text-muted-foreground">
          {selectedMode === 'ai'
            ? 'Pilihan Rekomendasi AI aktif. Gunakan tombol di bar navigasi atas untuk lanjut ke penyusunan PRD.'
            : 'Pilihan Manual aktif. Gunakan tombol di bar navigasi atas untuk membuka formulir kategori teknologi.'}
        </p>
      </div>
    </div>
  );
}
