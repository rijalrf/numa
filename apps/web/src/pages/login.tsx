// Halaman masuk: satu-satunya metode adalah akun Google.
import { useState } from 'react';
import { signIn } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export function LoginPage() {
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loginWithGoogle() {
    setErr(null);
    setLoading(true);
    try {
      const callbackURL = typeof window !== 'undefined' ? `${window.location.origin}/dashboard` : '/dashboard';
      await signIn.social({ provider: 'google', callbackURL });
      // signIn.social mengalihkan ke halaman persetujuan Google secara otomatis.
    } catch {
      setLoading(false);
      setErr('Gagal memulai login Google. Silakan coba lagi.');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-2xl">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-[#2D7E79] to-[#76B8A7]">
              <span className="text-xs font-bold text-white">N</span>
            </div>
            <span className="text-foreground">Numa</span>
          </CardTitle>
          <CardDescription>
            AI Software Factory. Masuk dengan akun Google Anda untuk melanjutkan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full" onClick={loginWithGoogle} disabled={loading}>
            {loading ? 'Mengalihkan ke Google...' : 'Masuk dengan Google'}
          </Button>
          {err && <p className="text-sm text-destructive text-center">{err}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
