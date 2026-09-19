// Header global: logo & judul halaman di kiri, nama project aktif, toggle tema, dan menu pengguna di kanan.
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/http';
import { signOut, useSession } from '@/lib/auth-client';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChevronDown, LogOut, FolderGit2, User } from 'lucide-react';

function getPageHeaderInfo(pathname: string): { title: string; subtitle?: string } | null {
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
  if (pathname.includes('/brd')) {
    return {
      title: 'Business Requirements Document',
      subtitle: 'Dokumen spesifikasi kebutuhan bisnis aplikasi Anda',
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
  if (pathname.includes('/settings')) {
    return {
      title: 'Pengaturan Proyek',
      subtitle: 'Pengaturan konfigurasi dan token akses proyek',
    };
  }
  if (pathname.startsWith('/chat/')) {
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
  const pageInfo = getPageHeaderInfo(location.pathname);

  // Ambil projectId jika sedang berada di sub-halaman proyek
  const projectMatch = location.pathname.match(/^\/projects\/([^/]+)/);
  const projectId = projectMatch && projectMatch[1] && projectMatch[1] !== 'new' && projectMatch[1] !== 'undefined'
    ? projectMatch[1]
    : null;

  const { data: projectData } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<{ project: { id: string; name: string } }>(`/api/projects/${projectId}`),
    enabled: !!projectId,
    staleTime: 1000 * 60 * 5,
  });

  const projectName = projectData?.project?.name;

  return (
    <header className="border-b bg-background/95 backdrop-blur-xs">
      <div className="px-6 py-2.5 flex items-center justify-between gap-4">
        {/* Kiri: Logo pake.ai + Pemisah + Judul & Subjudul Halaman */}
        <div className="flex items-center gap-3.5 min-w-0">
          <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-[#2D7E79] to-[#76B8A7]">
              <span className="text-xs font-bold text-white">N</span>
            </div>
            <span className="font-semibold text-lg tracking-tight text-foreground">Numa</span>
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

        {/* Kanan: Nama Project Aktif + Toggle Tema + Menu Pengguna */}
        <div className="flex items-center gap-2.5 shrink-0 justify-end">
          {projectName && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/60 border border-border/80 text-xs font-medium text-foreground max-w-[180px] sm:max-w-[240px] truncate shadow-2xs"
              title={`Proyek Aktif: ${projectName}`}
            >
              <FolderGit2 className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate">{projectName}</span>
            </div>
          )}

          <ThemeToggle />
          {data?.user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted transition-colors text-sm">
                <Avatar className="h-8 w-8">
                  {data.user.image && <AvatarImage src={data.user.image} alt={data.user.name ?? 'Pengguna'} />}
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {data.user.name?.charAt(0).toUpperCase() || data.user.email?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <div className="px-3 py-2 text-sm">
                  <div className="font-medium">{data.user.name || 'Pengguna'}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{data.user.email}</div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/projects')}>
                  <FolderGit2 className="h-4 w-4 mr-2" />
                  Proyek Saya
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/profile')}>
                  <User className="h-4 w-4 mr-2" />
                  Profil & Token
                </DropdownMenuItem>
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
          ) : null}
        </div>
      </div>
    </header>
  );
}
