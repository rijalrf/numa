// Dashboard pemakaian AI untuk admin platform: total token dan request, rincian per tahap, per user, per paket, dan estimasi biaya.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2, Coins, Activity, Gauge, CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '@/lib/http';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

type PricingConfigured = { reasoning: boolean; cheap: boolean };
type Summary = {
  pricingConfigured: PricingConfigured;
  calls: number;
  successCalls: number;
  failedCalls: number;
  successRate: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  avgLatencyMs: number;
  estimatedCalls: number;
  costRupiah: number | null;
};
type Point = { date: string; calls: number; totalTokens: number; costRupiah: number | null };
type AgentRow = {
  agentName: string;
  promptVersion: string | null;
  calls: number;
  totalTokens: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgLatencyMs: number;
  successRate: number;
  costRupiah: number | null;
};
type UserRow = {
  userId: string | null;
  email: string | null;
  name: string | null;
  plan: 'free' | 'starter' | 'pro' | null;
  projectCount: number;
  calls: number;
  totalTokens: number;
  costRupiah: number | null;
};
type UserPage = { page: number; pageSize: number; total: number; items: UserRow[] };
type Dist = { avg: number; median: number; p90: number; max: number };
type PlanRow = {
  plan: string;
  planName: string;
  price: number;
  monthlyTokenBudget: number;
  activeUsers: number;
  totalTokens: number;
  perUser: Dist;
  perProject: Dist & { projects: number };
  totalCostRupiah: number | null;
  avgCostPerUserRupiah: number | null;
  grossMarginPerUserRupiah: number | null;
};

const nf = new Intl.NumberFormat('id-ID');
const fmt = (n: number) => nf.format(n);
const rupiah = (n: number | null) => (n === null ? 'Harga belum diatur' : `Rp ${nf.format(n)}`);
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} dtk`;

function dateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

function defaultRange() {
  const now = new Date();
  return { from: dateInput(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), to: dateInput(now) };
}

function buildQuery(range: { from: string; to: string }, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({
    from: new Date(`${range.from}T00:00:00.000Z`).toISOString(),
    // Tanggal akhir inklusif: batas atas dibuat awal hari berikutnya.
    to: new Date(new Date(`${range.to}T00:00:00.000Z`).getTime() + 86_400_000).toISOString(),
    ...extra,
  });
  return params.toString();
}

function QueryState({ loading, error, empty, children }: { loading: boolean; error: unknown; empty?: boolean; children: React.ReactNode }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Memuat data...
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive py-6">
        <AlertCircle className="h-4 w-4" /> {error instanceof ApiError ? error.message : 'Gagal memuat data.'}
      </div>
    );
  }
  if (empty) return <div className="text-sm text-muted-foreground py-6">Belum ada data pada rentang tanggal ini.</div>;
  return <>{children}</>;
}

function StatCard({ icon: Icon, label, value, hint }: { icon: typeof Coins; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-4 w-4" /> {label}
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function TokenChart({ points }: { points: Point[] }) {
  const width = 720;
  const height = 180;
  const pad = { top: 10, right: 8, bottom: 22, left: 8 };
  const max = Math.max(...points.map((p) => p.totalTokens), 1);
  const slot = (width - pad.left - pad.right) / points.length;
  const barW = Math.max(2, Math.min(28, slot * 0.7));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label="Grafik token per hari">
      {points.map((p, i) => {
        const h = ((height - pad.top - pad.bottom) * p.totalTokens) / max;
        const x = pad.left + slot * i + (slot - barW) / 2;
        const y = height - pad.bottom - h;
        return (
          <g key={p.date}>
            <rect x={x} y={y} width={barW} height={h} rx={2} className="fill-primary/80">
              <title>{`${p.date}: ${fmt(p.totalTokens)} token, ${fmt(p.calls)} request`}</title>
            </rect>
            {(points.length <= 10 || i % Math.ceil(points.length / 8) === 0) && (
              <text x={x + barW / 2} y={height - 6} textAnchor="middle" className="fill-muted-foreground" fontSize="10">
                {p.date.slice(5)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

const th = 'text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap';
const thR = 'text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap';
const td = 'px-3 py-2 whitespace-nowrap';
const tdR = 'px-3 py-2 text-right tabular-nums whitespace-nowrap';

export function AdminUsagePage() {
  const [range, setRange] = useState(defaultRange);
  const [applied, setApplied] = useState(range);
  const [page, setPage] = useState(1);
  const qs = useMemo(() => buildQuery(applied), [applied]);
  const invalidRange = range.from > range.to;

  const summary = useQuery({ queryKey: ['admin-usage', 'summary', qs], queryFn: () => api<Summary>(`/api/admin/usage/summary?${qs}`), retry: false });
  const series = useQuery({ queryKey: ['admin-usage', 'series', qs], queryFn: () => api<{ points: Point[] }>(`/api/admin/usage/timeseries?${qs}`), retry: false });
  const agents = useQuery({ queryKey: ['admin-usage', 'agents', qs], queryFn: () => api<{ items: AgentRow[] }>(`/api/admin/usage/by-agent?${qs}`), retry: false });
  const users = useQuery({
    queryKey: ['admin-usage', 'users', qs, page],
    queryFn: () => api<UserPage>(`/api/admin/usage/by-user?${buildQuery(applied, { page: String(page), pageSize: '20' })}`),
    retry: false,
  });
  const plans = useQuery({ queryKey: ['admin-usage', 'plans', qs], queryFn: () => api<{ items: PlanRow[] }>(`/api/admin/usage/by-plan?${qs}`), retry: false });

  const s = summary.data;
  const pricingMissing = s && !(s.pricingConfigured.reasoning && s.pricingConfigured.cheap);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="usage-from" className="block text-xs text-muted-foreground mb-1">Dari tanggal</label>
          <Input id="usage-from" type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} className="w-40" />
        </div>
        <div>
          <label htmlFor="usage-to" className="block text-xs text-muted-foreground mb-1">Sampai tanggal</label>
          <Input id="usage-to" type="date" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} className="w-40" />
        </div>
        <Button
          type="button"
          disabled={invalidRange || !range.from || !range.to}
          onClick={() => {
            setPage(1);
            setApplied(range);
          }}
          className="cursor-pointer"
        >
          Terapkan
        </Button>
        {invalidRange && <span className="text-xs text-destructive">Tanggal awal harus sebelum tanggal akhir.</span>}
      </div>

      {pricingMissing && (
        <div className="flex items-start gap-2 rounded-md border border-border/80 bg-muted/40 p-3 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Harga AI belum diatur penuh, sehingga estimasi biaya belum bisa dihitung. Isi variabel AI_PRICE_INPUT_PER_MTOK_* dan AI_PRICE_OUTPUT_PER_MTOK_* (rupiah per 1 juta token) di server.
          </span>
        </div>
      )}

      <QueryState loading={summary.isLoading} error={summary.error}>
        {s && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Coins} label="Total token" value={fmt(s.totalTokens)} hint={`Input ${fmt(s.inputTokens)} / output ${fmt(s.outputTokens)}`} />
            <StatCard icon={Activity} label="Total request" value={fmt(s.calls)} hint={`${fmt(s.failedCalls)} gagal`} />
            <StatCard icon={CheckCircle2} label="Tingkat sukses" value={`${s.successRate}%`} hint={`Latensi rata-rata ${seconds(s.avgLatencyMs)}`} />
            <StatCard
              icon={Gauge}
              label="Estimasi biaya"
              value={rupiah(s.costRupiah)}
              hint={s.estimatedCalls > 0 ? `${fmt(s.estimatedCalls)} request memakai token taksiran` : undefined}
            />
          </div>
        )}
      </QueryState>

      <Card>
        <CardHeader>
          <CardTitle>Token per hari</CardTitle>
          <CardDescription>Total token (input + output) per hari, zona waktu UTC.</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryState loading={series.isLoading} error={series.error} empty={series.data?.points.length === 0}>
            {series.data && series.data.points.length > 0 && <TokenChart points={series.data.points} />}
          </QueryState>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per tahap</CardTitle>
          <CardDescription>Pemakaian per jenis panggilan AI, diurutkan dari token terbesar.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <QueryState loading={agents.isLoading} error={agents.error} empty={agents.data?.items.length === 0}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className={th}>Tahap</th>
                  <th className={th}>Versi prompt</th>
                  <th className={thR}>Request</th>
                  <th className={thR}>Total token</th>
                  <th className={thR}>Rata-rata input</th>
                  <th className={thR}>Rata-rata output</th>
                  <th className={thR}>Latensi</th>
                  <th className={thR}>Sukses</th>
                  <th className={thR}>Biaya</th>
                </tr>
              </thead>
              <tbody>
                {agents.data?.items.map((a) => (
                  <tr key={`${a.agentName}|${a.promptVersion ?? ''}`} className="border-b last:border-0">
                    <td className={td}>{a.agentName}</td>
                    <td className={td}>{a.promptVersion ?? 'sebelum versi'}</td>
                    <td className={tdR}>{fmt(a.calls)}</td>
                    <td className={tdR}>{fmt(a.totalTokens)}</td>
                    <td className={tdR}>{fmt(a.avgInputTokens)}</td>
                    <td className={tdR}>{fmt(a.avgOutputTokens)}</td>
                    <td className={tdR}>{seconds(a.avgLatencyMs)}</td>
                    <td className={tdR}>{a.successRate}%</td>
                    <td className={tdR}>{rupiah(a.costRupiah)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </QueryState>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per paket</CardTitle>
          <CardDescription>
            Dasar menimbang harga paket: sebaran token per user dan per project dibandingkan budget dan harga paket. Margin kasar = harga paket dikurangi rata-rata biaya AI per user pada rentang ini.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <QueryState loading={plans.isLoading} error={plans.error}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className={th}>Paket</th>
                  <th className={thR}>Harga</th>
                  <th className={thR}>Budget token</th>
                  <th className={thR}>User aktif</th>
                  <th className={thR}>Token per user (rata-rata / median / P90 / maks)</th>
                  <th className={thR}>Token per project (rata-rata / median / P90 / maks)</th>
                  <th className={thR}>Biaya AI per user</th>
                  <th className={thR}>Margin kasar per user</th>
                </tr>
              </thead>
              <tbody>
                {plans.data?.items.map((p) => (
                  <tr key={p.plan} className="border-b last:border-0">
                    <td className={td}>{p.planName}</td>
                    <td className={tdR}>{p.price === 0 ? 'Gratis' : `Rp ${fmt(p.price)}`}</td>
                    <td className={tdR}>{p.monthlyTokenBudget === 0 ? 'Tanpa batas' : fmt(p.monthlyTokenBudget)}</td>
                    <td className={tdR}>{fmt(p.activeUsers)}</td>
                    <td className={tdR}>
                      {fmt(p.perUser.avg)} / {fmt(p.perUser.median)} / {fmt(p.perUser.p90)} / {fmt(p.perUser.max)}
                    </td>
                    <td className={tdR}>
                      {p.perProject.projects === 0
                        ? '-'
                        : `${fmt(p.perProject.avg)} / ${fmt(p.perProject.median)} / ${fmt(p.perProject.p90)} / ${fmt(p.perProject.max)}`}
                    </td>
                    <td className={tdR}>{p.activeUsers === 0 ? '-' : rupiah(p.avgCostPerUserRupiah)}</td>
                    <td className={tdR}>{p.activeUsers === 0 ? '-' : rupiah(p.grossMarginPerUserRupiah)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </QueryState>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per user</CardTitle>
          <CardDescription>Diurutkan dari pemakaian token terbesar.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <QueryState loading={users.isLoading} error={users.error} empty={users.data?.items.length === 0}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className={th}>User</th>
                  <th className={th}>Paket</th>
                  <th className={thR}>Project</th>
                  <th className={thR}>Request</th>
                  <th className={thR}>Total token</th>
                  <th className={thR}>Biaya</th>
                </tr>
              </thead>
              <tbody>
                {users.data?.items.map((u) => (
                  <tr key={u.userId ?? 'tanpa-user'} className="border-b last:border-0">
                    <td className={td}>
                      {u.email ?? 'Tidak teridentifikasi'}
                      {u.name && <span className="ml-2 text-xs text-muted-foreground">{u.name}</span>}
                    </td>
                    <td className={td}>{u.plan ? <Badge variant="outline">{u.plan}</Badge> : '-'}</td>
                    <td className={tdR}>{fmt(u.projectCount)}</td>
                    <td className={tdR}>{fmt(u.calls)}</td>
                    <td className={tdR}>{fmt(u.totalTokens)}</td>
                    <td className={tdR}>{rupiah(u.costRupiah)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.data && users.data.total > users.data.pageSize && (
              <div className="flex items-center justify-between pt-4 text-sm text-muted-foreground">
                <span>
                  Halaman {users.data.page} dari {Math.ceil(users.data.total / users.data.pageSize)} ({fmt(users.data.total)} user)
                </span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} className="cursor-pointer">
                    Sebelumnya
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page * users.data.pageSize >= users.data.total}
                    onClick={() => setPage(page + 1)}
                    className="cursor-pointer"
                  >
                    Berikutnya
                  </Button>
                </div>
              </div>
            )}
          </QueryState>
        </CardContent>
      </Card>
    </div>
  );
}
