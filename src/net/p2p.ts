// Peer-to-peer transport for co-op (WebRTC via trystero). Browsers find each other
// through public Nostr relays using only the 4-letter room code, then talk directly:
// no game server and no database. Optional TURN (for strict mobile networks) comes
// from VITE_TURN_URLS / VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL at build time.
import { joinRoom, type Room } from 'trystero';
import type { WireMsg } from './protocol';

const APP_ID = 'emberdeep-5e-coop-v1';

function turnConfig(): { urls: string[]; username?: string; credential?: string }[] | undefined {
  const urls = String(import.meta.env.VITE_TURN_URLS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!urls.length) return undefined;
  return [{ urls, username: import.meta.env.VITE_TURN_USERNAME || undefined, credential: import.meta.env.VITE_TURN_CREDENTIAL || undefined }];
}

/** `s`: the sender's session with this peer, `n`: its message number within that session. */
type Envelope = { s: string; n: number; m: WireMsg };

/**
 * One room connection. Each sender numbers its messages per receiving peer, and the
 * receiver hands them to `onMsg` strictly in that order (trystero may let a small
 * message overtake a large one). A new session id (after a reconnect) restarts the count.
 */
export class Wire {
  private room: Room;
  private sendRaw: (data: string, opts?: { target?: string | string[] | null }) => Promise<void>;
  private out = new Map<string, { s: string; n: number }>();
  private inbox = new Map<string, { s: string; next: number; held: Map<number, WireMsg> }>();
  onMsg: (msg: WireMsg, peer: string) => void = () => {};
  onJoin: (peer: string) => void = () => {};
  onLeave: (peer: string) => void = () => {};
  onError: (message: string) => void = () => {};

  constructor(code: string) {
    this.room = joinRoom({ appId: APP_ID, identity: 'none', password: `ed-${code}`, turnConfig: turnConfig() }, `room-${code}`);
    const act = this.room.makeAction<string>('m');
    this.sendRaw = (data, opts) => act.send(data, opts);
    act.onMessage((data, ctx) => this.receive(data, ctx.peerId));
    this.room.onPeerJoin(({ peerId }) => {
      this.out.set(peerId, { s: crypto.randomUUID().slice(0, 8), n: 0 });
      this.onJoin(peerId);
    });
    this.room.onPeerLeave(({ peerId }) => { this.out.delete(peerId); this.inbox.delete(peerId); this.onLeave(peerId); });
    this.room.onError((e) => this.onError(e.message));
  }

  /** Send to one peer, or to everyone when `to` is omitted. */
  send(m: WireMsg, to?: string): void {
    for (const peer of to ? [to] : this.peers()) {
      let o = this.out.get(peer);
      if (!o) { o = { s: crypto.randomUUID().slice(0, 8), n: 0 }; this.out.set(peer, o); }
      const env: Envelope = { s: o.s, n: o.n++, m };
      void this.sendRaw(JSON.stringify(env), { target: peer }).catch(() => { /* peer gone; it resyncs on rejoin */ });
    }
  }

  peers(): string[] {
    return Object.keys(this.room.getPeers());
  }

  leave(): void {
    void this.room.leave().catch(() => {});
  }

  private receive(data: string, peer: string): void {
    let env: Envelope;
    try { env = JSON.parse(data) as Envelope; } catch { return; }
    if (typeof env?.n !== 'number' || typeof env.s !== 'string' || !env.m) return;
    let box = this.inbox.get(peer);
    if (!box || box.s !== env.s) { box = { s: env.s, next: 0, held: new Map() }; this.inbox.set(peer, box); }
    if (env.n < box.next) return; // duplicate
    box.held.set(env.n, env.m);
    while (box.held.has(box.next)) {
      const m = box.held.get(box.next)!;
      box.held.delete(box.next);
      box.next++;
      try { this.onMsg(m, peer); } catch (err) { console.warn('co-op message failed', err); }
    }
  }
}

/** Room codes: 4 letters that are easy to read aloud (no B/8, G/6, I/1, O/0, Q, S/5, Z/2). */
export const CODE_LETTERS = 'ACDEFHJKLMNPRTUVWXY';
export function newRoomCode(): string {
  let c = '';
  const r = crypto.getRandomValues(new Uint32Array(4));
  for (let i = 0; i < 4; i++) c += CODE_LETTERS[r[i] % CODE_LETTERS.length];
  return c;
}
