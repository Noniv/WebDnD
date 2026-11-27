// A persistent player identity (random id + display name), kept in localStorage so a
// reload or rejoin is recognised as the same player.

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
