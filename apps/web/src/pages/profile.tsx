// Halaman profil: info akun + pengelolaan Token Akses Agen (PAT) terpusat.
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/auth-client';
import { api } from '@/lib/http';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Copy, Check, Trash2, KeyRound, Loader2, ShieldCheck } from 'lucide-react';

type Token = {
  id: string;
  name: string;
  lastUsedAt: string | null;
  isRevoked: boolean;
  createdAt: string;
};

export function ProfilePage() {
  const { data } = useSession();
  const qc = useQueryClient();
  const [name, setName] = useState('Token CLI');
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const tokensQ = useQuery({
    queryKey: ['agent-tokens'],
    queryFn: () => api<{ tokens: Token[] }>('/api/agent-tokens'),
  });

  const createMut = useMutation<{ token: string }>({
    mutationFn: () =>
      api<{ token: string }>('/api/agent-tokens', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() || 'Token CLI' }),
      }),
    onSuccess: (res) => {
      setNewToken(res.token);
      localStorage.setItem('numa_active_pat', res.token);
      setName('Token CLI');
      qc.invalidateQueries({ queryKey: ['agent-tokens'] });
    },
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => api(`/api/agent-tokens/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-tokens'] }),
  });

  async function copy() {
    if (!newToken) return;
    await navigator.clipboard.writeText(newToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const user = data?.user;
  const initial = user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U';

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Info akun */}
      <Card className="border-border shadow-xs">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Informasi Akun</CardTitle>
          <CardDescription>Akun ini terhubung melalui autentikasi Google.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              {user?.image && <AvatarImage src={user.image} alt={user.name ?? 'Pengguna'} />}
              <AvatarFallback className="bg-primary text-primary-foreground text-lg">{initial}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-foreground">{user?.name || 'Pengguna'}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pengelolaan PAT Universal */}
      <Card className="border-border shadow-xs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <KeyRound className="h-5 w-5 text-primary" />
            Token Akses Pribadi (PAT)
          </CardTitle>
          <CardDescription>
            Token digunakan untuk autentikasi CLI di terminal (<code>npx numa login &lt;token&gt;</code>).
            Satu token mewakili identitas Anda dan dapat mengakses semua proyek Anda. Token plaintext hanya ditampilkan sekali saat dibuat.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Form buat token */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama perangkat/token, mis. Laptop Kerja"
              className="sm:flex-1"
            />
            <Button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending || !name.trim()}
              className="gap-2 font-medium"
            >
              {createMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Buat Token Baru
            </Button>
          </div>
          {createMut.isError && (
            <p className="text-sm text-destructive">Gagal membuat token. Silakan coba lagi.</p>
          )}

          {/* Token baru, tampil sekali */}
          {newToken && (
            <div className="p-4 border border-primary/50 bg-primary/5 dark:bg-primary/10 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-primary font-medium text-sm">
                <ShieldCheck className="h-4 w-4" />
                <span>Token Berhasil Dibuat</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Salin dan simpan sekarang di tempat aman. Token ini tidak akan pernah ditampilkan lagi.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-background p-2.5 rounded border border-border font-mono text-xs break-all select-all">
                  {newToken}
                </code>
                <Button size="sm" variant="outline" onClick={copy} className="gap-1.5 shrink-0 text-xs">
                  {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Tersalin' : 'Salin'}
                </Button>
              </div>
            </div>
          )}

          {/* Daftar token */}
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-semibold text-foreground">Daftar Token Anda</h3>
            {tokensQ.isLoading && <p className="text-sm text-muted-foreground">Memuat token...</p>}
            {tokensQ.data?.tokens.length === 0 && (
              <p className="text-sm text-muted-foreground">Belum ada token aktif. Buat token pertama Anda di atas.</p>
            )}
            {tokensQ.data?.tokens.map((t) => (
              <div key={t.id} className="border border-border rounded-lg p-3.5 flex items-center justify-between gap-3 bg-card">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground">{t.name}</p>
                    <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">
                      Semua Proyek
                    </Badge>
                    {t.isRevoked ? (
                      <Badge variant="outline" className="text-[10px] border-destructive text-destructive bg-destructive/5">
                        Dicabut
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
                        Aktif
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Dibuat {new Date(t.createdAt).toLocaleDateString('id-ID')}
                    {' · '}
                    {t.lastUsedAt
                      ? `Terakhir dipakai ${new Date(t.lastUsedAt).toLocaleString('id-ID')}`
                      : 'Belum pernah dipakai'}
                  </p>
                </div>
                {!t.isRevoked && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => revokeMut.mutate(t.id)}
                    disabled={revokeMut.isPending}
                    className="hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                    title={`Cabut token ${t.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
