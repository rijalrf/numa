import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Menu,
  Play,
  Check,
  CheckCheck,
  Pause,
  ArrowDown,
  Atom,
  Boxes,
  Database,
  GitBranch,
  Box,
  ArrowRight,
  ScanLine,
  GitPullRequest,
  Terminal,
  RefreshCcw,
  LockKeyhole,
  Copy,
  RotateCcw,
  Plus,
} from 'lucide-react';
import { ArchitectureSvg } from './architecture-svg';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import './landing.css';

export function LandingPage() {
  // --- Motion / Hero Animation ---
  const [animationPaused, setAnimationPaused] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });

  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleMotionChange = (e: MediaQueryListEvent) => {
      setAnimationPaused(e.matches);
    };
    motionPreference.addEventListener('change', handleMotionChange);

    const handleVisibilityChange = () => {
      const art = document.getElementById('hero-art');
      if (art) {
        art.classList.toggle('art-paused', document.hidden || animationPaused);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      motionPreference.removeEventListener('change', handleMotionChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [animationPaused]);

  // --- Mobile Menu ---
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const menuToggleRef = useRef<HTMLButtonElement>(null);

  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileMenuOpen) {
        closeMobileMenu();
        menuToggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen, closeMobileMenu]);

  // --- Workflow Stages ---
  const [selectedStage, setSelectedStage] = useState(0);

  const stageData = [
    {
      name: 'NUMA BRIEF',
      status: 'Memahami kebutuhan produk',
      renderPreview: () => (
        <>
          <p className="preview-kicker">MULAI DARI SATU PERCAKAPAN</p>
          <div className="idea-bubble">Aku ingin bikin platform booking ruang kerja untuk tim kecil.</div>
          <div className="ai-reply">
            <span className="ai-symbol">
              <GitBranch />
            </span>
            <div>
              <p>
                Kita mulai dari penggunanya.
                <br />
                Siapa yang akan memesan ruang kerja ini?
              </p>
              <div className="reply-options">
                <span className="reply-chip">Tim startup</span>
                <span className="reply-chip">Freelancer</span>
                <span className="reply-chip">Komunitas</span>
              </div>
            </div>
          </div>
        </>
      ),
    },
    {
      name: 'NUMA BLUEPRINT',
      status: 'Fondasi produk terdokumentasi',
      renderPreview: () => (
        <>
          <p className="preview-kicker">IDE MENJADI FONDASI</p>
          <div className="blueprint-file">
            <div className="file-meta">
              <span>PRD.md</span>
              <span>VERSI 1.0</span>
            </div>
            <h4>Ruang Kerja / Blueprint</h4>
            <p>Platform booking ruang kerja untuk tim kecil. Fokus versi pertama: ketersediaan ruang dan reservasi.</p>
            <div className="code-lines">
              <span className="key">frontend</span> &nbsp; Next.js
              <br />
              <span className="key">database</span> &nbsp; PostgreSQL
              <br />
              <span className="key">cakupan</span> &nbsp;&nbsp; Cari · Pilih · Booking
            </div>
          </div>
        </>
      ),
    },
    {
      name: 'NUMA FLOW',
      status: 'Dependency terpetakan',
      renderPreview: () => (
        <>
          <p className="preview-kicker">SETIAP FITUR PUNYA TEMPAT</p>
          <div className="flow-tree">
            <div className="flow-node main">Ruang Kerja</div>
            <div className="flow-branches">
              <div className="flow-node">Autentikasi</div>
              <div className="flow-node">Katalog</div>
              <div className="flow-node">Booking</div>
            </div>
            <div className="flow-branches">
              <div className="flow-node">API reservasi</div>
              <div className="flow-node">Konfirmasi</div>
            </div>
            <p className="flow-dependencies">3 fitur utama · dependency terarah</p>
          </div>
        </>
      ),
    },
    {
      name: 'NUMA FORGE',
      status: 'Task memiliki konteks dan batas kerja',
      renderPreview: () => (
        <>
          <p className="preview-kicker">DARI FITUR KE PEKERJAAN KONKRET</p>
          <div className="task-board">
            <div>
              <p className="task-column-title">SIAP DIKERJAKAN / 02</p>
              <div className="task-card">
                <small>NMF-012</small>
                <p>Buat endpoint booking</p>
                <span className="task-badge">Backend</span>
              </div>
              <div className="task-card">
                <small>NMF-013</small>
                <p>Form reservasi ruang</p>
                <span className="task-badge">Frontend</span>
              </div>
            </div>
            <div>
              <p className="task-column-title">SELESAI / 01</p>
              <div className="task-card">
                <small>NMF-011</small>
                <p>Skema data ruang</p>
                <span className="task-badge">Tervalidasi</span>
              </div>
            </div>
          </div>
        </>
      ),
    },
    {
      name: 'NUMA AGENT',
      status: 'Task siap diambil agent lokal',
      renderPreview: () => (
        <>
          <p className="preview-kicker">LANJUTKAN DI TERMINALMU</p>
          <div className="mini-terminal">
            <strong>$ numa next</strong>
            <br />
            → NMF-012 · Endpoint booking
            <br />
            <br />
            <strong>$ numa context</strong>
            <br />
            1 file scope · 3 acceptance criteria
            <br />
            Dependency tervalidasi
            <br />
            <br />
            <strong>Siap dieksekusi di repo lokal.</strong>
          </div>
        </>
      ),
    },
  ];

  const selectStage = (index: number, focus = false) => {
    const next = (index + stageData.length) % stageData.length;
    setSelectedStage(next);
    if (focus) {
      document.getElementById(`step-${next}`)?.focus();
    }
  };

  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'Home') selectStage(0, true);
    else if (e.key === 'End') selectStage(4, true);
    else if (['ArrowRight', 'ArrowDown'].includes(e.key)) selectStage(index + 1, true);
    else if (['ArrowLeft', 'ArrowUp'].includes(e.key)) selectStage(index - 1, true);
  };

  // --- Terminal Simulation ---
  const terminalRef = useRef<HTMLDivElement>(null);

  const replayTerminal = () => {
    if (terminalRef.current) {
      terminalRef.current.classList.remove('terminal-replay');
      void terminalRef.current.offsetWidth;
      terminalRef.current.classList.add('terminal-replay');
    }
  };

  // --- Toast ---
  const [toastMessage, setToastMessage] = useState('');
  const [isToastShow, setIsToastShow] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = (msg: string) => {
    setToastMessage(msg);
    setIsToastShow(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setIsToastShow(false);
    }, 3500);
  };

  const copyNumaNext = async () => {
    try {
      await navigator.clipboard.writeText('numa next');
      notify('Perintah numa next disalin.');
    } catch {
      notify('Salin perintah ini: numa next');
    }
  };

  // ponytail: alur popup draf ide diganti navigasi langsung ke /login.

  return (
    <div className="landing-root">
      <a href="#konten" className="skip-link">
        Lewati ke konten
      </a>

      {/* HEADER */}
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
            <ThemeToggle />
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
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
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
          <div className="flex items-center justify-between py-2 border-t border-[var(--line)] mt-2">
            <span className="text-xs text-[var(--muted)]">Tema</span>
            <ThemeToggle />
          </div>
        </nav>
      </header>

      {/* MAIN */}
      <main id="konten">
        {/* HERO */}
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
                  <a href="#alur" className="text-button" id="demo-link" onClick={() => selectStage(0)}>
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
                    onClick={() => setAnimationPaused(!animationPaused)}
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

            <div className="pipeline-ribbon" aria-label="Lima tahap alur Numa">
              <div className="ribbon-intro">
                Satu alur utuh.
                <br />
                Dari titik nol, sampai jalan.
              </div>
              <a href="#alur" className="ribbon-step" data-select-step="0" onClick={() => selectStage(0)}>
                <span className="ribbon-number">01</span>
                <span>
                  <strong>Brief</strong>
                  <small>Temukan intinya</small>
                </span>
              </a>
              <a href="#alur" className="ribbon-step" data-select-step="1" onClick={() => selectStage(1)}>
                <span className="ribbon-number">02</span>
                <span>
                  <strong>Blueprint</strong>
                  <small>Susun fondasinya</small>
                </span>
              </a>
              <a href="#alur" className="ribbon-step" data-select-step="2" onClick={() => selectStage(2)}>
                <span className="ribbon-number">03</span>
                <span>
                  <strong>Flow</strong>
                  <small>Petakan jalannya</small>
                </span>
              </a>
              <a href="#alur" className="ribbon-step" data-select-step="3" onClick={() => selectStage(3)}>
                <span className="ribbon-number">04</span>
                <span>
                  <strong>Forge</strong>
                  <small>Perjelas tugasnya</small>
                </span>
              </a>
              <a href="#alur" className="ribbon-step" data-select-step="4" onClick={() => selectStage(4)}>
                <span className="ribbon-number">05</span>
                <span>
                  <strong>Agent</strong>
                  <small>Mulai eksekusinya</small>
                </span>
              </a>
            </div>

            <div className="stack-line">
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

        {/* WORKFLOW */}
        <section id="alur" className="workflow-section page-shell">
          <div className="section-heading">
            <div className="heading-with-index">
              <span className="section-index">01</span>
              <h2 className="section-title">
                Bukan sekadar prompt.
                <br />
                Sebuah proses berpikir.
              </h2>
            </div>
            <p className="body-copy">
              Ide yang baik butuh konteks yang utuh. Numa menghubungkan setiap keputusan, dari percakapan pertama sampai
              task terakhir.
            </p>
          </div>

          <div className="workflow-grid">
            <div>
              <div className="step-list" role="tablist" aria-label="Tahapan kerja Numa">
                {[
                  {
                    num: '01',
                    title: 'Numa Brief',
                    desc: 'Mulai dari percakapan. Pertajam masalah, kenali pengguna, dan temukan kebutuhan yang benar-benar penting.',
                  },
                  {
                    num: '02',
                    title: 'Blueprint',
                    desc: 'Pilih tech stack yang selaras. Susun PRD dengan kebutuhan, batasan, dan kontrak arsitektur yang jelas.',
                  },
                  {
                    num: '03',
                    title: 'Flow',
                    desc: 'Pecah produk jadi fitur. Lihat dependency dan urutan pengerjaan dalam roadmap yang saling terhubung.',
                  },
                  {
                    num: '04',
                    title: 'Forge',
                    desc: 'Setiap task punya file scope, acceptance criteria, dan perintah validasi. Agent tahu persis batas pekerjaannya.',
                  },
                  {
                    num: '05',
                    title: 'Agent',
                    desc: 'Jalankan task dengan coding agent di komputermu. Tinjau hasilnya dan setujui checkpoint sebelum lanjut.',
                  },
                ].map((step, idx) => {
                  const isActive = selectedStage === idx;
                  return (
                    <button
                      key={idx}
                      type="button"
                      className={`step-tab ${isActive ? 'active' : ''}`}
                      id={`step-${idx}`}
                      role="tab"
                      aria-selected={isActive}
                      aria-controls="workflow-panel"
                      tabIndex={isActive ? 0 : -1}
                      data-step={idx}
                      onClick={() => selectStage(idx)}
                      onKeyDown={(e) => handleTabKeyDown(e, idx)}
                    >
                      <span className="step-header">
                        <span className="step-num">{step.num}</span>
                        <strong>{step.title}</strong>
                        <ArrowUpRight />
                      </span>
                      <span className="step-description">{step.desc}</span>
                    </button>
                  );
                })}
              </div>
              <p className="step-meta">
                <GitBranch />
                Konteks tetap terhubung di setiap tahap.
              </p>
            </div>

            <div>
              <div
                className="workflow-preview"
                id="workflow-panel"
                role="tabpanel"
                tabIndex={0}
                aria-labelledby={`step-${selectedStage}`}
              >
                <div className="preview-toolbar">
                  <span className="preview-project">
                    <Box />
                    Proyek / Ruang Kerja
                  </span>
                  <span id="preview-stage" className="preview-tag">
                    {stageData[selectedStage].name}
                  </span>
                </div>
                <div className="preview-content" id="preview-content" key={selectedStage}>
                  {stageData[selectedStage].renderPreview()}
                </div>
                <div className="preview-footer">
                  <span>
                    <span className="status-dot"></span>
                    <span id="preview-status">{stageData[selectedStage].status}</span>
                  </span>
                  <span>ILUSTRASI WORKSPACE</span>
                </div>
              </div>

              <div className="workflow-note">
                <span>Klik tahap untuk menjelajahi alurnya.</span>
                <button type="button" id="next-step" onClick={() => selectStage(selectedStage + 1)}>
                  Tahap berikutnya
                  <ArrowRight />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* KENDALI */}
        <section id="kendali" className="control-section">
          <div className="control-grid page-shell">
            <div className="control-heading">
              <p className="eyebrow">
                <span className="tiny-line"></span>02 / KONTEKS JELAS. KENDALI PENUH.
              </p>
              <h2 className="section-title">
                Agent yang bekerja.
                <br />
                Kamu yang memegang arah.
              </h2>
              <p className="body-copy">
                Lebih sedikit menebak, lebih banyak membangun. Beri agent konteks yang tepat, dengan batas yang bisa
                kamu percaya.
              </p>
            </div>
            <div className="control-features">
              <article className="control-feature">
                <ScanLine />
                <h3>Batas kerja yang tegas</h3>
                <p>File yang boleh diubah, larangan, dan kriteria selesai ada di setiap task.</p>
              </article>
              <article className="control-feature">
                <GitPullRequest />
                <h3>Checkpoint, bukan tebak-tebakan</h3>
                <p>Review hasil di setiap pergantian layer. Lanjut setelah kamu setuju.</p>
              </article>
              <article className="control-feature">
                <Terminal />
                <h3>Tetap di lingkunganmu</h3>
                <p>Eksekusi di repo lokal dengan coding agent dan terminal pilihanmu.</p>
              </article>
              <article className="control-feature">
                <RefreshCcw />
                <h3>Perubahan tetap terencana</h3>
                <p>Ide berkembang? Change Cycle menyusun task baru setelah siklus selesai.</p>
              </article>
            </div>
          </div>
        </section>

        {/* AGENT TERMINAL */}
        <section id="agent" className="agent-section page-shell">
          <div className="agent-copy">
            <p className="eyebrow">
              <span className="status-dot"></span>DARI WORKSPACE KE TERMINALMU
            </p>
            <h2>
              Rencana yang bisa
              <br />
              langsung dikerjakan.
            </h2>
            <p>
              Hubungkan Numa ke coding agent lokal. Ambil task, baca konteks, validasi hasil. Semua dalam satu alur
              yang bisa ditelusuri.
            </p>
            <button
              type="button"
              className="button button-lime button-small"
              id="replay-terminal"
              onClick={replayTerminal}
            >
              Jalankan simulasi
              <Terminal />
            </button>
            <p className="agent-footnote">
              <LockKeyhole />
              Kode dikerjakan di repo lokalmu.
            </p>
          </div>

          <div className="terminal-window">
            <div className="terminal-title">
              <div className="terminal-dots" aria-hidden="true">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span>numa-agent — simulasi</span>
              <div className="terminal-actions">
                <button
                  type="button"
                  id="copy-command"
                  aria-label="Salin perintah numa next"
                  onClick={copyNumaNext}
                >
                  <Copy />
                </button>
                <button
                  type="button"
                  id="reset-terminal"
                  aria-label="Ulangi simulasi terminal"
                  onClick={replayTerminal}
                >
                  <RotateCcw />
                </button>
              </div>
            </div>
            <div className="terminal-code" id="terminal-code" ref={terminalRef}>
              <p className="terminal-line">
                <span className="prompt">$</span>numa next
              </p>
              <p className="terminal-line dim" style={{ '--delay': '.5s' } as React.CSSProperties}>
                Mengambil task berikutnya…
              </p>
              <p className="terminal-line gap" style={{ '--delay': '1.1s' } as React.CSSProperties}>
                <span className="pass">→</span>NMF-012 · Buat endpoint booking
              </p>
              <p className="terminal-line dim" style={{ '--delay': '1.6s' } as React.CSSProperties}>
                &nbsp;&nbsp;scope &nbsp; <span className="task-file">src/api/bookings.ts</span>
              </p>
              <p className="terminal-line dim" style={{ '--delay': '2.1s' } as React.CSSProperties}>
                &nbsp;&nbsp;layer &nbsp; Backend / API
              </p>
              <p className="terminal-line gap" style={{ '--delay': '2.6s' } as React.CSSProperties}>
                <span className="pass">✓</span>Dependency sudah terpenuhi
              </p>
              <p className="terminal-line" style={{ '--delay': '3.1s' } as React.CSSProperties}>
                <span className="pass">✓</span>3 acceptance criteria tersedia
              </p>
              <p className="terminal-line" style={{ '--delay': '3.6s' } as React.CSSProperties}>
                <span className="prompt">$</span>
                <span className="terminal-cursor"></span>
              </p>
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="paket" className="pricing-section page-shell">
          <div className="pricing-heading">
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

          <div className="pricing-table">
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

        {/* FAQ */}
        <section id="faq" className="faq-section page-shell">
          <div className="faq-heading">
            <p className="eyebrow">
              <span className="tiny-line"></span>SEBELUM MULAI
            </p>
            <h2>
              Mungkin ini
              <br />
              yang kamu pikirkan.
            </h2>
          </div>

          <div className="faq-list">
            <details>
              <summary>
                Apakah Numa langsung menulis kode?
                <Plus />
              </summary>
              <p>
                Numa menyiapkan konteks, PRD, roadmap, dan task. Coding agent di komputermu yang mengeksekusi task
                melalui Numa CLI. Kamu tetap meninjau checkpoint dan hasil implementasinya.
              </p>
            </details>
            <details>
              <summary>
                Bisa pakai coding agent yang sudah kupakai?
                <Plus />
              </summary>
              <p>
                Numa menyediakan Master Prompt dan CLI untuk coding agent yang bisa menjalankan perintah terminal,
                seperti Claude Code. Ikuti panduan koneksi pada proyek untuk memberikan agent akses ke konteks dan task.
              </p>
            </details>
            <details>
              <summary>
                Bagaimana kalau kebutuhanku berubah di tengah jalan?
                <Plus />
              </summary>
              <p>
                Setelah semua task pada siklus aktif selesai, kamu bisa memulai Change Cycle. Numa meninjau perubahan PRD
                dan dampaknya, lalu menyiapkan siklus task baru.
              </p>
            </details>
            <details>
              <summary>
                Apakah cocok untuk proyek pertamaku?
                <Plus />
              </summary>
              <p>
                Free Trial memberi ruang untuk 1 proyek dan 1 putaran survey. Numa ditujukan untuk developer dan
                technical founder yang memahami dasar pengembangan software serta memakai coding agent di terminal.
              </p>
            </details>
          </div>
        </section>

        {/* CLOSING */}
        <section className="closing">
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
      </main>

      {/* FOOTER */}
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

      {/* TOAST */}
      <div id="toast" className={`toast ${isToastShow ? 'show' : ''}`} role="status" aria-live="polite">
        {toastMessage}
      </div>
    </div>
  );
}
