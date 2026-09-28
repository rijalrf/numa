import { Link } from 'react-router-dom';
import { useSession } from '@/lib/auth-client';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export function LandingHeader() {
  const { data } = useSession();
  const isAuthenticated = !!data?.user;

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    const elem = document.getElementById(targetId);
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.pushState(null, '', `#${targetId}`);
    }
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/80 bg-background/80 backdrop-blur-xl dark:border-white/[.06]">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <a href="#" className="group flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-numa-primary to-numa-accent shadow-[0_0_20px_rgba(118,184,167,.25)] transition-shadow group-hover:shadow-[0_0_28px_rgba(118,184,167,.4)]">
            <span className="text-sm font-bold text-white">N</span>
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground dark:text-white">Numa</span>
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          <a
            href="#features"
            onClick={(e) => handleNavClick(e, 'features')}
            className="text-[13px] text-muted-foreground transition-colors hover:text-foreground dark:text-numa-text dark:hover:text-white cursor-pointer"
          >
            Fitur
          </a>
          <a
            href="#workflow"
            onClick={(e) => handleNavClick(e, 'workflow')}
            className="text-[13px] text-muted-foreground transition-colors hover:text-foreground dark:text-numa-text dark:hover:text-white cursor-pointer"
          >
            Cara Kerja
          </a>
          <a
            href="#pricing"
            onClick={(e) => handleNavClick(e, 'pricing')}
            className="text-[13px] text-muted-foreground transition-colors hover:text-foreground dark:text-numa-text dark:hover:text-white cursor-pointer"
          >
            Harga
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            to={isAuthenticated ? '/chat' : '/login'}
            className="inline-flex items-center gap-2 rounded-md bg-gradient-to-b from-numa-primary to-[#237069] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_0_16px_rgba(45,126,121,.3),inset_0_1px_0_rgba(255,255,255,.1)] transition-all hover:shadow-[0_0_24px_rgba(45,126,121,.5)] active:translate-y-px"
          >
            Mulai
          </Link>
        </div>
      </div>
    </header>
  );
}
