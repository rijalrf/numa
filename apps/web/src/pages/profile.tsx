// Halaman profil: info akun, daftar Sesi CLI (untuk mencabut akses), tampilan, dan data akun.
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/auth-client';
import { useTheme } from '@/components/theme-provider';
import { api } from '@/lib/http';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Check,
  Trash2,
  Terminal,
  ShieldCheck,
  User,
  Loader2,
  Sun,
  Moon,
  Monitor,
  Palette,
  Download,
  AlertCircle,
} from 'lucide-react';

type Token = {
  id: string;
  name: string;
  lastUsedAt: string | null;
  isRevoked: boolean;
  expiresAt: string | null;
  createdAt: string;
};

export function ProfilePage() {
  const { data } = useSession();
  const qc = useQueryClient();
  const { theme, setTheme } = useTheme();

  const [userNameInput, setUserNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  const user = data?.user;

  useEffect(() => {
    if (user?.name) {
      setUserNameInput(user.name);
    }
  }, [user?.name]);

  useEffect(() => {
    // Bersihkan sisa penyimpanan lama: PAT mentah tidak boleh bertahan di localStorage.
    try {
      localStorage.removeItem('numa_active_pat');
      localStorage.removeItem('numa_new_default_pat');
    } catch {
      // abaikan bila storage tidak tersedia
    }
  }, []);

  const tokensQ = useQuery({
    queryKey: ['agent-tokens'],
    queryFn: () => api<{ tokens: Token[] }>('/api/agent-tokens'),
  });

  const activeSessions = (tokensQ.data?.tokens ?? []).filter(
    (t) => !t.isRevoked && !(t.expiresAt && new Date(t.expiresAt).getTime() <= Date.now())
  );

  const revokeMut = useMutation({
    mutationFn: (id: string) => api(`/api/agent-tokens/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-tokens'] }),
  });

  const handleSaveName = async () => {
    if (!userNameInput.trim() || savingName) return;
    setSavingName(true);
    setNameSaved(false);
    try {
      await api('/api/user/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name: userNameInput.trim() }),
      });
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2500);
    } catch (err) {
      console.error('Gagal memperbarui nama profil:', err);
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Info akun — Form Kolom */}
      <Card className="border-border shadow-xs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <User className="h-5 w-5 text-primary" />
            Informasi Akun
          </CardTitle>
          <CardDescription>Kelola data profil dan identitas akun Anda.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4 max-w-md">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Nama Lengkap</label>
              <Input
                value={userNameInput}
                onChange={(e) => setUserNameInput(e.target.value)}
                placeholder="Nama Lengkap"
                className="text-xs h-9"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Email</label>
              <Input
                value={user?.email || ''}
                disabled
                className="text-xs h-9 bg-muted/50 cursor-not-allowed opacity-80"
              />
              <p className="text-[11px] text-muted-foreground">
                Email terhubung dengan akun autentikasi Anda dan tidak dapat diubah.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-border/50">
            <Button
              type="button"
              size="sm"
              onClick={handleSaveName}
              disabled={savingName || !userNameInput.trim() || userNameInput === user?.name}
              className="h-9 px-4 text-xs shrink-0 gap-1.5"
            >
              {savingName && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {nameSaved && <Check className="h-3.5 w-3.5 text-primary" />}
              <span>{nameSaved ? 'Tersimpan' : 'Simpan'}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sesi CLI: hanya tampil bila ada sesi aktif, untuk mencabut akses (mis. laptop hilang). */}
      {activeSessions.length > 0 && (
        <Card className="border-border shadow-xs">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Terminal className="h-5 w-5 text-primary" />
              Sesi CLI
            </CardTitle>
            <CardDescription>Perangkat yang sedang terhubung ke akun Anda lewat CLI. Cabut sesi yang tidak lagi dipakai.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeSessions.map((t) => (
              <div key={t.id} className="border border-border rounded-md p-3.5 flex items-center justify-between gap-3 bg-card">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium text-foreground">{t.name.replace(/^CLI:\s*/, '')}</p>
                  <p className="text-xs text-muted-foreground">
                    Terhubung {new Date(t.createdAt).toLocaleDateString('id-ID')}
                    {' · '}
                    {t.lastUsedAt ? `Terakhir dipakai ${new Date(t.lastUsedAt).toLocaleString('id-ID')}` : 'Belum pernah dipakai'}
                    {t.expiresAt && ` · Berlaku sampai ${new Date(t.expiresAt).toLocaleDateString('id-ID')}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => revokeMut.mutate(t.id)}
                  disabled={revokeMut.isPending}
                  className="hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                  title={`Cabut sesi ${t.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Pengaturan tampilan */}
      <Card className="border-border shadow-xs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Palette className="h-5 w-5 text-primary" />
            Tampilan
          </CardTitle>
          <CardDescription>
            Pilih preferensi tema antarmuka aplikasi Numa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`p-3.5 rounded-md border text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                theme === 'light'
                  ? 'border-primary bg-primary/10 text-foreground font-medium ring-1 ring-primary/40'
                  : 'border-border/70 bg-background hover:bg-muted/40 text-muted-foreground'
              }`}
            >
              <div className="flex items-center justify-between">
                <Sun className="h-4 w-4 text-primary" />
                {theme === 'light' && <Check className="h-4 w-4 text-primary" />}
              </div>
              <div>
                <span className="font-semibold text-xs text-foreground block">Mode Terang</span>
                <span className="text-[11px] opacity-80 leading-relaxed block mt-0.5">Tampilan bersih dengan latar cerah</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`p-3.5 rounded-md border text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                theme === 'dark'
                  ? 'border-primary bg-primary/10 text-foreground font-medium ring-1 ring-primary/40'
                  : 'border-border/70 bg-background hover:bg-muted/40 text-muted-foreground'
              }`}
            >
              <div className="flex items-center justify-between">
                <Moon className="h-4 w-4 text-primary" />
                {theme === 'dark' && <Check className="h-4 w-4 text-primary" />}
              </div>
              <div>
                <span className="font-semibold text-xs text-foreground block">Mode Gelap</span>
                <span className="text-[11px] opacity-80 leading-relaxed block mt-0.5">Nyaman untuk kondisi minim cahaya</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setTheme('system')}
              className={`p-3.5 rounded-md border text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                theme === 'system'
                  ? 'border-primary bg-primary/10 text-foreground font-medium ring-1 ring-primary/40'
                  : 'border-border/70 bg-background hover:bg-muted/40 text-muted-foreground'
              }`}
            >
              <div className="flex items-center justify-between">
                <Monitor className="h-4 w-4 text-primary" />
                {theme === 'system' && <Check className="h-4 w-4 text-primary" />}
              </div>
              <div>
                <span className="font-semibold text-xs text-foreground block">Ikuti Sistem</span>
                <span className="text-[11px] opacity-80 leading-relaxed block mt-0.5">Menyesuaikan pengaturan OS Anda</span>
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      <DataAccountCard email={data?.user?.email ?? ''} />
    </div>
  );
}

// Unduh salinan data akun dan penghapusan akun permanen.
function DataAccountCard({ email }: { email: string }) {
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const exportData = useMutation({
    mutationFn: async () => {
      const data = await api<unknown>('/api/user/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'numa-account-export.json';
      a.click();
      URL.revokeObjectURL(url);
    },
    onMutate: () => {
      setError(null);
      setDownloaded(false);
    },
    onSuccess: () => {
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 3000);
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteAccount = useMutation({
    mutationFn: () => api('/api/user/account', { method: 'DELETE', body: JSON.stringify({ confirmEmail: confirm }) }),
    onMutate: () => setError(null),
    onSuccess: () => {
      window.location.href = '/login';
    },
    onError: (e: Error) => setError(e.message),
  });

  const emailMatches = Boolean(email) && confirm.trim().toLowerCase() === email.toLowerCase();

  return (
    <Card className="border-border shadow-xs">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Data Akun
        </CardTitle>
        <CardDescription>Kelola salinan data dan keberadaan akun Anda.</CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-border/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">Unduh data saya</p>
            <p className="text-xs text-muted-foreground">Salinan profil, project, PRD, task, dan riwayat langganan Anda.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportData.mutate()}
            disabled={exportData.isPending}
            className="gap-2 text-xs h-9 shrink-0"
          >
            {exportData.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : downloaded ? (
              <Check className="h-4 w-4 text-primary" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {downloaded ? 'Terunduh' : 'Unduh'}
          </Button>
        </div>

        <div className="pt-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Hapus akun</p>
              <p className="text-xs text-muted-foreground">
                Seluruh project, PRD, task, dan sesi CLI Anda dihapus permanen dan tidak dapat dikembalikan.
              </p>
            </div>
            {!deleting && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleting(true)}
                className="gap-2 text-xs h-9 shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Hapus akun
              </Button>
            )}
          </div>

          {deleting && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 space-y-3">
              <label htmlFor="confirm-delete" className="flex items-center gap-2 text-xs font-medium text-destructive">
                <AlertCircle className="h-4 w-4" />
                Ketik email akun Anda untuk mengonfirmasi
              </label>
              <Input
                id="confirm-delete"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={email}
                autoComplete="off"
                className="text-xs h-9 bg-background"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDeleting(false);
                    setConfirm('');
                    setError(null);
                  }}
                  disabled={deleteAccount.isPending}
                  className="text-xs h-9"
                >
                  Batal
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={!emailMatches || deleteAccount.isPending}
                  onClick={() => deleteAccount.mutate()}
                  className="gap-2 text-xs h-9"
                >
                  {deleteAccount.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Hapus permanen
                </Button>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
