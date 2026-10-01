import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

export function ClosingSection() {
  return (
    <section className="closing scroll-reveal">
      <div className="closing-inner page-shell">
        <div>
          <p className="eyebrow">
            <span className="tiny-line"></span>IDE BERIKUTNYA SUDAH ADA DI KEPALAMU.
          </p>
          <h2>
            Sekarang, beri
            <br />
            arah yang jelas.
          </h2>
        </div>
        <div className="closing-right">
          <Link to="/login" className="button button-dark">
            Mari mulai dari idemu
            <ArrowUpRight />
          </Link>
          <p>Langkah pertama nggak harus sempurna.</p>
        </div>
        <div className="closing-orbit" aria-hidden="true"></div>
      </div>
    </section>
  );
}
