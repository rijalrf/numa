import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Terminal, MessageSquareText, FileText, Kanban, GitBranch, Layers, ShieldCheck, Cpu, Check } from 'lucide-react';

const TYPING_PHRASES = [
  'Ubah ide jadi aplikasi nyata',
  'Dari konsep jadi arsitektur siap coding',
  'Bangun produk software lebih cepat',
];

export function HeroSection() {
  const [copied, setCopied] = useState(false);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentPhrase = TYPING_PHRASES[phraseIndex];
    let timer: ReturnType<typeof setTimeout>;

    if (!isDeleting) {
      if (displayedText.length < currentPhrase.length) {
        timer = setTimeout(() => {
          setDisplayedText(currentPhrase.slice(0, displayedText.length + 1));
        }, 70);
      } else {
        // Jeda setelah selesai mengetik kalimat lengkap
        timer = setTimeout(() => {
          setIsDeleting(true);
        }, 2200);
      }
    } else {
      if (displayedText.length > 0) {
        timer = setTimeout(() => {
          setDisplayedText(currentPhrase.slice(0, displayedText.length - 1));
        }, 35);
      } else {
        // Selesai menghapus, ganti ke kalimat berikutnya
        setIsDeleting(false);
        setPhraseIndex((prev) => (prev + 1) % TYPING_PHRASES.length);
      }
    }

    return () => clearTimeout(timer);
  }, [displayedText, isDeleting, phraseIndex]);

  const handleCopyCli = () => {
    navigator.clipboard.writeText('npm i -g numa-cli');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="relative min-h-screen flex items-center pt-16 pb-20 overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">

        {/* Kolom kiri: teks */}
        <div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-[-0.03em] leading-[1.12] min-h-[120px] sm:min-h-[140px] flex items-center">
            <span className="text-foreground dark:text-white">
              {displayedText}
              <span className="cursor-blink"></span>
            </span>
          </h1>

          <div className="reveal-line mt-6 max-w-xl">
            <p className="text-base sm:text-lg leading-relaxed text-muted-foreground dark:text-numa-muted-light">
              Workspace perencanaan dan eksekusi software yang mengubah ide produk menjadi arsitektur terstruktur dan task atomic yang siap dieksekusi oleh AI agent di terminal lokal.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4" id="heroCta" style={{ opacity: 0 }}>
            <Link to="/login" className="group relative inline-flex items-center gap-2 rounded-md bg-numa-primary px-7 py-3.5 text-sm font-semibold text-white overflow-hidden transition-all hover:shadow-[0_0_30px_rgba(45,126,121,0.4)]">
              <span className="relative z-10">Coba Sekarang</span>
              <ArrowUpRight className="relative z-10 w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              <span className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></span>
            </Link>
            <button
              type="button"
              onClick={handleCopyCli}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card/80 px-6 py-3.5 text-sm text-foreground/80 shadow-sm transition-all hover:border-border hover:bg-accent/60 hover:text-foreground dark:border-white/[.08] dark:bg-transparent dark:text-numa-text dark:shadow-none dark:hover:border-white/20 dark:hover:text-white"
              title="Klik untuk menyalin perintah"
            >
              {copied ? <Check className="w-4 h-4 text-numa-primary dark:text-numa-accent" /> : <Terminal className="w-4 h-4 text-muted-foreground dark:text-inherit" />}
              <span className="font-mono text-xs">{copied ? 'Perintah disalin' : 'npm i -g numa-cli'}</span>
            </button>
          </div>
        </div>

        {/* Kolom kanan: product visualization */}
        <div className="relative flex items-center justify-center" id="heroViz" style={{ opacity: 0 }}>
          <div className="relative w-full max-w-lg aspect-square">
            {/* Orbital rings */}
            <div className="absolute inset-8 rounded-full border border-numa-primary/15 pulse-ring dark:border-numa-primary/10"></div>
            <div className="absolute inset-16 rounded-full border border-numa-primary/20 pulse-ring dark:border-numa-primary/15" style={{ animationDelay: '1s' }}></div>
            <div className="absolute inset-24 rounded-full border border-numa-primary/25 pulse-ring dark:border-numa-primary/20" style={{ animationDelay: '2s' }}></div>

            {/* Center logo */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
              <div className="flex h-16 w-16 items-center justify-center rounded-md bg-gradient-to-br from-numa-primary to-numa-accent shadow-[0_0_40px_rgba(45,126,121,0.4)]">
                <span className="text-2xl font-bold text-white">N</span>
              </div>
            </div>

            {/* SVG connection lines */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 400" fill="none" style={{ opacity: 0.35 }}>
              <line x1="200" y1="140" x2="200" y2="180" stroke="#2D7E79" strokeWidth="1" className="flow-line" />
              <line x1="260" y1="200" x2="220" y2="200" stroke="#2D7E79" strokeWidth="1" className="flow-line" style={{ animationDelay: '0.3s' }} />
              <line x1="200" y1="260" x2="200" y2="220" stroke="#2D7E79" strokeWidth="1" className="flow-line" style={{ animationDelay: '0.6s' }} />
              <line x1="140" y1="200" x2="180" y2="200" stroke="#2D7E79" strokeWidth="1" className="flow-line" style={{ animationDelay: '0.9s' }} />
            </svg>

            {/* Floating nodes */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 node-pop" style={{ animationDelay: '0.2s' }}>
              <div className="flex items-center gap-2 rounded-md bg-card border border-numa-primary/30 px-3.5 py-2.5 shadow-[0_4px_20px_rgba(45,126,121,0.12)] dark:bg-neutral-950 dark:border-numa-primary/25 dark:shadow-[0_0_20px_rgba(45,126,121,0.1)]">
                <MessageSquareText className="text-numa-primary dark:text-numa-accent" size={16} />
                <span className="text-[11px] font-medium text-foreground dark:text-numa-text">Brief</span>
              </div>
            </div>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 node-pop" style={{ animationDelay: '0.35s' }}>
              <div className="flex items-center gap-2 rounded-md bg-card border border-numa-primary/30 px-3.5 py-2.5 shadow-[0_4px_20px_rgba(45,126,121,0.12)] dark:bg-neutral-950 dark:border-numa-primary/25 dark:shadow-[0_0_20px_rgba(45,126,121,0.1)]">
                <FileText className="text-numa-primary dark:text-numa-accent" size={16} />
                <span className="text-[11px] font-medium text-foreground dark:text-numa-text">Blueprint</span>
              </div>
            </div>
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 node-pop" style={{ animationDelay: '0.5s' }}>
              <div className="flex items-center gap-2 rounded-md bg-card border border-numa-primary/30 px-3.5 py-2.5 shadow-[0_4px_20px_rgba(45,126,121,0.12)] dark:bg-neutral-950 dark:border-numa-primary/25 dark:shadow-[0_0_20px_rgba(45,126,121,0.1)]">
                <GitBranch className="text-numa-primary dark:text-numa-accent" size={16} />
                <span className="text-[11px] font-medium text-foreground dark:text-numa-text">Flow</span>
              </div>
            </div>
            <div className="absolute left-2 top-1/2 -translate-y-1/2 node-pop" style={{ animationDelay: '0.65s' }}>
              <div className="flex items-center gap-2 rounded-md bg-card border border-numa-primary/30 px-3.5 py-2.5 shadow-[0_4px_20px_rgba(45,126,121,0.12)] dark:bg-neutral-950 dark:border-numa-primary/25 dark:shadow-[0_0_20px_rgba(45,126,121,0.1)]">
                <Kanban className="text-numa-primary dark:text-numa-accent" size={16} />
                <span className="text-[11px] font-medium text-foreground dark:text-numa-text">Forge</span>
              </div>
            </div>
            <div className="absolute top-16 right-10 node-pop" style={{ animationDelay: '0.8s' }}>
              <div className="flex items-center gap-2 rounded-md bg-card border border-border px-3 py-2 shadow-sm dark:bg-neutral-950 dark:border-white/[.06] dark:shadow-[0_0_15px_rgba(45,126,121,0.05)]">
                <Layers className="text-muted-foreground dark:text-numa-muted" size={14} />
                <span className="text-[10px] text-muted-foreground dark:text-numa-muted">Stack</span>
              </div>
            </div>
            <div className="absolute bottom-16 left-10 node-pop" style={{ animationDelay: '0.95s' }}>
              <div className="flex items-center gap-2 rounded-md bg-card border border-border px-3 py-2 shadow-sm dark:bg-neutral-950 dark:border-white/[.06] dark:shadow-[0_0_15px_rgba(45,126,121,0.05)]">
                <Terminal className="text-muted-foreground dark:text-numa-muted" size={14} />
                <span className="text-[10px] text-muted-foreground dark:text-numa-muted">Agent CLI</span>
              </div>
            </div>
            <div className="absolute top-20 left-14 node-pop" style={{ animationDelay: '1.1s' }}>
              <div className="flex items-center gap-2 rounded-md bg-card border border-border px-3 py-2 shadow-sm dark:bg-neutral-950 dark:border-white/[.06] dark:shadow-[0_0_15px_rgba(45,126,121,0.05)]">
                <ShieldCheck className="text-muted-foreground dark:text-numa-muted" size={14} />
                <span className="text-[10px] text-muted-foreground dark:text-numa-muted">Checkpoint</span>
              </div>
            </div>
            <div className="absolute bottom-20 right-14 node-pop" style={{ animationDelay: '1.25s' }}>
              <div className="flex items-center gap-2 rounded-md bg-card border border-border px-3 py-2 shadow-sm dark:bg-neutral-950 dark:border-white/[.06] dark:shadow-[0_0_15px_rgba(45,126,121,0.05)]">
                <Cpu className="text-muted-foreground dark:text-numa-muted" size={14} />
                <span className="text-[10px] text-muted-foreground dark:text-numa-muted">Agent</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2" id="scrollHint" style={{ opacity: 0 }}>
        <div className="flex flex-col items-center gap-2 text-muted-foreground/60 dark:text-numa-dim">
          <span className="text-[10px] uppercase tracking-[0.2em] font-mono">gulir</span>
          <div className="w-px h-8 bg-gradient-to-b from-numa-primary to-transparent"></div>
        </div>
      </div>
    </section>
  );
}
