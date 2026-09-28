export function LandingFooter() {
  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    const elem = document.getElementById(targetId);
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.pushState(null, '', `#${targetId}`);
    }
  };

  return (
    <footer className="border-t border-border/80 bg-slate-50/70 dark:border-white/[.06] dark:bg-black">
      <div className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1.6fr_1fr] md:gap-8">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-numa-primary to-numa-accent">
                <span className="text-xs font-bold text-white">N</span>
              </div>
              <span className="text-base font-bold tracking-tight text-foreground dark:text-white">Numa</span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-6 text-muted-foreground dark:text-numa-muted">Ubah ide jadi software. Perencanaan berbasis AI dari konsep awal hingga siap dieksekusi agent.</p>
          </div>
          <div>
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground dark:text-numa-muted">Produk</p>
            <ul className="space-y-3 text-sm text-foreground/80 dark:text-numa-text">
              <li>
                <a
                  href="#features"
                  onClick={(e) => handleNavClick(e, 'features')}
                  className="transition-colors hover:text-foreground dark:hover:text-white cursor-pointer"
                >
                  Fitur
                </a>
              </li>
              <li>
                <a
                  href="#workflow"
                  onClick={(e) => handleNavClick(e, 'workflow')}
                  className="transition-colors hover:text-foreground dark:hover:text-white cursor-pointer"
                >
                  Cara Kerja
                </a>
              </li>
              <li>
                <a
                  href="#pricing"
                  onClick={(e) => handleNavClick(e, 'pricing')}
                  className="transition-colors hover:text-foreground dark:hover:text-white cursor-pointer"
                >
                  Harga
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/80 pt-8 sm:flex-row dark:border-white/[.06]">
          <p className="text-xs text-muted-foreground/60 dark:text-numa-dim">2026 Numa. Hak cipta dilindungi.</p>
          <p className="text-xs text-muted-foreground/60 dark:text-numa-dim">Dibuat untuk developer yang membangun dengan AI.</p>
        </div>
      </div>
    </footer>
  );
}
