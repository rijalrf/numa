import { Bot } from 'lucide-react';

const LINES = [
  { delay: '0', content: <span className="text-numa-muted text-[11px]">-- agent mengambil task berikutnya</span> },
  { delay: '0.4', content: <><span className="text-numa-dim">$</span> <span className="text-white">numa next</span></> },
  { delay: '1.0', content: <><span className="text-numa-primary">  Task #14</span> <span className="text-numa-muted">Implementasi halaman checkout</span></> },
  { delay: '1.2', content: <span className="text-numa-dim">  layer: frontend | create: 3 files | modify: 1 file</span> },
  { delay: '2.0', content: null },
  { delay: '2.1', content: <span className="text-numa-muted text-[11px]">-- agent membaca bounded context</span> },
  { delay: '2.5', content: <><span className="text-numa-dim">$</span> <span className="text-white">numa context</span></> },
  { delay: '3.0', content: <><span className="text-numa-muted">  create:</span> <span className="text-numa-text">src/pages/Checkout.tsx, src/hooks/useCart.ts</span></> },
  { delay: '3.2', content: <><span className="text-numa-muted">  modify:</span> <span className="text-numa-text">src/App.tsx</span></> },
  { delay: '3.4', content: <><span style={{ color: '#953d41' }}>  forbid:</span> <span className="text-numa-muted">prisma/schema.prisma, src/lib/auth.ts</span></> },
  { delay: '4.2', content: null },
  { delay: '4.3', content: <span className="text-numa-muted text-[11px]">-- agent menulis kode sesuai bounded context...</span> },
  { delay: '5.0', content: <><span className="text-numa-dim">  [writing]</span> <span className="text-numa-text">src/pages/Checkout.tsx</span> <span className="text-numa-primary">OK</span></> },
  { delay: '5.3', content: <><span className="text-numa-dim">  [writing]</span> <span className="text-numa-text">src/hooks/useCart.ts</span> <span className="text-numa-primary">OK</span></> },
  { delay: '5.6', content: <><span className="text-numa-dim">  [modify]</span> <span className="text-numa-text">src/App.tsx</span> <span className="text-numa-primary">OK</span></> },
  { delay: '6.4', content: null },
  { delay: '6.5', content: <span className="text-numa-muted text-[11px]">-- agent menyelesaikan task</span> },
  { delay: '6.9', content: <><span className="text-numa-dim">$</span> <span className="text-white">numa done</span></> },
  { delay: '7.5', content: <span className="text-numa-accent">  Validations passed. Task #14 complete.</span> },
  { delay: '8.0', content: <span className="text-numa-muted text-[11px]">-- agent lanjut ke task berikutnya...</span> },
];

const AGENTS = ['Claude Code', 'Cursor', 'Cline', 'Windsurf', 'Aider'];

export function TerminalSection() {
  return (
    <section id="workflow" className="py-28">
      <div className="mx-auto max-w-4xl px-6">
        <div className="mb-12 text-center">
          <p className="font-mono text-xs tracking-[0.3em] uppercase text-numa-primary mb-4">Numa Agent di Terminal Lokal</p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-foreground dark:text-white">Tinjau arsitektur. Agent mengeksekusi.</h2>
          <p className="mt-4 text-muted-foreground dark:text-numa-muted-light text-base max-w-lg mx-auto">Master prompt terstruktur memandu AI coding agent menjalankan CLI numa secara otonom: mengambil task terisolasi, menghormati batas bounded context, dan memvalidasi hasil.</p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-[#080C0C] overflow-hidden shadow-2xl shadow-black/10 dark:border-white/[.08] dark:shadow-black/40">
          {/* Window chrome */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[.06] bg-[#0A0E0E]">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/80"></div>
              <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/80"></div>
              <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]/80"></div>
              <span className="ml-4 font-mono text-[11px] text-numa-dim">~/projects/my-app</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-numa-primary/10 border border-numa-primary/20 px-3 py-1">
              <Bot className="text-numa-accent" size={12} />
              <span className="font-mono text-[10px] text-numa-accent">AI Agent</span>
            </div>
          </div>

          {/* Context banner */}
          <div className="px-6 py-2.5 border-b border-white/[.04] bg-numa-primary/5">
            <p className="font-mono text-[11px] text-numa-muted">
              <span className="text-numa-primary">agent:</span> Menjalankan numa CLI otomatis berdasarkan master prompt...
            </p>
          </div>

          {/* Terminal lines */}
          <div className="p-6 font-mono text-[13px] leading-[2] overflow-x-auto" id="terminalBody">
            {LINES.map((line, i) => (
              <div key={i} className="terminal-line" data-delay={line.delay}>
                {line.content || ' '}
              </div>
            ))}
          </div>
        </div>

        {/* Supported agents */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-muted-foreground/60 dark:text-numa-dim">
          <p className="text-xs font-mono uppercase tracking-wider">Kompatibel dengan:</p>
          <div className="flex items-center gap-5">
            {AGENTS.map((name, i) => (
              <span key={i} className="text-xs text-muted-foreground dark:text-numa-muted">{name}</span>
            )).reduce<React.ReactNode[]>((acc, el, i) => {
              if (i > 0) acc.push(<span key={`sep-${i}`} className="text-numa-primary/30 dark:text-numa-primary/20">|</span>);
              acc.push(el);
              return acc;
            }, [])}
          </div>
        </div>
      </div>
    </section>
  );
}
