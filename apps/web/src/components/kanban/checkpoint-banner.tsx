// Banner approval checkpoint human-in-the-loop. Selama ada checkpoint PENDING,
// agent CLI diblokir server (HTTP 409) sampai user menyetujui di sini.
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ShieldAlert, Loader2 } from 'lucide-react';
import { api } from '@/lib/http';
import { AlertBanner } from '@/components/ui/alert-banner';
import { Button } from '@/components/ui/button';

type Checkpoint = {
  id: string;
  type: string;
  layer: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  message: string | null;
};

type CheckpointBannerProps = {
  projectId: string;
  /** Berubah setiap daftar task dimuat ulang, memicu pemuatan ulang checkpoint. */
  refreshKey: number;
};

export function CheckpointBanner({ projectId, refreshKey }: CheckpointBannerProps) {
  const [pending, setPending] = useState<Checkpoint[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ checkpoints: Checkpoint[] }>(`/api/projects/${projectId}/checkpoints`);
      setPending(res.checkpoints.filter((c) => c.status === 'PENDING'));
    } catch {
      // Banner bersifat pelengkap: kegagalan memuat tidak mengganggu papan.
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const approve = async (id: string) => {
    setApprovingId(id);
    setError(null);
    try {
      await api(`/api/checkpoints/${id}/approve`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyetujui checkpoint.');
    } finally {
      setApprovingId(null);
    }
  };

  if (pending.length === 0 && !error) return null;

  return (
    <div className="space-y-2">
      {pending.map((cp) => (
        <AlertBanner
          key={cp.id}
          variant="info"
          className="gap-3 p-3"
          actions={
            <Button
              type="button"
              size="sm"
              onClick={() => approve(cp.id)}
              disabled={approvingId === cp.id}
              aria-label={`Setujui checkpoint ${cp.type}`}
            >
              {approvingId === cp.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Setujui
            </Button>
          }
        >
          <div className="flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-foreground">
                Checkpoint menunggu persetujuan{cp.layer ? ` (layer ${cp.layer})` : ''}
              </p>
              <p>{cp.message ?? 'Agent berhenti sampai Anda menyetujui checkpoint ini.'}</p>
            </div>
          </div>
        </AlertBanner>
      ))}
      {error && <AlertBanner variant="destructive" onDismiss={() => setError(null)}>{error}</AlertBanner>}
    </div>
  );
}
