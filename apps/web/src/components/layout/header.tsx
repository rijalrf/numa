// Header global: logo & judul halaman di kiri, nama project aktif, toggle tema, dan menu pengguna di kanan.
import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/http';
import { signOut, useSession } from '@/lib/auth-client';
import { ensureDefaultToken } from '@/lib/ensure-default-token';
import { useTheme } from '@/components/theme-provider';
import { useWizardNavContext } from './wizard-nav';
import { NumaLogo } from '@/components/ui/numa-logo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PricingDialog } from '@/components/billing/pricing-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  ChevronDown,
  ChevronLeft,
  Check,
  LogOut,
  FolderGit2,
  Building2,
  User,
  CreditCard,
  Sun,
  Moon,
  Monitor,
  BarChart3,
} from 'lucide-react';

function getPageHeaderInfo(pathname: string): { title: string; subtitle?: string } | null {
  if (pathname.includes('/survey') || pathname.includes('/interview')) {
    return {
      title: 'Survey Kebutuhan',
      subtitle: 'Wawancara terstruktur untuk merumuskan spesifikasi produk',
    };
  }
  if (pathname.includes('/board')) {
    return {
      title: 'Board Task',
      subtitle: 'Kelola tugas implementasi aplikasi',
    };
  }
  if (pathname.includes('/techstack')) {
    return {
      title: 'Pilih Tech Stack',
      subtitle: 'Tentukan arsitektur dan teknologi untuk membangun aplikasi',
    };
  }
  if (pathname.includes('/prd') || pathname.includes('/brd')) {
    return {
      title: 'Product Requirements Document',
      subtitle: 'Dokumen spesifikasi kebutuhan produk aplikasi Anda',
    };
  }
  if (pathname.includes('/tree')) {
    return {
      title: 'Diagram Struktur Aplikasi',
      subtitle: 'Peta hierarki fitur, sub-fitur, dan langkah implementasi teknis',
    };
  }
  if (pathname.includes('/guide')) {
    return {
      title: 'Panduan Eksekusi AI Agent',
      subtitle: 'Langkah-langkah menjalankan eksekusi otomatis oleh AI agent coding',
    };
  }
  if (pathname === '/settings/billing') {
    return {
      title: 'Langganan & Paket',
      subtitle: 'Pantau pemakaian kuota dan kelola paket langganan Anda',
    };
  }
  if (pathname.includes('/settings')) {
    return {
      title: 'Pengaturan Proyek',
      subtitle: 'Pengaturan konfigurasi dan token akses proyek',
    };
  }
  if (pathname === '/chat' || pathname.startsWith('/chat/')) {
    return {
      title: 'Brainstorming Ide',
      subtitle: 'Diskusi ide aplikasi untuk menyusun kebutuhan awal',
    };
  }
  if (pathname === '/projects' || pathname.startsWith('/projects?')) {
    return {
      title: 'Daftar Proyek',
      subtitle: 'Kelola semua proyek aplikasi yang sudah Anda buat',
    };
  }
  if (pathname === '/admin/usage') {
    return {
      title: 'Pemakaian AI',
      subtitle: 'Total token dan request, rincian per tahap, user, dan paket untuk menimbang harga',
    };
  }
  if (pathname === '/orgs') {
    return {
      title: 'Organisasi',
      subtitle: 'Kelola tim, anggota, dan peran akses project',
    };
  }
  if (pathname === '/profile') {
    return {
      title: 'Profil & Token Akses',
      subtitle: 'Informasi akun dan manajemen Token Akses Agen (PAT)',
    };
  }

  return null;
}

export function Header() {
  const { data } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const [pricingOpen, setPricingOpen] = useState(false);
  const { config: wizardNavConfig } = useWizardNavContext();
  const staticPageInfo = getPageHeaderInfo(location.pathname);
  const pageInfo = staticPageInfo
    ? {
        title: wizardNavConfig?.headerTitle || staticPageInfo.title,
        subtitle:
          wizardNavConfig?.headerSubtitle !== undefined
            ? wizardNavConfig.headerSubtitle
            : staticPageInfo.subtitle,
      }
    : null;

  // Pastikan token default dibuat pada sesi pertama
  useEffect(() => {
    if (data?.user) {
      ensureDefaultToken();
    }
  }, [data?.user]);

  // Ambil info paket user untuk badge dan upgrade
  const { data: planData } = useQuery<{
    plan: 'free' | 'starter' | 'pro';
    planName: string;
  }>({
    queryKey: ['user-plan'],
    queryFn: () => api('/api/user/plan'),
    enabled: !!data?.user,
    staleTime: 1000 * 60 * 5,
  });

  // Status admin platform menentukan tampilnya menu Pemakaian AI. Kunci query sama dengan guard di App.tsx.
  const { data: profileData } = useQuery({
    queryKey: ['user-profile'],
    queryFn: () => api<{ user: { onboardingCompletedAt: string | null; isPlatformAdmin?: boolean } }>('/api/user/profile'),
    enabled: !!data?.user,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  // Ambil projectId jika sedang berada di sub-halaman proyek
  const projectMatch = location.pathname.match(/^\/projects\/([^/]+)/);
  const projectId = projectMatch && projectMatch[1] && projectMatch[1] !== 'new' && projectMatch[1] !== 'undefined'
    ? projectMatch[1]
    : null;

  const { data: projectData } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<{ project: { id: string; name: string; description?: string | null; idea?: string } }>(`/api/projects/${projectId}`),
    enabled: !!projectId,
    staleTime: 1000 * 60 * 5,
  });

  const projectName = projectData?.project?.name;

  return (
    <header className="border-b bg-background/95 backdrop-blur-xs">
      <div className="px-6 py-2.5 flex items-center justify-between gap-4">
        {/* Kiri: Logo Numa + Pemisah + Judul Halaman & Label Deskripsi */}
        <div className="flex items-center gap-3.5 min-w-0">
          <Link to="/chat" className="flex items-center shrink-0">
            <NumaLogo size="default" />
          </Link>

          {pageInfo && (
            <>
              <div className="h-5 w-[1px] bg-border shrink-0" />
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-semibold text-foreground tracking-tight truncate leading-tight">
                  {pageInfo.title}
                </h1>
                {pageInfo.subtitle && (
                  <p className="text-[11px] sm:text-xs text-muted-foreground truncate leading-tight mt-0.5 hidden sm:block">
                    {pageInfo.subtitle}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Kanan: Nama App | Level Info | Profile */}
        <div className="flex items-center gap-3 shrink-0 justify-end">
          {projectName && (
            <>
              <span
                className="text-sm sm:text-base font-bold text-foreground tracking-tight truncate max-w-[180px] sm:max-w-[260px]"
                title={projectName}
              >
                {projectName}
              </span>
              <div className="h-5 w-[1px] bg-border shrink-0" />
            </>
          )}

          {data?.user ? (
            <div className="flex items-center gap-2.5">
              {/* Tombol Upgrade & Level Info */}
              <div className="flex items-center gap-1.5">
                {planData?.plan !== 'pro' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    onClick={() => setPricingOpen(true)}
                    className="h-7 px-2.5 text-xs font-semibold cursor-pointer shrink-0 shadow-xs"
                  >
                    Upgrade
                  </Button>
                )}
                <Badge
                  variant="outline"
                  className="text-xs font-semibold px-2 py-0.5 bg-primary/10 border-primary/25 text-primary shrink-0"
                >
                  {planData?.planName || 'Free Trial'}
                </Badge>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted transition-colors text-sm cursor-pointer">
                  <Avatar className="h-8 w-8">
                    {data.user.image && <AvatarImage src={data.user.image} alt={data.user.name ?? 'Pengguna'} />}
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {data.user.name?.charAt(0).toUpperCase() || data.user.email?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 overflow-visible">
                  <div className="px-3 py-2 text-sm">
                    <div className="font-medium">{data.user.name || 'Pengguna'}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{data.user.email}</div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/profile')}>
                    <User className="h-4 w-4 mr-2" />
                    Profil & Token
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/projects')}>
                    <FolderGit2 className="h-4 w-4 mr-2" />
                    Proyek Saya
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/orgs')}>
                    <Building2 className="h-4 w-4 mr-2" />
                    Organisasi
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/settings/billing')}>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Langganan & Paket
                  </DropdownMenuItem>
                  {profileData?.user?.isPlatformAdmin && (
                    <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/admin/usage')}>
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Pemakaian AI
                    </DropdownMenuItem>
                  )}

                  {/* Menu Tampilan dengan Submenu on Hover */}
                  <div className="relative group/theme">
                    <div className="flex items-center justify-between px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer select-none">
                      <div className="flex items-center">
                        <Sun className="h-4 w-4 mr-2 text-muted-foreground" />
                        <span>Tampilan</span>
                      </div>
                      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    </div>

                    {/* Submenu hover (muncul di sisi kiri menu utama) */}
                    <div className="absolute right-full top-0 pr-1 hidden group-hover/theme:block z-50">
                      <div className="w-36 rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0">
                        <DropdownMenuItem
                          className="cursor-pointer flex items-center justify-between"
                          onClick={() => setTheme('light')}
                        >
                          <div className="flex items-center">
                            <Sun className="h-4 w-4 mr-2 text-muted-foreground" />
                            <span>Terang</span>
                          </div>
                          {theme === 'light' && <Check className="h-3.5 w-3.5 text-primary" />}
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          className="cursor-pointer flex items-center justify-between"
                          onClick={() => setTheme('dark')}
                        >
                          <div className="flex items-center">
                            <Moon className="h-4 w-4 mr-2 text-muted-foreground" />
                            <span>Gelap</span>
                          </div>
                          {theme === 'dark' && <Check className="h-3.5 w-3.5 text-primary" />}
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          className="cursor-pointer flex items-center justify-between"
                          onClick={() => setTheme('system')}
                        >
                          <div className="flex items-center">
                            <Monitor className="h-4 w-4 mr-2 text-muted-foreground" />
                            <span>Sistem</span>
                          </div>
                          {theme === 'system' && <Check className="h-3.5 w-3.5 text-primary" />}
                        </DropdownMenuItem>
                      </div>
                    </div>
                  </div>

                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="cursor-pointer text-red-600 focus:text-red-600"
                    onClick={async () => {
                      await signOut();
                      navigate('/login');
                    }}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Keluar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </div>
      </div>

      {/* Modal Popup Harga / Upgrade */}
      <PricingDialog
        isOpen={pricingOpen}
        onClose={() => setPricingOpen(false)}
        title="Tingkatkan Paket Akun Anda"
        description="Pilih paket langganan yang sesuai untuk mendapatkan kuota proyek lebih banyak dan batas pesan yang lebih tinggi."
      />
    </header>
  );
}
