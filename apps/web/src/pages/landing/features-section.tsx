import { MessageSquareText, FileText, GitBranch, Kanban, Check, Sparkles, Folder, FileCode, CheckCircle2, Circle } from 'lucide-react';

const CARDS = [
  {
    span: 'md:col-span-7',
    step: '01',
    label: 'Numa Brief',
    title: 'Discovery terarah, bukan prompt mentah',
    desc: 'Wawancara kebutuhan interaktif untuk memetakan arsitektur, edge case, dan skala target sebelum baris kode pertama ditulis.',
    mockup: (
      <div className="space-y-2.5 w-full">
        <div className="flex gap-2.5 items-end">
          <div className="h-6 w-6 rounded-md bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground shrink-0 dark:bg-white/[.08] dark:text-numa-text">
            U
          </div>
          <div className="rounded-md rounded-bl-xs bg-muted/70 border border-border px-3.5 py-2 text-xs text-foreground/90 dark:bg-white/[.04] dark:border-white/[.06] dark:text-numa-text">
            Saya mau bikin app inventory toko retail dengan kasir barcode scanner.
          </div>
        </div>
        <div className="flex gap-2.5 items-end justify-end">
          <div className="rounded-md rounded-br-xs bg-numa-primary/15 border border-numa-primary/25 px-3.5 py-2 text-xs text-numa-primary dark:text-numa-accent max-w-sm">
            Apakah perlu sinkronisasi multi-outlet terpusat atau stand-alone per toko?
          </div>
          <div className="h-6 w-6 rounded-md bg-numa-primary/20 flex items-center justify-center text-[10px] font-semibold text-numa-primary shrink-0 dark:text-numa-accent">
            AI
          </div>
        </div>
        <div className="flex gap-2.5 items-end">
          <div className="h-6 w-6 rounded-md bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground shrink-0 dark:bg-white/[.08] dark:text-numa-text">
            U
          </div>
          <div className="rounded-md rounded-bl-xs bg-muted/70 border border-border px-3.5 py-2 text-xs text-foreground/90 dark:bg-white/[.04] dark:border-white/[.06] dark:text-numa-text">
            Multi-outlet dengan sinkronisasi cloud real-time saat transaksi offline kembali online.
          </div>
        </div>
        <div className="flex gap-2.5 items-end justify-end">
          <div className="rounded-md rounded-br-xs bg-numa-primary/15 border border-numa-primary/25 px-3.5 py-2 text-xs text-numa-primary dark:text-numa-accent max-w-sm">
            Tercatat. Bagaimana otorisasi diskon: kasir langsung atau perlu approval supervisor?
          </div>
          <div className="h-6 w-6 rounded-md bg-numa-primary/20 flex items-center justify-center text-[10px] font-semibold text-numa-primary shrink-0 dark:text-numa-accent">
            AI
          </div>
        </div>
        <div className="flex gap-2.5 items-end">
          <div className="h-6 w-6 rounded-md bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground shrink-0 dark:bg-white/[.08] dark:text-numa-text">
            U
          </div>
          <div className="rounded-md rounded-bl-xs bg-muted/70 border border-border px-3.5 py-2 text-xs text-foreground/90 dark:bg-white/[.04] dark:border-white/[.06] dark:text-numa-text">
            Perlu PIN supervisor untuk diskon di atas 10%.
          </div>
        </div>
      </div>
    ),
    glowPos: 'top-0 right-0',
  },
  {
    span: 'md:col-span-5',
    step: '02',
    label: 'Numa Blueprint',
    title: 'Dokumen kebutuhan produk presisi',
    desc: 'Functional requirements, product rules, dan batasan teknis (PRD) dihasilkan otomatis dari jawaban wawancara kebutuhan, bukan template kosong.',
    mockup: (
      <div className="rounded-md border border-border/80 bg-background/60 p-4 font-mono text-[11px] leading-relaxed dark:border-white/[.08] dark:bg-black/40">
        <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-border/60 dark:border-white/[.06] text-muted-foreground dark:text-numa-muted">
          <span className="font-semibold text-foreground dark:text-white">PRD — POS & Inventory App</span>
        </div>
        <div className="space-y-2 text-muted-foreground dark:text-numa-muted-light">
          <div className="flex items-center gap-2 text-foreground/90 dark:text-numa-text">
            <Check size={13} className="text-numa-primary dark:text-numa-accent shrink-0" />
            <span>REQ-01: Multi-outlet inventory synchronization</span>
          </div>
          <div className="flex items-center gap-2 text-foreground/90 dark:text-numa-text">
            <Check size={13} className="text-numa-primary dark:text-numa-accent shrink-0" />
            <span>REQ-02: Barcode lookup latency &lt; 100ms</span>
          </div>
          <div className="flex items-center gap-2 text-foreground/90 dark:text-numa-text">
            <Check size={13} className="text-numa-primary dark:text-numa-accent shrink-0" />
            <span>REQ-03: Offline-first SQLite local caching</span>
          </div>
          <div className="flex items-center gap-2 text-foreground/90 dark:text-numa-text">
            <Check size={13} className="text-numa-primary dark:text-numa-accent shrink-0" />
            <span>REQ-04: Role-based discount authorization (PIN)</span>
          </div>
          <div className="flex items-center gap-2 text-foreground/90 dark:text-numa-text">
            <Check size={13} className="text-numa-primary dark:text-numa-accent shrink-0" />
            <span>REQ-05: Real-time stock reservation lock</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground/60 dark:text-numa-dim">
            <Check size={13} className="text-numa-primary dark:text-numa-accent shrink-0" />
            <span>CONSTRAINT: PostgreSQL DB &amp; Tailwind CSS</span>
          </div>
        </div>
      </div>
    ),
    glowPos: 'bottom-0 left-0',
  },
  {
    span: 'md:col-span-5',
    step: '03',
    label: 'Numa Flow',
    title: 'Dekomposisi hierarki dan relasi DAG',
    desc: 'Hierarki visual dari aplikasi ke fitur hingga sub-fitur dengan dependensi terarah dan validasi bebas siklus sirkular.',
    mockup: (
      <div className="rounded-md border border-border/80 bg-background/60 p-4 font-mono text-[11px] leading-relaxed dark:border-white/[.08] dark:bg-black/40">
        <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-border/60 dark:border-white/[.06] text-muted-foreground dark:text-numa-muted">
          <span className="font-semibold text-foreground dark:text-white">Architecture DAG</span>
          <span className="text-[10px] text-muted-foreground">3 Layers • 0 Cycle</span>
        </div>
        <div className="space-y-1.5 text-muted-foreground dark:text-numa-muted">
          <div className="flex items-center gap-1.5 text-numa-primary dark:text-numa-accent font-semibold">
            <Folder size={12} />
            <span>app/root</span>
          </div>
          <div className="pl-3.5 space-y-1">
            <div className="flex items-center gap-1.5 text-foreground/90 dark:text-numa-text">
              <span className="text-border dark:text-white/20">├──</span>
              <Folder size={12} className="text-numa-primary/80 dark:text-numa-accent/80" />
              <span>auth/</span>
              <span className="text-[10px] text-muted-foreground/60 dark:text-numa-dim">(JWT, session, RBAC)</span>
            </div>
            <div className="flex items-center gap-1.5 text-foreground/90 dark:text-numa-text">
              <span className="text-border dark:text-white/20">├──</span>
              <Folder size={12} className="text-numa-primary/80 dark:text-numa-accent/80" />
              <span>inventory/</span>
              <span className="text-[10px] text-muted-foreground/60 dark:text-numa-dim">(catalog, stock, SKU)</span>
            </div>
            <div className="flex items-center gap-1.5 text-foreground/90 dark:text-numa-text">
              <span className="text-border dark:text-white/20">├──</span>
              <Folder size={12} className="text-numa-primary/80 dark:text-numa-accent/80" />
              <span>pos-checkout/</span>
              <span className="text-[10px] text-muted-foreground/60 dark:text-numa-dim">(scanner, cart, tax)</span>
            </div>
            <div className="flex items-center gap-1.5 text-foreground/90 dark:text-numa-text">
              <span className="text-border dark:text-white/20">└──</span>
              <Folder size={12} className="text-numa-primary/80 dark:text-numa-accent/80" />
              <span>payments/</span>
              <span className="text-[10px] text-muted-foreground/60 dark:text-numa-dim">(cash, QRIS, receipt)</span>
            </div>
          </div>
        </div>
      </div>
    ),
    glowPos: 'top-0 left-0',
  },
  {
    span: 'md:col-span-7',
    step: '04',
    label: 'Numa Forge',
    title: 'Bounded context task graph',
    desc: 'Pemecahan arsitektur menjadi atomic tasks dengan batas file terisolasi (create, modify, forbid). Developer mengontrol checkpoint persetujuan.',
    mockup: (
      <div className="space-y-3 w-full">
        <div className="grid grid-cols-3 gap-2.5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground dark:text-numa-dim uppercase px-1">
              <span>To Do</span>
              <span>2</span>
            </div>
            <div className="rounded-md bg-muted/60 border border-border p-2.5 text-[11px] text-foreground/80 dark:bg-white/[.03] dark:border-white/[.06] dark:text-numa-muted space-y-1">
              <div className="font-medium truncate">Setup DB &amp; Migrations</div>
              <div className="text-[9px] font-mono text-muted-foreground/70 dark:text-numa-dim">create: schema.prisma</div>
            </div>
            <div className="rounded-md bg-muted/60 border border-border p-2.5 text-[11px] text-foreground/80 dark:bg-white/[.03] dark:border-white/[.06] dark:text-numa-muted space-y-1">
              <div className="font-medium truncate">Auth API &amp; Middleware</div>
              <div className="text-[9px] font-mono text-muted-foreground/70 dark:text-numa-dim">create: auth.ts</div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-numa-primary uppercase px-1">
              <span>In Progress</span>
              <span>1</span>
            </div>
            <div className="rounded-md bg-numa-primary/10 border border-numa-primary/30 p-2.5 text-[11px] text-numa-primary dark:text-numa-accent space-y-1 shadow-2xs">
              <div className="font-medium truncate">Checkout POS Screen</div>
              <div className="text-[9px] font-mono opacity-80">modify: cart.tsx, pos.tsx</div>
              <div className="flex items-center gap-1 text-[9px] font-mono text-amber-500 pt-0.5">
                <span>forbid: billing/*.ts</span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground dark:text-numa-dim uppercase px-1">
              <span>Done</span>
              <span>2</span>
            </div>
            <div className="rounded-md bg-muted/40 border border-border/70 p-2.5 text-[11px] text-muted-foreground/60 dark:bg-white/[.02] dark:border-white/[.04] dark:text-numa-dim space-y-1">
              <div className="font-medium truncate line-through">Product Catalog API</div>
              <div className="text-[9px] font-mono">tests: passed (3/3)</div>
            </div>
            <div className="rounded-md bg-muted/40 border border-border/70 p-2.5 text-[11px] text-muted-foreground/60 dark:bg-white/[.02] dark:border-white/[.04] dark:text-numa-dim space-y-1">
              <div className="font-medium truncate line-through">Barcode Scanner Hook</div>
              <div className="text-[9px] font-mono">tests: passed (2/2)</div>
            </div>
          </div>
        </div>
      </div>
    ),
    glowPos: 'bottom-0 right-0',
  },
];

const ICONS = [MessageSquareText, FileText, GitBranch, Kanban];

export function FeaturesSection() {
  return (
    <section id="features" className="py-32 overflow-hidden">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-20">
          <p className="font-mono text-xs tracking-[0.3em] uppercase text-numa-primary mb-4 pipeline-fade">Pipeline</p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl pipeline-fade text-foreground dark:text-white">Satu alur. Tanpa bolak-balik.</h2>
          <p className="mt-4 text-muted-foreground dark:text-numa-muted-light text-base max-w-md pipeline-fade">Tiap tahap menghasilkan artefak nyata yang menjadi input tahap berikutnya.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 stagger-grid" id="pipelineGrid">
          {CARDS.map((card, i) => {
            const Icon = ICONS[i];
            return (
              <div key={i} className={`${card.span} card-tilt rounded-md border border-border/80 bg-card p-8 flex flex-col justify-between relative overflow-hidden group shadow-sm dark:border-white/[.06] dark:bg-neutral-950 dark:shadow-none`}>
                <div className={`absolute ${card.glowPos} w-40 h-40 bg-numa-primary/5 rounded-full blur-[60px] transition-all group-hover:bg-numa-primary/10`}></div>
                <div>
                  <div className="flex items-center gap-3 mb-5">
                    <div className="pipeline-dot active"></div>
                    <span className="font-mono text-[11px] text-numa-primary uppercase tracking-wider">{card.step} / {card.label}</span>
                  </div>
                  <h3 className="text-xl font-bold mb-3 text-card-foreground dark:text-white">{card.title}</h3>
                  <p className="text-sm text-muted-foreground dark:text-numa-muted-light leading-relaxed max-w-md">{card.desc}</p>
                </div>
                <div className="pt-4">
                  {card.mockup}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
