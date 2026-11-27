// Host side of co-op: the host's browser runs the game and streams it to guests over
// peer-to-peer links (events the moment they happen, snapshots a few times a second),
// receives intents, and routes prompts to whichever player controls the deciding hero.
import type { Creature } from '../rules/creature';
import type { GameState } from '../game/state';
import { Hud, type DockBtn, type SheetSpec, type SheetOption, type TalkAnswer } from '../ui/hud';
import { h } from '../ui/dom';
import { sfx } from '../ui/sfx';
import { Wire } from './p2p';
import type { DockSpec, IncomingIntent, Intent, NetEvent, OptSpec, PromptSpec, RoomInfo, RoomMeta, Snapshot, TalkVM, ViewModel, WireMsg } from './protocol';

const MAX_GUESTS = 3;
const SNAP_MS = 150;
const cleanName = (s: unknown) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 18) || 'Adventurer';

export class HostLink {
  code: string;
  me: string;
  /** Player id -> name, host included. */
  names: Record<string, string> = {};
  /** Seat index -> player id. */
  seats: Record<string, string> = {};
  meta: RoomMeta;
  vm: ViewModel = {
    mode: 'explore', leader: 0, leads: {}, turnId: null, chips: [], turnbar: null, order: null, dock: { for: null, buttons: [] },
    marks: {}, prompt: null, talk: null, end: null, owners: {}, names: {},
  };
  private wire: Wire | null = null;
  /** Connected peer id -> player id. */
  private peerPlayer = new Map<string, string>();
  private events: NetEvent[] = [];
  private flushQueued = false;
  private lastSnap = '';
  private timer = 0;
  getState: () => GameState | null = () => null;
  getMarks: () => ViewModel['marks'] = () => ({});
  onIntent: (i: IncomingIntent) => void = () => {};
  onPlayers: () => void = () => {};
  error = '';

  constructor(code: string, me: string, myName: string, meta: RoomMeta) {
    this.code = code;
    this.me = me;
    this.names[me] = myName;
    this.meta = meta;
  }

  start(): void {
    if (this.wire) return;
    const w = new Wire(this.code);
    this.wire = w;
    w.onJoin = (peer) => w.send({ t: 'hello', id: this.me, name: this.names[this.me], role: 'host' }, peer);
    w.onMsg = (m, peer) => this.receive(m, peer);
    w.onLeave = (peer) => {
      if (!this.peerPlayer.delete(peer)) return;
      this.broadcastRoom();
      this.onPlayers();
    };
    w.onError = (msg) => { this.error = msg; this.onPlayers(); };
    this.timer = window.setInterval(() => this.flush(), SNAP_MS);
  }

  stop(): void {
    clearInterval(this.timer);
    this.flush();
    this.wire?.leave();
    this.wire = null;
    this.peerPlayer.clear();
  }

  private receive(m: WireMsg, peer: string): void {
    if (m.t === 'hello' && m.role === 'guest' && typeof m.id === 'string') {
      const others = new Set([...this.peerPlayer.entries()].filter(([p]) => p !== peer).map(([, id]) => id));
      others.delete(m.id);
      if (others.size >= MAX_GUESTS) { this.wire?.send({ t: 'full' }, peer); return; }
      // Same player on a new connection (reload): forget the old one.
      for (const [p, id] of this.peerPlayer) if (id === m.id && p !== peer) this.peerPlayer.delete(p);
      this.peerPlayer.set(peer, m.id);
      this.names[m.id] = cleanName(m.name);
      this.broadcastRoom();
      this.sendSnap(peer);
      this.onPlayers();
      return;
    }
    if (m.t === 'intent') {
      const from = this.peerPlayer.get(peer);
      if (!from || !m.intent || typeof m.intent !== 'object') return;
      if (m.intent.type === 'seat') { this.guestSeat(from, m.intent); return; }
      this.onIntent({ ...m.intent, from, t: Date.now() });
    }
  }

  // ----- room / lobby -----

  room(): RoomInfo {
    return { meta: this.meta, names: this.names, seats: this.seats, online: this.onlineIds() };
  }

  onlineIds(): string[] {
    return [this.me, ...new Set(this.peerPlayer.values())];
  }

  private broadcastRoom(): void {
    this.wire?.send({ t: 'room', room: this.room() });
  }

  setMeta(patch: Partial<RoomMeta>): void {
    this.meta = { ...this.meta, ...patch };
    this.broadcastRoom();
  }

  /** The host seats anyone (or frees a seat with `pid` null). */
  setSeat(idx: number, pid: string | null): void {
    if (pid) this.seats[String(idx)] = pid;
    else delete this.seats[String(idx)];
    this.broadcastRoom();
    this.onPlayers();
  }

  private guestSeat(from: string, i: Extract<Intent, { type: 'seat' }>): void {
    if (!Number.isInteger(i.seat) || i.seat < 0 || i.seat > 3) return;
    const key = String(i.seat);
    const cur = this.seats[key];
    if (i.take && (!cur || cur === from)) this.seats[key] = from;
    else if (!i.take && cur === from) delete this.seats[key];
    this.broadcastRoom();
    this.onPlayers();
  }

  isOnline(id: string): boolean {
    if (id === this.me) return true;
    for (const v of this.peerPlayer.values()) if (v === id) return true;
    return false;
  }

  /** Hero id -> controlling player id (seat owner, else the host). */
  owners(party: Creature[]): Record<string, string> {
    const out: Record<string, string> = {};
    party.forEach((c, i) => { out[c.id] = this.seats[String(i)] ?? this.me; });
    return out;
  }

  // ----- game stream -----

  emit(ev: NetEvent): void {
    this.events.push(ev);
    if (this.flushQueued) return;
    this.flushQueued = true;
    queueMicrotask(() => this.flushEvents());
  }

  private flushEvents(): void {
    this.flushQueued = false;
    if (!this.events.length) return;
    const evs = this.events.splice(0);
    this.wire?.send({ t: 'evs', evs });
  }

  private snapshot(): { snap: Snapshot; key: string } | null {
    const state = this.getState();
    if (!state) return null;
    this.vm.marks = this.getMarks();
    this.vm.owners = this.owners(state.party);
    this.vm.names = this.names;
    const snap: Snapshot = { state: { ...state, log: [], areas: {}, memory: {} }, vm: this.vm };
    return { snap, key: JSON.stringify(snap) };
  }

  /** Send pending events, then the state if it changed (so a snapshot never runs ahead of its events). */
  flush(): void {
    this.flushEvents();
    if (!this.wire || !this.peerPlayer.size) return;
    const s = this.snapshot();
    if (!s || s.key === this.lastSnap) return;
    this.lastSnap = s.key;
    this.wire.send({ t: 'snap', snap: s.snap });
  }

  private sendSnap(peer: string): void {
    this.flushEvents();
    const s = this.snapshot();
    if (s) this.wire?.send({ t: 'snap', snap: s.snap }, peer);
  }
}

// ---------------------------------------------------------------------------

interface Pending { spec: PromptSpec; resolve: (index: number | null, actorId: string | null) => void }

/** The host's HUD: shows everything locally and mirrors it, routing prompts to their owner. */
export class HostHud extends Hud {
  link: HostLink;
  getParty: () => Creature[] = () => [];
  private pending = new Map<string, Pending>();
  private dockHandlers = new Map<string, () => void>();
  private waitEl: HTMLElement | null = null;

  constructor(link: HostLink) {
    super();
    this.link = link;
  }

  private remoteDecider(): string | null {
    const d = this.decider;
    if (!d || d === this.link.me || !this.link.isOnline(d)) return null;
    return d;
  }

  // ----- mirrored display -----

  override log(msg: string, tone = 'info'): void { super.log(msg, tone); this.link.emit({ k: 'log', msg, tone }); }
  override showBanner(title: string, text: string, ms = 4200): void { super.showBanner(title, text, ms); this.link.emit({ k: 'banner', title, text, ms }); }
  override toast(text: string): void { super.toast(text); this.link.emit({ k: 'toast', text }); }
  /** A message for one player only (e.g. why their tap did nothing). */
  toastTo(pid: string, text: string): void {
    if (pid === this.link.me) super.localToast(text);
    else this.link.emit({ k: 'toast', text, to: pid });
  }
  override setChips(list: { text: string; icon?: string; cls?: string; toast?: string }[]): void { super.setChips(list); this.link.vm.chips = list; }
  override setTurnbar(info: ViewModel['turnbar']): void { super.setTurnbar(info); this.link.vm.turnbar = info; }
  override setOrder(list: ViewModel['order']): void { super.setOrder(list); this.link.vm.order = list; }

  override renderParty(party: Creature[], activeIdx: number, turnId: string | null): void {
    const own = this.link.owners(party);
    this.owners = {};
    for (const c of party) {
      const pid = own[c.id];
      if (Object.keys(this.link.names).length > 1) this.owners[c.id] = { name: this.link.names[pid] ?? 'Host', me: pid === this.link.me };
    }
    super.renderParty(party, activeIdx, turnId);
    this.link.vm.leader = activeIdx;
    this.link.vm.turnId = turnId;
  }

  override setDock(btns: DockBtn[]): void {
    const owner = this.dockFor;
    this.dockHandlers.clear();
    const specs: DockSpec[] = btns.map((b) => {
      this.dockHandlers.set(b.id, b.onTap);
      const { onTap: _skip, ...spec } = b;
      void _skip;
      return spec;
    });
    this.link.vm.dock = { for: owner, buttons: specs };
    const mine = !owner || owner === 'all' || owner === this.link.me || !this.link.isOnline(owner);
    if (mine) {
      super.setDock(btns.map((b) => ({ ...b, onTap: () => { this.decider = this.link.me; b.onTap(); } })));
    } else {
      const name = this.link.names[owner] ?? 'Another player';
      super.setDock([{ id: 'wait', label: `${name}'s turn`, icon: 'end_turn', off: true, onTap: () => {} }]);
    }
  }

  /** A guest tapped a dock button. */
  dockTap(id: string, from: string): void {
    const owner = this.link.vm.dock.for;
    if (owner && owner !== 'all' && owner !== from) return;
    const fn = this.dockHandlers.get(id);
    if (!fn) return;
    this.decider = from;
    fn();
  }

  override panel(title: string, body: HTMLElement, center = false): Promise<void> {
    const lines = [...body.querySelectorAll('p')].map((p) => p.textContent ?? '').filter(Boolean);
    this.link.emit({ k: 'panel', title, lines: lines.length ? lines : [body.textContent ?? ''] });
    return super.panel(title, body, center);
  }

  override levelUp(reports: Parameters<Hud['levelUp']>[0]): Promise<void> {
    this.link.emit({ k: 'levelup', reports });
    return super.levelUp(reports);
  }

  override showCreature(c: Creature, extra: string[] = []): void {
    const to = this.remoteDecider();
    if (to) this.link.emit({ k: 'show', to, what: 'creature', id: c.id, extra });
    else super.showCreature(c, extra);
  }

  override showCharacter(c: Creature): void {
    const to = this.remoteDecider();
    if (to) this.link.emit({ k: 'show', to, what: 'character', id: c.id });
    else super.showCharacter(c);
  }

  override endScreen(opts: Parameters<Hud['endScreen']>[0]): () => void {
    this.link.vm.end = { title: opts.title, text: opts.text, lines: opts.lines ?? [], emblem: !!opts.emblem };
    this.link.vm.mode = 'end';
    return super.endScreen(opts);
  }

  // ----- AI conversations -----

  private talkRemote: ((a: TalkAnswer) => void) | null = null;

  override setTalk(vm: TalkVM | null, party: Creature[] = this.talkParty): void {
    this.link.vm.talk = vm;
    if (!vm) this.talkRemote = null;
    super.setTalk(vm, party);
  }

  protected override talkNames(): Record<string, string> { return this.link.names; }
  protected override isHost(): boolean { return true; }

  override talkAsk(vm: TalkVM, party: Creature[]): Promise<TalkAnswer> {
    const to = this.remoteDecider();
    vm.turn = to ?? this.link.me;
    if (!to) return super.talkAsk(vm, party);
    // A guest answers; the host sees it read-only, with "Answer for them".
    return new Promise((resolve) => {
      this.talkRemote = (a) => { this.talkRemote = null; this.talkWait = null; resolve(a); };
      this.setTalk(vm, party);
    });
  }

  protected override talkTakeOver(): void {
    const vm = this.talkVm;
    const done = this.talkRemote;
    if (!vm || !done) return;
    vm.turn = this.link.me;
    vm.ask++;
    this.talkWait = (a) => { this.talkWait = null; done(a); };
    this.setTalk(vm);
  }

  /** A guest spoke in a conversation. */
  sayFrom(i: Extract<Intent, { type: 'say' }>, from: string): void {
    const vm = this.talkVm;
    if (!vm || !this.talkRemote || vm.id !== i.talk || vm.ask !== i.ask || vm.turn !== from) return;
    this.talkRemote({ text: typeof i.text === 'string' ? i.text.slice(0, 240) : null, actorId: i.actorId });
  }

  // ----- prompts -----

  private toSpec<T>(id: string, to: string, kind: PromptSpec['kind'], title: string, options: SheetOption<T>[], extra: Partial<PromptSpec>): PromptSpec {
    const opts: OptSpec[] = options.map((o) => ({ label: o.label, sub: o.sub, icon: o.icon, primary: o.primary, disabled: o.disabled, odds: o.odds, tag: o.tag, check: o.check }));
    return { id, to, kind, title, options: opts, partyIds: [], ...extra };
  }

  private showWaiting(name: string, override: () => void): void {
    this.hideWaiting();
    this.waitEl = h('div', { class: 'waitbar' }, h('span', {}, `${name} is deciding…`),
      h('button', { class: 'chip', onclick: () => { sfx.ui(); override(); } }, 'Decide for them'));
    this.modal.append(this.waitEl);
  }
  private hideWaiting(): void { this.waitEl?.remove(); this.waitEl = null; }

  private ask(spec: PromptSpec, local: () => Promise<{ index: number | null; actorId: string | null }>): Promise<{ index: number | null; actorId: string | null }> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (index: number | null, actorId: string | null) => {
        if (done) return;
        done = true;
        this.pending.delete(spec.id);
        if (this.link.vm.prompt?.id === spec.id) this.link.vm.prompt = null;
        this.hideWaiting();
        this.dismissPrompts();
        resolve({ index, actorId });
      };
      this.pending.set(spec.id, { spec, resolve: finish });
      this.link.vm.prompt = spec;
      const name = this.link.names[spec.to] ?? 'Another player';
      const override = () => {
        this.link.vm.prompt = null;
        this.hideWaiting();
        this.dismissPrompts();
        void local().then((r) => finish(r.index, r.actorId));
      };
      if (spec.kind === 'sheet') this.showWaiting(name, override);
      else void this.readonlyDialogue(spec, name, override);
    });
  }

  private dialogueArgs: { speaker: PromptSpec['speaker']; text: string; options: SheetOption<unknown>[]; party: Creature[] } | null = null;

  private async readonlyDialogue(spec: PromptSpec, name: string, override: () => void): Promise<void> {
    const a = this.dialogueArgs;
    if (!a) return;
    await super.dialogue(a.speaker!, a.text, a.options, a.party, { readonly: `${name} is speaking for the party…`, override });
  }

  /** An answer arrived from a guest. */
  answer(pid: string, index: number | null, actorId: string | null, from: string): void {
    const p = this.pending.get(pid);
    if (!p || p.spec.to !== from) return;
    p.resolve(index, actorId);
  }

  override sheet<T>(spec: SheetSpec<T>): Promise<{ value: T; actor: Creature | null } | null> {
    const to = this.remoteDecider();
    if (!to) return super.sheet(spec);
    const party = spec.party ?? this.getParty();
    const ps = this.toSpec(crypto.randomUUID(), to, 'sheet', spec.title, spec.options, {
      lead: spec.lead, cancel: spec.cancel, actorId: spec.actorId, partyIds: (spec.party ?? []).map((c) => c.id),
    });
    return this.ask(ps, async () => {
      const r = await super.sheet(spec);
      return r ? { index: spec.options.findIndex((o) => o.value === r.value), actorId: r.actor?.id ?? null } : { index: null, actorId: null };
    }).then(({ index, actorId }) => {
      if (index === null || index < 0 || !spec.options[index] || spec.options[index].disabled) return null;
      return { value: spec.options[index].value, actor: party.find((c) => c.id === actorId) ?? null };
    });
  }

  override dialogue<T>(speaker: { name: string; portrait?: string; narrator: boolean }, text: string, options: SheetOption<T>[], party: Creature[],
    mode: { readonly?: string; override?: () => void } = {}): Promise<{ value: T; actor: Creature | null } | null> {
    const to = this.remoteDecider();
    if (mode.readonly) return super.dialogue(speaker, text, options, party, mode);
    if (!to) {
      // Decided on this device: everyone else watches the conversation read-only.
      const watch = this.toSpec(crypto.randomUUID(), this.link.me, 'dialogue', speaker.name, options, { speaker, lead: text, partyIds: party.map((c) => c.id) });
      this.link.vm.prompt = watch;
      return super.dialogue(speaker, text, options, party, mode).finally(() => {
        if (this.link.vm.prompt?.id === watch.id) this.link.vm.prompt = null;
      });
    }
    const ps = this.toSpec(crypto.randomUUID(), to, 'dialogue', speaker.name, options, { speaker, lead: text, partyIds: party.map((c) => c.id) });
    this.dialogueArgs = { speaker, text, options: options as SheetOption<unknown>[], party };
    return this.ask(ps, async () => {
      const r = await super.dialogue(speaker, text, options, party);
      return r ? { index: options.findIndex((o) => o.value === r.value), actorId: r.actor?.id ?? null } : { index: null, actorId: null };
    }).then(({ index, actorId }) => {
      const i = index === null || index < 0 ? 0 : index;
      return { value: options[i].value, actor: party.find((c) => c.id === actorId) ?? party.find((c) => c.hp > 0) ?? null };
    });
  }
}
