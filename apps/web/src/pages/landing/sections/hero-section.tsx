import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Play,
  Check,
  CheckCheck,
  Pause,
  ArrowDown,
  Atom,
  Boxes,
  Database,
} from 'lucide-react';
import { ArchitectureSvg } from '../architecture-svg';

type Props = {
  animationPaused: boolean;
  onToggleMotion: () => void;
  onSelectStage: (index: number) => void;
};

export function HeroSection({ animationPaused, onToggleMotion, onSelectStage }: Props) {
  return (
    <section id="beranda" className="hero">
      <div className="page-shell">
        <div className="hero-topline">
          <p className="eyebrow">
            <span className="tiny-line"></span>Workspace untuk ide yang serius.
          </p>
          <span className="edition">DIRENCANAKAN DENGAN TELITI. DIBANGUN DENGAN ARAH.</span>
        </div>

        <div className="hero-main">
          <div className="hero-copy">
            <h1>
              Ide besar.
              <br />
              <span className="light-word">Mulai</span> <span className="hero-last">terarah.</span>
            </h1>
            <p className="hero-intro">
              Dari pikiran yang belum rapi, ke pekerjaan yang siap dieksekusi. Numa menyusun jalannya, kamu
              menentukan tujuannya.
            </p>
            <div className="hero-buttons">
              <Link to="/login" className="button button-dark">
                Mulai dari idemu
                <ArrowUpRight />
              </Link>
              <a href="#alur" className="text-button" id="demo-link" onClick={() => onSelectStage(0)}>
                <span className="play-circle">
                  <Play />
                </span>
                Lihat cara kerjanya
              </a>
            </div>
            <p className="hero-micro">
              <Check />
              Mulai gratis<span aria-hidden="true">·</span>1 proyek untuk ide pertamamu
            </p>
          </div>

          <div className={`hero-art ${animationPaused ? 'art-paused' : ''}`} id="hero-art">
            <ArchitectureSvg />
            <span className="art-label one">01 / IDE MENTAH</span>
            <span className="art-label two">02 / BLUEPRINT</span>
            <span className="art-label three">03 / SIAP DIEKSEKUSI</span>
            <span className="floating-note">
              <CheckCheck />
              Konteks tersusun.
            </span>
            <span className="art-caption mono">SETIAP LAPISAN PUNYA TUJUAN.</span>
            <div className="art-controls">
              <button
                type="button"
                id="motion-toggle"
                className="icon-button"
                aria-label={animationPaused ? 'Lanjutkan animasi hero' : 'Jeda animasi hero'}
                aria-pressed={animationPaused}
                onClick={onToggleMotion}
              >
                {animationPaused ? <Play /> : <Pause />}
              </button>
            </div>
          </div>
        </div>

        <div className="hero-bottom">
          <span>
            <span className="scroll-mark">
              <ArrowDown />
            </span>
            Ruang untuk berpikir. Struktur untuk membangun.
          </span>
          <span className="hero-caption">IDE → KONTEKS → KODE</span>
        </div>

        <div className="pipeline-ribbon scroll-reveal" aria-label="Lima tahap alur Numa">
          <div className="ribbon-intro">
            Satu alur utuh.
            <br />
            Dari titik nol, sampai jalan.
          </div>
          <a href="#alur" className="ribbon-step" data-select-step="0" onClick={() => onSelectStage(0)}>
            <span className="ribbon-number">01</span>
            <span>
              <strong>Brief</strong>
              <small>Temukan intinya</small>
            </span>
          </a>
          <a href="#alur" className="ribbon-step" data-select-step="1" onClick={() => onSelectStage(1)}>
            <span className="ribbon-number">02</span>
            <span>
              <strong>Blueprint</strong>
              <small>Susun fondasinya</small>
            </span>
          </a>
          <a href="#alur" className="ribbon-step" data-select-step="2" onClick={() => onSelectStage(2)}>
            <span className="ribbon-number">03</span>
            <span>
              <strong>Flow</strong>
              <small>Petakan jalannya</small>
            </span>
          </a>
          <a href="#alur" className="ribbon-step" data-select-step="3" onClick={() => onSelectStage(3)}>
            <span className="ribbon-number">04</span>
            <span>
              <strong>Forge</strong>
              <small>Perjelas tugasnya</small>
            </span>
          </a>
          <a href="#alur" className="ribbon-step" data-select-step="4" onClick={() => onSelectStage(4)}>
            <span className="ribbon-number">05</span>
            <span>
              <strong>Agent</strong>
              <small>Mulai eksekusinya</small>
            </span>
          </a>
        </div>

        <div className="stack-line scroll-reveal">
          <p>Fondasi yang sudah kamu kenal.</p>
          <div className="stack-logos">
            <span className="stack-logo">
              <Atom />
              React
            </span>
            <span className="stack-logo">
              <span className="next-icon" aria-hidden="true">
                N
              </span>
              Next.js
            </span>
            <span className="stack-logo">
              <span className="vue-icon" aria-hidden="true">
                v
              </span>
              Vue
            </span>
            <span className="stack-logo">
              <Boxes />
              Laravel
            </span>
            <span className="stack-logo">
              <Database />
              PostgreSQL
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
