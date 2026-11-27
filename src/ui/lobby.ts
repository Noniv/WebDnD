// Co-op screens: "Host or join", then a lobby that reads at a glance:
// a big room code, who is here, and who plays which hero.
import { CLASSES, SPECIES } from '../rules/content';
import type { CharacterBuild } from '../rules/creature';
import { clear, h, layer, token } from './dom';
import { sfx } from './sfx';

const LETTERS = 'ACDEFHJKLMNPRTUVWXY';

export interface CoopStartActions {
  onHost: (name: string) => Promise<string | null>;
  onJoin: (code: string, name: string) => Promise<string | null>;
  onBack: () => void;
}

/** Host a room or join one. Returns a close function. */
export function showCoopStart(name: string, prefillCode: string, a: CoopStartActions): () => void {
  const root = layer();
  const err = h('p', { class: 'lobby-err', role: 'alert' });
  const nameIn = h('input', { class: 'name-input', value: name, maxlength: 18, placeholder: 'Your name', 'aria-label': 'Your name', autocomplete: 'nickname' }) as HTMLInputElement;
  const codeIn = h('input', {
    class: 'code-input', value: prefillCode, maxlength: 4, placeholder: '····', 'aria-label': 'Room code',
    autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', inputmode: 'text',
  }) as HTMLInputElement;
  codeIn.addEventListener('input', () => {
    codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    err.textContent = '';
  });
  const busy = (b: boolean) => root.querySelectorAll('button').forEach((x) => ((x as HTMLButtonElement).disabled = b));
  const needName = () => {
    const n = nameIn.value.trim();
    if (!n) { err.textContent = 'Pick a name so your friends know who is who.'; nameIn.focus(); sfx.deny(); return null; }
    return n;
  };
  const host = async () => {
    const n = needName(); if (!n) return;
    busy(true); err.textContent = 'Opening a room…';
    const e = await a.onHost(n);
    busy(false); err.textContent = e ?? '';
  };
  const join = async () => {
    const n = needName(); if (!n) return;
    const c = codeIn.value.trim().toUpperCase();
    if (c.length !== 4) { err.textContent = 'Room codes are 4 letters, like KFTR.'; codeIn.focus(); sfx.deny(); return; }
    if ([...c].some((ch) => !LETTERS.includes(ch))) { err.textContent = `"${c}" can't be a room code: codes never use B, G, I, O, Q, S or Z.`; sfx.deny(); return; }
    busy(true); err.textContent = 'Joining…';
    const e = await a.onJoin(c, n);
    busy(false); err.textContent = e ?? '';
  };
  codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') void join(); });

  root.append(h('div', { class: 'lobby' },
    h('header', {}, h('button', { class: 'btn ghost', 'aria-label': 'Back', onclick: () => { sfx.ui(); a.onBack(); } }, '←'), h('h2', {}, 'Play together')),
    h('div', { class: 'card parchment torn' }, h('h3', {}, 'Your name'), nameIn,
      h('p', { class: 'hint' }, '1 to 4 players. Everyone plays on their own phone or computer. The host\'s device runs the game.')),
    h('div', { class: 'card parchment torn' }, h('h3', {}, 'Start a room'),
      h('p', { class: 'hint', style: 'margin:0 0 10px' }, 'You get a 4-letter code to share. You build the party and press Start.'),
      h('button', { class: 'btn primary', style: 'width:100%', onclick: () => { sfx.ui(); void host(); } }, 'Host a new room')),
    h('div', { class: 'card parchment torn' }, h('h3', {}, 'Join a friend'),
      h('div', { class: 'row', style: 'gap:10px' }, codeIn, h('button', { class: 'btn', onclick: () => { sfx.ui(); void join(); } }, 'Join')),
      h('p', { class: 'hint' }, 'Ask the host for their room code, or open the invite link they sent.')),
    err,
  ));
  (prefillCode ? (name ? codeIn : nameIn) : nameIn).focus();
  return () => root.remove();
}

// ---------------------------------------------------------------------------

export interface LobbyPlayer { id: string; name: string; host: boolean; online: boolean }
export interface LobbyData { players: LobbyPlayer[]; seats: Record<string, string>; builds: CharacterBuild[] | null; error?: string }

export interface LobbyOptions {
  code: string;
  me: string;
  isHost: boolean;
  onSeat: (idx: number, take: boolean) => void;
  onCustomize: (idx: number) => void;
  onEditParty?: () => void;
  onStart?: () => void;
  onLeave: () => void;
}

export class LobbyView {
  private root = layer();
  private body = h('div', { class: 'lobby' });
  private o: LobbyOptions;
  private data: LobbyData = { players: [], seats: {}, builds: null };

  constructor(o: LobbyOptions) {
    this.o = o;
    this.root.append(this.body);
    this.render();
  }

  destroy(): void { this.root.remove(); }

  update(d: LobbyData): void {
    const key = JSON.stringify(d);
    if (key === JSON.stringify(this.data)) return;
    this.data = d;
    this.render();
  }

  private link(): string {
    return `${location.origin}${location.pathname}?join=${this.o.code}`;
  }

  private render(): void {
    const { o, data } = this;
    clear(this.body);
    const hostP = data.players.find((p) => p.host);
    const nameOf = (id: string | undefined) => data.players.find((p) => p.id === id)?.name ?? '…';

    // Room code
    const copyBtn = h('button', { class: 'btn', onclick: async () => {
      sfx.ui();
      try { await navigator.clipboard.writeText(this.link()); copyBtn.textContent = 'Link copied!'; } catch { copyBtn.textContent = this.link(); }
      setTimeout(() => (copyBtn.textContent = 'Copy invite link'), 1800);
    } }, 'Copy invite link');
    const shareBtn = 'share' in navigator ? h('button', { class: 'btn ghost dark', onclick: () => {
      sfx.ui();
      void navigator.share({ title: 'Emberdeep', text: `Join my Emberdeep delve! Room ${o.code}`, url: this.link() }).catch(() => {});
    } }, 'Share…') : null;
    this.body.append(
      h('header', {}, h('button', { class: 'btn ghost', 'aria-label': 'Leave', onclick: () => { sfx.ui(); o.onLeave(); } }, '←'), h('h2', {}, o.isHost ? 'Your room' : 'Lobby')),
      h('div', { class: 'card parchment torn roomcard' },
        h('div', { class: 'k' }, 'Room code'),
        h('div', { class: 'code', 'aria-label': `Room code ${o.code.split('').join(' ')}` }, ...o.code.split('').map((c) => h('span', {}, c))),
        h('div', { class: 'row', style: 'gap:8px;justify-content:center;flex-wrap:wrap' }, copyBtn, shareBtn),
        h('p', { class: 'hint', style: 'text-align:center' }, o.isHost ? 'Friends tap "Play together → Join a friend" and type this code, or open your invite link.' : `You're in ${hostP?.name ?? 'the host'}'s room.`),
      ),
    );

    // Players
    const plist = h('div', { class: 'plist' }, ...data.players.map((p) => h('div', { class: `pl ${p.online ? 'on' : ''}` },
      h('i', { class: 'dot', title: p.online ? 'online' : 'offline' }),
      h('b', {}, p.name), p.id === o.me ? h('span', { class: 'tagk' }, 'you') : null, p.host ? h('span', { class: 'tagk host' }, 'host') : null,
      h('small', {}, p.online ? 'online' : 'away'))));
    this.body.append(h('div', { class: 'card parchment torn' }, h('h3', {}, `Players · ${data.players.length}/4`), plist,
      data.players.length < 4 ? h('p', { class: 'hint' }, `${4 - data.players.length} more can join.`) : h('p', { class: 'hint' }, 'The room is full.')));

    // Heroes
    const heroes = h('div', { class: 'seats' });
    const builds = data.builds ?? [];
    builds.forEach((b, i) => {
      const owner = data.seats[String(i)];
      const mine = owner === o.me;
      const free = !owner;
      const who = owner ? nameOf(owner) : `${hostP?.name ?? 'Host'} (unclaimed)`;
      const btns: (HTMLElement | null)[] = [];
      if (free) btns.push(h('button', { class: 'btn primary small', onclick: () => { sfx.ui(); o.onSeat(i, true); } }, 'Play this hero'));
      if (mine) {
        btns.push(h('button', { class: 'btn small', onclick: () => { sfx.ui(); o.onCustomize(i); } }, 'Customize'));
        btns.push(h('button', { class: 'btn ghost dark small', onclick: () => { sfx.ui(); o.onSeat(i, false); } }, 'Give up'));
      } else if (owner && o.isHost) btns.push(h('button', { class: 'btn ghost dark small', onclick: () => { sfx.ui(); o.onSeat(i, false); } }, 'Free seat'));
      heroes.append(h('div', { class: `seat ${mine ? 'mine' : ''} ${free ? 'free' : ''}` },
        token(b.classId, 'stok'),
        h('div', { class: 'sinfo' },
          h('b', {}, b.name || CLASSES[b.classId].name),
          h('small', {}, `${SPECIES[b.species].name} ${CLASSES[b.classId].name} · ${CLASSES[b.classId].role}`),
          h('span', { class: `who ${mine ? 'me' : ''}` }, mine ? 'You play this hero' : `Played by ${who}`)),
        h('div', { class: 'sbtns' }, ...btns)));
    });
    this.body.append(h('div', { class: 'card parchment torn' },
      h('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:6px' }, h('h3', { style: 'margin:0' }, 'Heroes'),
        o.isHost && o.onEditParty ? h('button', { class: 'chip', onclick: () => { sfx.ui(); o.onEditParty!(); } }, 'Edit party') : null),
      h('p', { class: 'hint', style: 'margin:0 0 8px' }, 'Each player takes a hero. Heroes nobody takes are played by the host. You can play more than one.'),
      heroes));

    if (data.error) this.body.append(h('p', { class: 'lobby-err' }, data.error));
    this.body.append(h('div', { class: 'lobby-foot' }, o.isHost
      ? h('button', { class: 'btn primary', style: 'width:100%', onclick: () => { sfx.success(); o.onStart?.(); } }, `Start the delve · ${data.players.length} player${data.players.length > 1 ? 's' : ''}`)
      : h('p', { class: 'waiting' }, `Waiting for ${hostP?.name ?? 'the host'} to start…`)));
  }
}
