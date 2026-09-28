import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

export function CtaSection() {
  return (
    <section className="py-32 relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-numa-primary/6 rounded-full blur-[100px]"></div>
      </div>
      <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-5xl cta-fade text-foreground dark:text-white">
          Ubah kejelasan ide jadi progres nyata.
        </h2>
        <p className="mt-4 text-muted-foreground dark:text-numa-muted-light text-base max-w-md mx-auto cta-fade">
          Fondasi produk Anda sudah siap. Mulai perencanaan arsitektur dan eksekusi sekarang.
        </p>
        <div className="mt-8 cta-fade">
          <Link
            to="/login"
            className="group inline-flex items-center gap-2 rounded-md bg-numa-primary px-8 py-4 text-sm font-semibold text-white transition-all hover:shadow-[0_0_40px_rgba(45,126,121,.4)]"
          >
            Mulai Sekarang
            <ArrowUpRight size={16} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
