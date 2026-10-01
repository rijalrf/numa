import { ArrowUpRight } from 'lucide-react';

export function SiteFooter() {
  return (
    <footer className="site-footer page-shell">
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
      <p>Ide tetap milikmu. Arahnya kita susun bersama.</p>
      <div>
        <a href="#faq">Tanya jawab</a>
        <span>© 2026 Numa</span>
        <a href="#beranda" className="back-top" aria-label="Kembali ke atas">
          <ArrowUpRight />
        </a>
      </div>
    </footer>
  );
}
