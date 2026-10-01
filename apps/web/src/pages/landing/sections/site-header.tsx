import type { RefObject } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Menu } from 'lucide-react';

type Props = {
  isMobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
  closeMobileMenu: () => void;
  menuToggleRef: RefObject<HTMLButtonElement>;
};

export function SiteHeader({
  isMobileMenuOpen,
  onToggleMobileMenu,
  closeMobileMenu,
  menuToggleRef,
}: Props) {
  return (
    <header className="site-header">
      <div className="page-shell nav-inner">
        <a href="#beranda" className="wordmark" aria-label="Numa, kembali ke beranda">
          <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path
              d="M5 25V8l9 7V5l13 10v12L14 17v10L5 20"
              stroke="currentColor"
              strokeWidth="3.2"
              strokeLinejoin="round"
            />
          </svg>
          <span>
            numa<span className="logo-period">.</span>
          </span>
        </a>

        <nav className="desktop-nav" aria-label="Navigasi utama">
          <a href="#alur">Alur kerja</a>
          <a href="#kendali">Untuk developer</a>
          <a href="#paket">Paket</a>
        </nav>

        <div className="nav-actions">
          <span className="nav-note">
            <span className="status-dot"></span>Dari ide ke eksekusi
          </span>
          <Link to="/login" className="button button-small button-dark">
            Coba Numa
            <ArrowUpRight />
          </Link>
          <button
            ref={menuToggleRef}
            type="button"
            className="mobile-toggle icon-button"
            aria-label={isMobileMenuOpen ? 'Tutup menu' : 'Buka menu'}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-menu"
            onClick={onToggleMobileMenu}
          >
            <Menu />
          </button>
        </div>
      </div>

      <nav id="mobile-menu" className="mobile-menu" aria-label="Navigasi seluler" hidden={!isMobileMenuOpen}>
        <a href="#alur" onClick={closeMobileMenu}>
          Alur kerja
        </a>
        <a href="#kendali" onClick={closeMobileMenu}>
          Untuk developer
        </a>
        <a href="#paket" onClick={closeMobileMenu}>
          Paket
        </a>
      </nav>
    </header>
  );
}
