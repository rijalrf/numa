// Halaman organisasi: daftar org, buat org baru, kelola anggota dan peran.
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/http';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Building2, Loader2, Plus, Trash2, UserPlus } from 'lucide-react';

type Role = 'viewer' | 'member' | 'admin' | 'owner';
const ROLE_LABEL: Record<Role, string> = {
  viewer: 'Viewer',
  member: 'Member',
  admin: 'Admin',
  owner: 'Owner',
};
const ROLES: Role[] = ['viewer', 'member', 'admin', 'owner'];

type OrgSummary = { id: string; name: string; role: Role; memberCount: number; projectCount: number };
type OrgDetail = {
  id: string;
  name: string;
  role: Role;
  members: Array<{ userId: string; email: string; name: string | null; role: Role }>;
  projects: Array<{ id: string; name: string }>;
};

function errorMessage(err: unknown) {
  return err instanceof ApiError || err instanceof Error ? err.message : 'Terjadi kesalahan.';
}

function OrgDetailCard({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [error, setError] = useState<string | null>(null);

  const detailQ = useQuery({
    queryKey: ['org', orgId],
    queryFn: () => api<{ org: OrgDetail }>(`/api/orgs/${orgId}`),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['org', orgId] });
    qc.invalidateQueries({ queryKey: ['orgs'] });
  };

  const addMut = useMutation({
    mutationFn: () => api(`/api/orgs/${orgId}/members`, { method: 'POST', body: JSON.stringify({ email, role }) }),
    onSuccess: () => {
      setEmail('');
      setError(null);
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const roleMut = useMutation({
    mutationFn: (v: { userId: string; role: Role }) =>
      api(`/api/orgs/${orgId}/members/${v.userId}`, { method: 'PATCH', body: JSON.stringify({ role: v.role }) }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const removeMut = useMutation({
    mutationFn: (userId: string) => api(`/api/orgs/${orgId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const org = detailQ.data?.org;
  if (detailQ.isLoading || !org) {
    return (
      <Card className="border-border shadow-xs">
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  const canManage = org.role === 'admin' || org.role === 'owner';

  return (
    <Card className="border-border shadow-xs">
      <CardHeader>
        <CardTitle className="text-base font-semibold">{org.name}</CardTitle>
        <CardDescription>
          Peran Anda: {ROLE_LABEL[org.role]}. {org.projects.length} project terhubung.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="divide-y divide-border rounded-md border border-border">
          {org.members.map((m) => (
            <div key={m.userId} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{m.name || m.email}</div>
                {m.name && <div className="text-xs text-muted-foreground truncate">{m.email}</div>}
              </div>
              {canManage ? (
                <select
                  value={m.role}
                  onChange={(e) => roleMut.mutate({ userId: m.userId, role: e.target.value as Role })}
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              ) : (
                <Badge variant="outline">{ROLE_LABEL[m.role]}</Badge>
              )}
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (window.confirm(`Keluarkan ${m.email} dari organisasi?`)) removeMut.mutate(m.userId);
                  }}
                  aria-label="Keluarkan anggota"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>

        {canManage && (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) addMut.mutate();
            }}
          >
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email anggota (sudah terdaftar di Numa)"
              className="text-xs h-9 max-w-xs"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="h-9 rounded-md border border-border bg-background px-2 text-xs"
            >
              {ROLES.filter((r) => r !== 'owner' || org.role === 'owner').map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" disabled={addMut.isPending || !email.trim()}>
              {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Tambah
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function OrgsPage() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const orgsQ = useQuery({ queryKey: ['orgs'], queryFn: () => api<{ orgs: OrgSummary[] }>('/api/orgs') });

  const createMut = useMutation({
    mutationFn: () => api<{ org: { id: string } }>('/api/orgs', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: (res) => {
      setName('');
      setError(null);
      setSelected(res.org.id);
      qc.invalidateQueries({ queryKey: ['orgs'] });
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const orgs = orgsQ.data?.orgs ?? [];
  const activeId = selected ?? orgs[0]?.id ?? null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <Card className="border-border shadow-xs">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Organisasi</CardTitle>
          <CardDescription>Bagikan project dengan tim dan atur peran tiap anggota.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim().length >= 2) createMut.mutate();
            }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama organisasi baru"
              className="text-xs h-9 max-w-xs"
            />
            <Button type="submit" size="sm" disabled={createMut.isPending || name.trim().length < 2}>
              {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Buat
            </Button>
          </form>
          {error && <p className="text-xs text-destructive">{error}</p>}

          {orgsQ.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : orgs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Anda belum tergabung di organisasi mana pun.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {orgs.map((o) => (
                <Button
                  key={o.id}
                  size="sm"
                  variant={o.id === activeId ? 'default' : 'outline'}
                  onClick={() => setSelected(o.id)}
                >
                  <Building2 className="h-4 w-4" />
                  {o.name}
                  <Badge variant="outline">{ROLE_LABEL[o.role]}</Badge>
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {activeId && <OrgDetailCard key={activeId} orgId={activeId} />}
    </div>
  );
}
