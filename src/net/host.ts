// Host side of co-op: publishes snapshots + events, receives intents, and routes
// prompts to whichever player controls the hero that has to decide.
import type { Creature } from '../rules/creature';
import type { GameState } from '../game/state';
import { Hud, type DockBtn, type SheetSpec, type SheetOption } from '../ui/hud';
import { h } from '../ui/dom';
import { sfx } from '../ui/sfx';
import { roomCall } from './api';
import type { DockSpec, IncomingIntent, NetEvent, OptSpec, PromptSpec, RoomMeta, ViewModel } from './protocol';

const ONLINE_MS = 15000;

export class HostLink {
  code: string;
  hostKey: string;
  me: string;
  names: Record<string, string> = {};
  seats: Record<string, string> = {};
  seen: Record<string, number> = {};
  meta: RoomMeta;
  vm: ViewModel = {
    mode: 'explore', leader: 0, turnId: null, chips: [], turnbar: null, order: null, dock: { for: null, buttons: [] },
    marks: {}, prompt: null, end: null, owners: {}, names: {},
  };
  private events: NetEvent[] = [];
  private lastSent = '';
  private timer = 0;
  private running = false;
  private metaDirty = true;
  getState: () => GameState | null = () => null;
  getMarks: () => ViewModel['marks'] = () => ({});
  onIntent: (i: IncomingIntent) => void = () => {};
  onPlayers: () => void = () => {};
  error = '';

  constructor(code: string, hostKey: string, me: string, meta: RoomMeta) {
    this.code = code;
    this.hostKey = hostKey;
    this.me = me;
    this.meta = meta;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = async () => {
      if (!this.running) return;
      try { await this.sync(); this.error = ''; } catch (e) { this.error = String((e as Error).message ?? e); }
      this.timer = window.setTimeout(loop, document.hidden ? 4000 : 700);
    };
    void loop();
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.timer);
  }

  emit(ev: NetEvent): void {
    this.events.push(ev);
    if (this.events.length > 600) this.events.splice(0, this.events.length - 600);
  }

  setMeta(patch: Partial<RoomMeta>): void {
    this.meta = { ...this.meta, ...patch };
    this.metaDirty = true;
  }

  isOnline(id: string): boolean {
    if (id === this.me) return true;
    return Date.now() - (this.seen[id] ?? 0) < ONLINE_MS;
  }

  /** Hero id -> controlling player id (seat owner, else the host). */
  owners(party: Creature[]): Record<string, string> {
    const out: Record<string, string> = {};
    party.forEach((c, i) => { out[c.id] = this.seats[String(i)] ?? this.me; });
    return out;
  }

  async sync(): Promise<void> {
    const state = this.getState();
    let stateOut: unknown;
    if (state) {
      this.vm.marks = this.getMarks();
      this.vm.owners = this.owners(state.party);
      this.vm.names = this.names;
      const snap = JSON.stringify({ state: { ...state, log: [] }, vm: this.vm });
      if (snap !== this.lastSent) { stateOut = JSON.parse(snap); this.lastSent = snap; }
    }
    const events = this.events.splice(0, 400);
    const r = await roomCall<{
      intents: IncomingIntent[]; players: Record<string, string>; seats: Record<string, string>; seen: Record<string, string>; now: number;
    }>({
      op: 'host', code: this.code, hostKey: this.hostKey, playerId: this.me,
      meta: this.metaDirty ? this.meta : undefined, state: stateOut, events,
    }).catch((e) => { this.events.unshift(...events); if (stateOut) this.lastSent = ''; throw e; });
    this.metaDirty = false;
    const skew = Date.now() - r.now;
    const names: Record<string, string> = {};
    for (const [id, v] of Object.entries(r.players)) { try { names[id] = JSON.parse(v).name; } catch { names[id] = '?'; } }
    const seen: Record<string, number> = {};
    for (const [id, t] of Object.entries(r.seen)) seen[id] = Number(t) + skew;
    const changed = JSON.stringify([names, r.seats]) !== JSON.stringify([this.names, this.seats]);
    this.names = names;
    this.seats = r.seats;
    this.seen = seen;
    if (changed) this.onPlayers();
    for (const i of r.intents) this.onIntent(i);
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
    if (!to || mode.readonly) return super.dialogue(speaker, text, options, party, mode);
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
