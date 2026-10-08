// Halaman persetujuan login CLI (device code): user mencocokkan kode di terminal lalu menyetujui atau menolak.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { CheckCircle2, ShieldAlert, Terminal, XCircle } from 'lucide-react';
import { api } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertBanner } from '@/components/ui/alert-banner';

type CliAuthRequest = { userCode: string; clientName: string; status: string; expiresAt: string; expired: boolean };

export function CliLoginPage() {
  const [params, setParams] = useSearchParams();
  const code = (params.get('code') ?? '').trim();
  const [manualCode, setManualCode] = useState('');
  const [decision, setDecision] = useState<'approved' | 'denied' | null>(null);

  const requestQ = useQuery({
    queryKey: ['cli-auth-request', code],
    queryFn: () => api<CliAuthRequest>(`/api/cli-auth/request?code=${encodeURIComponent(code)}`),
    enabled: code.length > 0,
    retry: false,
  });

  const resolveMut = useMutation({
    mutationFn: (kind: 'approve' | 'deny') => api(`/api/cli-auth/${kind}`, { method: 'POST', body: JSON.stringify({ code }) }),
    onSuccess: (_res, kind) => setDecision(kind === 'approve' ? 'approved' : 'denied'),
  });

  const info = requestQ.data;
  const unavailable = requestQ.isError || (info && (info.expired || info.status !== 'pending'));

  return (
    <div className="max-w-md mx-auto w-full py-10">
      <Card className="border-border shadow-xs">
        <CardHeader className="space-y-1.5">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            Login CLI Numa
          </CardTitle>
          <CardDescription className="text-xs">Setujui CLI di komputer Anda agar dapat menjalankan task proyek.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {decision === 'approved' && (
            <AlertBanner variant="success" className="gap-2 p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>CLI disetujui. Kembali ke terminal; login akan selesai otomatis. Halaman ini boleh ditutup.</span>
              </div>
            </AlertBanner>
          )}
          {decision === 'denied' && (
            <AlertBanner variant="info" className="gap-2 p-3">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 shrink-0" />
                <span>Permintaan login ditolak. CLI tidak mendapat akses.</span>
              </div>
            </AlertBanner>
          )}

          {!code && !decision && (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (manualCode.trim()) setParams({ code: manualCode.trim() });
              }}
            >
              <label htmlFor="cli-code" className="text-xs font-medium text-foreground">
                Kode dari terminal
              </label>
              <Input id="cli-code" value={manualCode} onChange={(e) => setManualCode(e.target.value)} placeholder="ABCD-EF23" autoComplete="off" />
              <Button type="submit" size="sm" disabled={!manualCode.trim()}>
                Lanjut
              </Button>
            </form>
          )}

          {code && requestQ.isLoading && <p className="text-xs text-muted-foreground">Memeriksa kode...</p>}

          {code && unavailable && !decision && (
            <AlertBanner variant="destructive" className="gap-2 p-3">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 shrink-0" />
                <span>Kode tidak ditemukan, sudah diproses, atau kedaluwarsa. Jalankan ulang perintah numa di terminal untuk kode baru.</span>
              </div>
            </AlertBanner>
          )}

          {info && !unavailable && !decision && (
            <>
              <div className="rounded-md border border-border bg-muted/30 p-4 text-center space-y-1">
                <p className="text-[11px] text-muted-foreground">Kode login</p>
                <p className="text-2xl font-mono font-bold tracking-widest text-foreground" aria-label="Kode login">
                  {info.userCode}
                </p>
                <p className="text-[11px] text-muted-foreground">Perangkat: {info.clientName}</p>
              </div>
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Setujui hanya bila kode di atas sama persis dengan yang tampil di terminal Anda. CLI akan mendapat akses ke semua proyek Anda
                  selama 90 hari; Anda dapat mencabutnya kapan saja di halaman profil.
                </span>
              </div>
              {resolveMut.isError && <p className="text-xs text-destructive">Gagal memproses permintaan. Silakan coba lagi.</p>}
              <div className="flex gap-2">
                <Button size="sm" onClick={() => resolveMut.mutate('approve')} disabled={resolveMut.isPending}>
                  Setujui
                </Button>
                <Button size="sm" variant="outline" onClick={() => resolveMut.mutate('deny')} disabled={resolveMut.isPending}>
                  Tolak
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
