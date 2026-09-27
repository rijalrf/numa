import { api } from './http';

let isChecking = false;

export async function ensureDefaultToken(): Promise<string | null> {
  if (isChecking) return null;
  isChecking = true;
  try {
    const res = await api<{ tokens: Array<{ id: string; name: string; isRevoked: boolean }> }>(
      '/api/agent-tokens'
    );
    const activeTokens = (res.tokens || []).filter((t) => !t.isRevoked);
    if (activeTokens.length === 0) {
      const created = await api<{ token: string }>('/api/agent-tokens', {
        method: 'POST',
        body: JSON.stringify({ name: 'Token Default' }),
      });
      if (created.token) {
        localStorage.setItem('numa_active_pat', created.token);
        localStorage.setItem('numa_new_default_pat', created.token);
        return created.token;
      }
    }
  } catch (err) {
    // Abaikan jika user belum login atau sesi expired
  } finally {
    isChecking = false;
  }
  return null;
}
