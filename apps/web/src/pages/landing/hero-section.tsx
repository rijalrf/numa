import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Terminal, MessageSquareText, FileText, Kanban, GitBranch, Layers, ShieldCheck, Cpu, Check } from 'lucide-react';

export function HeroSection() {
  const [copied, setCopied] = useState(false);

  const handleCopyCli = () => {
    navigator.clipboard.writeText('npm i -g numa');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="relative min-h-screen flex items-center pt-16 pb-20 overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">

        {/* Kolom kiri: teks */}
        <div>
          <div className="reveal-line mb-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-numa-primary/30 bg-numa-primary/10 px-3.5 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-numa-accent animate-pulse" />
              <span className="font-mono text-xs uppercase tracking-wider text-numa-accent font-medium">AI Software Factory</span>
            </div>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-[-0.03em] leading-[1.12]">
            <span className="reveal-line block">
              <span className="inline-block text-white">Ubah ide</span>
            </span>
            <span className="reveal-line block mt-1">
              <span className="inline-block text-numa-muted">
                jadi software<span className="cursor-blink"></span>
              </span>
            </span>
          </h1>

          <div className="reveal-line mt-6 max-w-xl">
            <p className="text-base sm:text-lg leading-relaxed text-numa-muted-light">
              Workspace perencanaan dan eksekusi software yang mengubah ide produk menjadi arsitektur terstruktur dan task atomic yang siap dieksekusi oleh AI agent di terminal lokal.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4" id="heroCta" style={{ opacity: 0 }}>
            <Link to="/login" className="group relative inline-flex items-center gap-2 rounded-full bg-numa-primary px-7 py-3.5 text-sm font-semibold text-white overflow-hidden transition-all hover:shadow-[0_0_30px_rgba(45,126,121,0.4)]">
              <span className="relative z-10">Coba Sekarang</span>
              <ArrowUpRight className="relative z-10 w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              <span className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></span>
            </Link>
            <button
              type="button"
              onClick={handleCopyCli}
              className="inline-flex items-center gap-2 rounded-full border border-white/[.08] px-6 py-3.5 text-sm text-numa-text transition-all hover:border-white/20 hover:text-white"
              title="Klik untuk menyalin perintah"
            >
              {copied ? <Check className="w-4 h-4 text-numa-accent" /> : <Terminal className="w-4 h-4" />}
              <span className="font-mono text-xs">{copied ? 'Perintah disalin' : 'npm i -g numa'}</span>
            </button>
          </div>
        </div>

        {/* Kolom kanan: product visualization */}
        <div className="relative flex items-center justify-center" id="heroViz" style={{ opacity: 0 }}>
          <div className="relative w-full max-w-lg aspect-square">
            {/* Orbital rings */}
            <div className="absolute inset-8 rounded-full border border-numa-primary/10 pulse-ring"></div>
            <div className="absolute inset-16 rounded-full border border-numa-primary/15 pulse-ring" style={{ animationDelay: '1s' }}></div>
            <div className="absolute inset-24 rounded-full border border-numa-primary/20 pulse-ring" style={{ animationDelay: '2s' }}></div>

            {/* Center logo */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-numa-primary to-numa-accent shadow-[0_0_40px_rgba(45,126,121,0.4)]">
                <span className="text-2xl font-bold text-white">N</span>
              </div>
            </div>

            {/* SVG connection lines */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 400" fill="none" style={{ opacity: 0.3 }}>
              <line x1="200" y1="140" x2="200" y2="180" stroke="#2D7E79" strokeWidth="1" className="flow-line" />
              <line x1="260" y1="200" x2="220" y2="200" stroke="#2D7E79" strokeWidth="1" className="flow-line" style={{ animationDelay: '0.3s' }} />
              <line x1="200" y1="260" x2="200" y2="220" stroke="#2D7E79" strokeWidth="1" className="flow-line" style={{ animationDelay: '0.6s' }} />
              <line x1="140" y1="200" x2="180" y2="200" stroke="#2D7E79" strokeWidth="1" className="flow-line" style={{ animationDelay: '0.9s' }} />
            </svg>

            {/* Floating nodes */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 node-pop" style={{ animationDelay: '0.2s' }}>
              <div className="flex items-center gap-2 rounded-xl bg-numa-card border border-numa-primary/25 px-3.5 py-2.5 shadow-[0_0_20px_rgba(45,126,121,0.1)]">
                <MessageSquareText className="text-numa-accent" size={16} />
                <span className="text-[11px] font-medium text-numa-text">Brief</span>
              </div>
            </div>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 node-pop" style={{ animationDelay: '0.35s' }}>
              <div className="flex items-center gap-2 rounded-xl bg-numa-card border border-numa-primary/25 px-3.5 py-2.5 shadow-[0_0_20px_rgba(45,126,121,0.1)]">
                <FileText className="text-numa-accent" size={16} />
                <span className="text-[11px] font-medium text-numa-text">Blueprint</span>
              </div>
            </div>
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 node-pop" style={{ animationDelay: '0.5s' }}>
              <div className="flex items-center gap-2 rounded-xl bg-numa-card border border-numa-primary/25 px-3.5 py-2.5 shadow-[0_0_20px_rgba(45,126,121,0.1)]">
                <Kanban className="text-numa-accent" size={16} />
                <span className="text-[11px] font-medium text-numa-text">Forge</span>
              </div>
            </div>
            <div className="absolute left-2 top-1/2 -translate-y-1/2 node-pop" style={{ animationDelay: '0.65s' }}>
              <div className="flex items-center gap-2 rounded-xl bg-numa-card border border-numa-primary/25 px-3.5 py-2.5 shadow-[0_0_20px_rgba(45,126,121,0.1)]">
                <GitBranch className="text-numa-accent" size={16} />
                <span className="text-[11px] font-medium text-numa-text">Flow</span>
              </div>
            </div>
            <div className="absolute top-16 right-10 node-pop" style={{ animationDelay: '0.8s' }}>
              <div className="flex items-center gap-2 rounded-xl bg-numa-card border border-white/[.06] px-3 py-2 shadow-[0_0_15px_rgba(45,126,121,0.05)]">
                <Layers className="text-numa-muted" size={14} />
                <span className="text-[10px] text-numa-muted">Stack</span>
              </div>
            </div>
            <div className="absolute bottom-16 left-10 node-pop" style={{ animationDelay: '0.95s' }}>
              <div className="flex items-center gap-2 rounded-xl bg-numa-card border border-white/[.06] px-3 py-2 shadow-[0_0_15px_rgba(45,126,121,0.05)]">
                <Terminal className="text-numa-muted" size={14} />
                <span className="text-[10px] text-numa-muted">Agent CLI</span>
              </div>
            </div>
            <div className="absolute top-20 left-14 node-pop" style={{ animationDelay: '1.1s' }}>
              <div className="flex items-center gap-2 rounded-xl bg-numa-card border border-white/[.06] px-3 py-2 shadow-[0_0_15px_rgba(45,126,121,0.05)]">
                <ShieldCheck className="text-numa-muted" size={14} />
                <span className="text-[10px] text-numa-muted">Gate</span>
              </div>
            </div>
            <div className="absolute bottom-20 right-14 node-pop" style={{ animationDelay: '1.25s' }}>
              <div className="flex items-center gap-2 rounded-xl bg-numa-card border border-white/[.06] px-3 py-2 shadow-[0_0_15px_rgba(45,126,121,0.05)]">
                <Cpu className="text-numa-muted" size={14} />
                <span className="text-[10px] text-numa-muted">Agent</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2" id="scrollHint" style={{ opacity: 0 }}>
        <div className="flex flex-col items-center gap-2 text-numa-dim">
          <span className="text-[10px] uppercase tracking-[0.2em] font-mono">gulir</span>
          <div className="w-px h-8 bg-gradient-to-b from-numa-primary to-transparent"></div>
        </div>
      </div>
    </section>
  );
}
