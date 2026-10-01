import { Link } from 'react-router-dom';
import { ArrowUpRight, Check } from 'lucide-react';

export function PricingSection() {
  return (
    <section id="paket" className="pricing-section page-shell">
      <div className="pricing-heading scroll-reveal">
        <div>
          <p className="eyebrow">
            <span className="tiny-line"></span>03 / RUANG UNTUK TUMBUH
          </p>
          <h2 className="section-title">Mulai kecil. Bangun sesuatu.</h2>
        </div>
        <p>
          Pilih ruang yang pas untuk idemu.
          <br />
          Dari proyek pertama, sampai yang berikutnya.
        </p>
      </div>

      <div className="pricing-table scroll-reveal">
        <article className="price-row">
          <div>
            <h3 className="plan-name">Free Trial</h3>
            <p className="plan-description">Kenalan dengan cara kerja Numa.</p>
          </div>
          <div className="plan-price">
            <span className="currency">Rp</span>0<small>untuk mencoba</small>
          </div>
          <div className="plan-features">
            <span className="plan-feature">
              <Check />1 proyek aktif
            </span>
            <span className="plan-feature">
              <Check />1 putaran survey
            </span>
          </div>
          <Link to="/login" className="button button-line">
            Mulai gratis
            <ArrowUpRight />
          </Link>
        </article>

        <article className="price-row featured">
          <div>
            <h3 className="plan-name">
              Starter<span>UNTUK MEMULAI</span>
            </h3>
            <p className="plan-description">Beri ide berikutnya lebih banyak ruang.</p>
          </div>
          <div className="plan-price">
            <span className="currency">Rp</span>49.000<small>paket Starter</small>
          </div>
          <div className="plan-features">
            <span className="plan-feature">
              <Check />2 proyek aktif
            </span>
            <span className="plan-feature">
              <Check />3 putaran survey
            </span>
          </div>
          <Link to="/login" className="button button-dark">
            Pilih Starter
            <ArrowUpRight />
          </Link>
        </article>

        <article className="price-row">
          <div>
            <h3 className="plan-name">Pro</h3>
            <p className="plan-description">Untuk ide yang terus berkembang.</p>
          </div>
          <div className="plan-price">
            <span className="currency">Rp</span>129.000<small>paket Pro</small>
          </div>
          <div className="plan-features">
            <span className="plan-feature">
              <Check />5 proyek · 4 survey
            </span>
            <span className="plan-feature">
              <Check />Ekspor PRD + tasks
            </span>
          </div>
          <Link to="/login" className="button button-line">
            Pilih Pro
            <ArrowUpRight />
          </Link>
        </article>
      </div>

      <div className="pricing-footnote">
        <span>
          <Check />
          Semua paket mengikuti alur Brief hingga Agent.
        </span>
        <span>1 ide yang jelas lebih baik dari 100 prompt yang terputus.</span>
      </div>
    </section>
  );
}
