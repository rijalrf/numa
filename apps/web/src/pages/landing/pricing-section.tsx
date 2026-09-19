import { Link } from 'react-router-dom';
import { Minus } from 'lucide-react';

const PLANS = [
  {
    name: 'Starter',
    price: '$0',
    period: '',
    features: [
      '2 project aktif',
      'Full pipeline: interview sampai task board',
      'CLI tanpa batas',
    ],
    cta: 'Mulai Gratis',
    pro: false,
  },
  {
    name: 'Pro',
    price: '$19',
    period: '/bln',
    features: [
      'Unlimited project',
      'Priority AI generation',
      'Expor BRD, roadmap, dan task',
      'Multi-agent token',
    ],
    cta: 'Pilih Pro',
    pro: true,
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="py-28">
      <div className="mx-auto max-w-4xl px-6">
        <div className="text-center mb-16">
          <p className="font-mono text-xs tracking-[0.3em] uppercase text-numa-primary mb-4">Harga</p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Mulai gratis. Serius.</h2>
          <p className="mt-3 text-numa-muted-light text-base">Tidak perlu kartu kredit. Upgrade kalau sudah ketagihan.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {PLANS.map((plan, i) => (
            <div
              key={i}
              className={`relative rounded-2xl border ${plan.pro ? 'border-numa-primary/30 shadow-[0_0_60px_-20px_rgba(45,126,121,.15)]' : 'border-white/[.06]'} bg-numa-card p-8 flex flex-col pricing-card`}
            >
              {plan.pro && (
                <div className="absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-numa-primary to-transparent"></div>
              )}
              <div className="flex items-center justify-between mb-6">
                <p className={`font-mono text-xs uppercase tracking-wider ${plan.pro ? 'text-numa-accent' : 'text-numa-muted'}`}>{plan.name}</p>
                <div className={plan.pro ? 'text-right' : ''}>
                  <span className="text-3xl font-extrabold">{plan.price}</span>
                  {plan.period && <span className="text-sm text-numa-muted">{plan.period}</span>}
                </div>
              </div>
              <ul className="space-y-3 text-sm text-numa-text flex-1">
                {plan.features.map((feat, j) => (
                  <li key={j} className="flex items-start gap-3">
                    <Minus size={14} className={`mt-0.5 flex-shrink-0 ${plan.pro ? 'text-numa-primary' : 'text-numa-dim'}`} />
                    {feat}
                  </li>
                ))}
              </ul>
              <Link
                to="/login"
                className={`mt-8 w-full rounded-full py-3 text-sm font-medium text-center block transition-all ${
                  plan.pro
                    ? 'bg-numa-primary text-white font-semibold hover:shadow-[0_0_30px_rgba(45,126,121,0.35)]'
                    : 'border border-white/[.08] text-numa-text hover:border-white/20 hover:text-white'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
