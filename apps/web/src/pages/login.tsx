// Halaman masuk Numa: autentikasi aman via Google OAuth (default light mode).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { signIn } from '@/lib/auth-client';
import { ArrowLeft, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import { NumaLogoIcon } from '@/components/ui/numa-logo';

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function LoginPage() {
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loginWithGoogle() {
    setErr(null);
    setLoading(true);
    try {
      const callbackURL = typeof window !== 'undefined' ? `${window.location.origin}/chat` : '/chat';
      await signIn.social({ provider: 'google', callbackURL });
      // signIn.social mengalihkan ke halaman persetujuan Google secara otomatis.
    } catch {
      setLoading(false);
      setErr('Gagal memulai login Google. Silakan coba lagi.');
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background ambient glow dan grid pattern */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[450px] w-[600px] rounded-full bg-numa-primary/10 blur-[120px] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000008_1px,transparent_1px),linear-gradient(to_bottom,#00000008_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      {/* Navigasi kembali ke Beranda */}
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6 group relative z-10"
      >
        <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
        <span>Kembali ke Beranda</span>
      </Link>

      {/* Card Login */}
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm backdrop-blur-xl z-10">
        {/* Logo dan Header */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#193c34] border border-[#2b584a] text-[#dceda7] shadow-[0_0_24px_rgba(220,237,167,.15)]">
            <NumaLogoIcon className="h-8 w-8 text-[#dceda7]" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center justify-center gap-1.5">
            numa<span className="text-[#193c34]">.</span>
          </h1>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            AI Software Factory untuk mengubah ide menjadi aplikasi siap eksekusi
          </p>
        </div>

        {/* Tombol Login Google */}
        <div className="space-y-4">
          <button
            type="button"
            onClick={loginWithGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 rounded-md border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-all hover:bg-muted hover:border-foreground/20 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed shadow-xs cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Mengalihkan ke Google...</span>
              </>
            ) : (
              <>
                <GoogleIcon className="h-4 w-4 shrink-0" />
                <span>Masuk dengan Google</span>
              </>
            )}
          </button>

          {/* Pesan Error jika ada */}
          {err && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive text-center flex items-center justify-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{err}</span>
            </div>
          )}
        </div>

        {/* Footer info keamanan */}
        <div className="mt-8 pt-6 border-t border-border flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary/80 shrink-0" />
          <span>Autentikasi resmi & aman via Google OAuth</span>
        </div>
      </div>
    </div>
  );
}
