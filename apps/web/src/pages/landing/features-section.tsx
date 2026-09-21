import { MessageSquareText, FileText, GitBranch, Kanban } from 'lucide-react';

const CARDS = [
  {
    span: 'md:col-span-7',
    step: '01',
    label: 'Numa Brief',
    title: 'Discovery terarah, bukan prompt mentah',
    desc: 'Wawancara kebutuhan interaktif untuk memetakan arsitektur, edge case, dan skala target sebelum baris kode pertama ditulis.',
    mockup: (
      <div className="mt-6 space-y-2 max-w-sm">
        <div className="flex gap-2 items-end">
          <div className="rounded-xl rounded-bl-sm bg-white/[.04] border border-white/[.06] px-3.5 py-2 text-xs text-numa-text">Saya mau bikin app inventory buat toko kecil</div>
        </div>
        <div className="flex gap-2 items-end justify-end">
          <div className="rounded-xl rounded-br-sm bg-numa-primary/15 border border-numa-primary/20 px-3.5 py-2 text-xs text-numa-accent">Apakah multi-cabang? Perlu tracking supplier?</div>
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
      <div className="mt-6 space-y-1.5">
        <div className="h-2 w-full rounded-full bg-white/[.04]"></div>
        <div className="h-2 w-4/5 rounded-full bg-white/[.04]"></div>
        <div className="h-2 w-3/5 rounded-full bg-numa-primary/10"></div>
        <div className="h-2 w-full rounded-full bg-white/[.04]"></div>
        <div className="h-2 w-2/3 rounded-full bg-white/[.04]"></div>
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
      <div className="mt-6 font-mono text-[11px] text-numa-muted space-y-1 leading-relaxed">
        <p className="text-numa-accent">app/</p>
        <p className="pl-4">auth/</p>
        <p className="pl-8 text-numa-dim">login, register, reset</p>
        <p className="pl-4">inventory/</p>
        <p className="pl-8 text-numa-dim">products, categories, stock</p>
        <p className="pl-4">orders/</p>
        <p className="pl-8 text-numa-dim">checkout, history, refund</p>
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
      <div className="mt-6 grid grid-cols-3 gap-2 max-w-sm">
        <div>
          <p className="text-[10px] font-mono text-numa-dim uppercase mb-2">To Do</p>
          <div className="space-y-1.5">
            <div className="rounded-lg bg-white/[.03] border border-white/[.06] p-2 text-[10px] text-numa-muted">Setup auth middleware</div>
            <div className="rounded-lg bg-white/[.03] border border-white/[.06] p-2 text-[10px] text-numa-muted">Create product API</div>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-mono text-numa-primary uppercase mb-2">In Progress</p>
          <div className="rounded-lg bg-numa-primary/10 border border-numa-primary/20 p-2 text-[10px] text-numa-accent">Checkout page</div>
        </div>
        <div>
          <p className="text-[10px] font-mono text-numa-dim uppercase mb-2">Done</p>
          <div className="space-y-1.5">
            <div className="rounded-lg bg-white/[.03] border border-white/[.06] p-2 text-[10px] text-numa-dim line-through">DB schema</div>
            <div className="rounded-lg bg-white/[.03] border border-white/[.06] p-2 text-[10px] text-numa-dim line-through">Seed data</div>
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
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl pipeline-fade">Satu alur. Tanpa bolak-balik.</h2>
          <p className="mt-4 text-numa-muted-light text-base max-w-md pipeline-fade">Tiap tahap menghasilkan artefak nyata yang menjadi input tahap berikutnya.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 stagger-grid" id="pipelineGrid">
          {CARDS.map((card, i) => {
            const Icon = ICONS[i];
            return (
              <div key={i} className={`${card.span} card-tilt rounded-2xl border border-white/[.06] bg-numa-card p-8 relative overflow-hidden group`}>
                <div className={`absolute ${card.glowPos} w-40 h-40 bg-numa-primary/5 rounded-full blur-[60px] transition-all group-hover:bg-numa-primary/10`}></div>
                <div className="flex items-center gap-3 mb-5">
                  <div className="pipeline-dot active"></div>
                  <span className="font-mono text-[11px] text-numa-primary uppercase tracking-wider">{card.step} / {card.label}</span>
                </div>
                <h3 className="text-xl font-bold mb-3">{card.title}</h3>
                <p className="text-sm text-numa-muted-light leading-relaxed max-w-md">{card.desc}</p>
                {card.mockup}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
