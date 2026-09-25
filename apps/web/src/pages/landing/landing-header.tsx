import { Link } from 'react-router-dom';
import { useSession } from '@/lib/auth-client';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export function LandingHeader() {
  const { data } = useSession();
  const isAuthenticated = !!data?.user;

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/80 bg-background/80 backdrop-blur-xl dark:border-white/[.06] dark:bg-[#0A0F0F]/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <a href="#" className="group flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-numa-primary to-numa-accent shadow-[0_0_20px_rgba(118,184,167,.25)] transition-shadow group-hover:shadow-[0_0_28px_rgba(118,184,167,.4)]">
            <span className="text-sm font-bold text-white">N</span>
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground dark:text-white">Numa</span>
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground dark:text-numa-text dark:hover:text-white">Fitur</a>
          <a href="#workflow" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground dark:text-numa-text dark:hover:text-white">Cara Kerja</a>
          <a href="#pricing" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground dark:text-numa-text dark:hover:text-white">Harga</a>
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          {isAuthenticated ? (
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-b from-numa-primary to-[#237069] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_0_16px_rgba(45,126,121,.3),inset_0_1px_0_rgba(255,255,255,.1)] transition-all hover:shadow-[0_0_24px_rgba(45,126,121,.5)] active:translate-y-px"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="hidden text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground dark:text-numa-text dark:hover:text-white sm:inline-flex"
              >
                Masuk
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-b from-numa-primary to-[#237069] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_0_16px_rgba(45,126,121,.3),inset_0_1px_0_rgba(255,255,255,.1)] transition-all hover:shadow-[0_0_24px_rgba(45,126,121,.5)] active:translate-y-px"
              >
                Mulai
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
