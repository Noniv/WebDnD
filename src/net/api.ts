// Thin client for POST /api/room plus a persistent player identity.

export class NetError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function roomCall<T>(body: Record<string, unknown>, timeoutMs = 8000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch('/api/room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
  } catch {
    throw new NetError('Cannot reach the room server. Check your connection.', 0);
  } finally {
    clearTimeout(t);
  }
  let data: { error?: string; message?: string } & Record<string, unknown>;
  try {
    data = await res.json();
  } catch {
    throw new NetError(res.status === 404 ? 'This deployment has no room server (/api/room). Host it on Vercel to play co-op.' : `Room server error (${res.status}).`, res.status);
  }
  if (!res.ok) throw new NetError(data.message || data.error || `Room server error (${res.status}).`, res.status);
  return data as T;
}

const ID_KEY = 'emberdeep.player.v1';
export interface Identity { id: string; name: string }

export function identity(): Identity {
  try {
    const raw = localStorage.getItem(ID_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (v?.id) return v;
    }
  } catch { /* ignore */ }
  const v = { id: crypto.randomUUID(), name: '' };
  saveIdentity(v);
  return v;
}

export function saveIdentity(v: Identity): void {
  try { localStorage.setItem(ID_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

export function parseHash<T extends Record<string, string>>(o: T | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o ?? {})) {
    try { out[k] = JSON.parse(v); } catch { out[k] = v; }
  }
  return out;
}
