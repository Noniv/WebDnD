// Guest side of co-op: a peer-to-peer link to the host, plus the client that replays the
// host's events (dice, moves, effects) in order, renders the same map and HUD, and sends
// taps/choices back as intents.
import type { Application } from 'pixi.js';
import type { Creature } from '../rules/creature';
import { computeVisible } from '../game/grid';
import { invSummary, loadWorld, type GameState, type World } from '../game/state';
import type { DiceOverlay } from '../render/dice';
import { playFx, showDamage, showHeal } from '../render/fx';
import type { MapView } from '../render/view';
import { h } from '../ui/dom';
import { Hud, type SheetOption } from '../ui/hud';
import { sfx } from '../ui/sfx';
import type { Identity } from './identity';
import { Wire } from './p2p';
import type { Intent, NetEvent, PromptSpec, RoomInfo, Snapshot, WireMsg } from './protocol';

type QItem = { ev: NetEvent } | { snap: Snapshot };

/** A guest's connection to a room. Lives from the lobby through the game. */
export class GuestLink {
  readonly code: string;
  private me: Identity;
  private wire: Wire;
  private hostPeer: string | null = null;
  room: RoomInfo | null = null;
  full = false;
  onRoom: (r: RoomInfo) => void = () => {};
  onGame: (m: Extract<WireMsg, { t: 'evs' | 'snap' }>) => void = () => {};
  onHost: (present: boolean) => void = () => {};
  private waiters: (() => void)[] = [];

  constructor(code: string, me: Identity) {
    this.code = code;
    this.me = me;
    const w = new Wire(code);
    this.wire = w;
    w.onJoin = (peer) => w.send({ t: 'hello', id: me.id, name: me.name, role: 'guest' }, peer);
    w.onMsg = (m, peer) => {
      if (m.t === 'hello') {
        if (m.role === 'host') { this.hostPeer = peer; this.onHost(true); }
        return;
      }
      if (peer !== this.hostPeer) return; // only the host speaks for the room
      if (m.t === 'room') { this.room = m.room; this.onRoom(m.room); this.wake(); }
      else if (m.t === 'full') { this.full = true; this.wake(); }
      else if (m.t === 'evs' || m.t === 'snap') this.onGame(m);
    };
    w.onLeave = (peer) => { if (peer === this.hostPeer) { this.hostPeer = null; this.onHost(false); } };
  }

  get hostHere(): boolean { return this.hostPeer !== null; }
  get myId(): string { return this.me.id; }

  private wake(): void { this.waiters.splice(0).forEach((f) => f()); }

  /** Wait until the host has let us in (or said the room is full). */
  async connect(timeoutMs: number): Promise<'ok' | 'full' | 'timeout'> {
    if (!this.room && !this.full) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, timeoutMs);
        this.waiters.push(() => { clearTimeout(t); resolve(); });
      });
    }
    return this.full ? 'full' : this.room ? 'ok' : 'timeout';
  }

  /** Returns false when the host isn't connected right now. */
  send(intent: Intent): boolean {
    if (!this.hostPeer) return false;
    this.wire.send({ t: 'intent', intent }, this.hostPeer);
    return true;
  }

  leave(): void {
    this.onRoom = () => {};
    this.onGame = () => {};
    this.onHost = () => {};
    this.wire.leave();
  }
}

export class GuestClient {
  private view: MapView;
  private dice: DiceOverlay;
  private link: GuestLink;
  private me: Identity;
  private hud = new Hud();
  private world: World | null = null;
  private snap: Snapshot | null = null;
  private queue: QItem[] = [];
  private pumping = false;
  private running = false;
  private shownPrompt: string | null = null;
  private endShown = false;
  private awayTimer = 0;
  private lastFocus = '';
  private onLeave: () => void;
  private onLobby: () => void;

  constructor(app: Application, view: MapView, dice: DiceOverlay, link: GuestLink, me: Identity, onLeave: () => void, onLobby: () => void) {
    this.onLobby = onLobby;
    void app;
    this.view = view;
    this.dice = dice;
    this.link = link;
    this.me = me;
    this.onLeave = onLeave;
    view.smoothMoves = true;
    view.onTap = (p) => this.tap(p);
    this.hud.onSelect = (i) => this.selectHero(i);
    this.hud.onSheet = (c) => this.hud.showCharacter(c);
    this.hud.log(`Joined room ${link.code}. Waiting for the host…`);
    this.hud.setDock([{ id: 'wait', label: 'Connecting…', icon: 'end_turn', off: true, onTap: () => {} }]);
  }

  start(): void {
    this.running = true;
    const l = this.link;
    l.onGame = (m) => {
      if (!this.running) return;
      // Events that arrive before the first snapshot are already part of it.
      if (m.t === 'evs') { if (this.world || this.queue.some((q) => 'snap' in q)) for (const ev of m.evs) this.queue.push({ ev }); }
      else this.queue.push({ snap: m.snap });
      void this.pump();
    };
    l.onRoom = (r) => this.roomChanged(r);
    l.onHost = (here) => {
      clearTimeout(this.awayTimer);
      if (here) { this.hud.localToast('The host is back.'); return; }
      // Brief drops (the host's phone locking) are common: only say so if it lasts.
      this.awayTimer = window.setTimeout(() => {
        if (this.running && !this.link.hostHere) this.hud.showBanner('The host is away', 'Waiting for them to come back. The game resumes on its own.', 6000);
      }, 4000);
    };
    if (l.room) this.roomChanged(l.room);
  }

  destroy(): void {
    this.running = false;
    clearTimeout(this.awayTimer);
    this.link.onGame = () => {};
    this.link.onRoom = () => {};
    this.link.onHost = () => {};
    this.hud.destroy();
    this.view.smoothMoves = false;
  }

  private roomChanged(r: RoomInfo): void {
    if (!this.running) return;
    if (r.meta.status === 'ended') this.ended('The host ended the session.');
    else if (r.meta.status === 'lobby') { this.running = false; this.onLobby(); }
  }

  private send(intent: Intent): void {
    if (!this.link.send(intent)) this.hud.localToast('Not connected to the host right now. Try again in a moment.');
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length) {
        const item = this.queue.shift()!;
        // Fall behind? Speed through animations instead of lagging the table.
        const behind = this.queue.length > 8;
        this.dice.fast = behind;
        try {
          if ('snap' in item) this.apply(item.snap);
          else if (this.world) await this.play(item.ev, behind);
        } catch (err) {
          console.warn('replay error', err);
        }
      }
    } finally { this.pumping = false; }
  }

  private byId(id: string): Creature | undefined {
    const s = this.world?.state;
    return s?.party.find((c) => c.id === id) ?? s?.monsters.find((c) => c.id === id);
  }

  private async play(ev: NetEvent, behind: boolean): Promise<void> {
    switch (ev.k) {
      case 'roll': if (!behind) await this.dice.show(ev.r, ev.note); break;
      case 'rolls': if (!behind) await this.dice.showMany(ev.rs, ev.title); break;
      case 'damage': { const c = this.byId(ev.id); if (c) showDamage(this.view, c, ev.amount, ev.crit, ev.note); break; }
      case 'heal': { const c = this.byId(ev.id); if (c) showHeal(this.view, c, ev.amount); break; }
      case 'float': this.view.floatText(ev.at, ev.text, ev.color); break;
      case 'log': this.hud.log(ev.msg, ev.tone); break;
      case 'move': {
        const c = this.byId(ev.id);
        if (c) { await this.view.moveToken(c, ev.path, behind ? 30 : ev.ms); c.pos = { ...ev.path[ev.path.length - 1] }; }
        break;
      }
      case 'group': {
        const steps = ev.steps.map((s) => ({ c: this.byId(s.id)!, to: s.to })).filter((s) => s.c);
        await this.view.moveGroup(steps, behind ? 30 : ev.ms);
        for (const s of steps) s.c.pos = { ...s.to };
        // The camera follows my own heroes, not everyone else's walks.
        if (steps[0] && this.view.following && this.myHeroes().some((c) => c.id === steps[0].c.id)) this.view.focus(steps[0].to);
        this.refreshFog();
        break;
      }
      case 'fx': if (!behind) await playFx(this.view, ev.kind, ev.from, ev.to); break;
      case 'shake': this.view.shake(ev.n); break;
      case 'banner': this.hud.showBanner(ev.title, ev.text, ev.ms); break;
      case 'toast': if (!ev.to || ev.to === this.me.id) this.hud.localToast(ev.text); break;
      case 'panel': {
        const body = h('div', {}, ...ev.lines.map((l) => h('p', { class: 'feat' }, l)));
        void this.hud.openPanel(ev.title, body, true);
        break;
      }
      case 'levelup': void this.hud.levelUp(ev.reports); break;
      case 'show': {
        if (ev.to !== this.me.id) break;
        const c = this.byId(ev.id);
        if (c && ev.what === 'creature') this.hud.showCreature(c, ev.extra ?? []);
        if (c && ev.what === 'character') this.hud.showCharacter(c);
        break;
      }
    }
  }

  // ---------- Snapshot ----------

  private apply(snap: Snapshot): void {
    const first = !this.world;
    const state = snap.state as GameState;
    if (!this.world) {
      this.world = loadWorld(state);
      this.view.build(this.world);
    } else {
      this.world.state = state;
      this.world.def.objects = state.objects;
    }
    this.snap = snap;
    this.refreshFog();
    this.view.syncProps();
    this.view.syncTokens();
    this.render(first);
  }

  private refreshFog(): void {
    if (!this.world) return;
    const vis = computeVisible(this.world);
    const seen = this.world.state.seen;
    for (let i = 0; i < vis.length; i++) if (vis[i]) seen[i] = 1;
    this.view.updateFog(vis, seen);
  }

  private myHeroes(): Creature[] {
    const s = this.snap;
    if (!s) return [];
    return s.state.party.filter((c) => s.vm.owners[c.id] === this.me.id);
  }

  private render(first: boolean): void {
    const s = this.snap!;
    const { vm, state } = s;
    const multi = Object.keys(vm.names).length > 1;
    this.hud.owners = {};
    if (multi) for (const c of state.party) { const pid = vm.owners[c.id]; this.hud.owners[c.id] = { name: vm.names[pid] ?? 'Host', me: pid === this.me.id }; }
    // While exploring, highlight the hero I lead (every player moves their own heroes).
    const myLead = vm.leads?.[this.me.id] ?? state.party.findIndex((c) => vm.owners[c.id] === this.me.id);
    const shownLead = vm.mode === 'explore' && myLead >= 0 ? myLead : vm.leader;
    this.hud.renderParty(state.party, shownLead, vm.turnId);
    this.hud.setChips(vm.chips);
    this.hud.setTurnbar(vm.turnbar);
    this.hud.setOrder(vm.order ?? null);
    this.view.insets = this.hud.insets();
    this.view.applyMarks(vm.marks);
    const activeId = vm.turnId ?? state.party[shownLead]?.id ?? null;
    this.view.setActive(activeId);

    // Dock
    const mine = vm.dock.for === 'all' || vm.dock.for === this.me.id;
    if (vm.mode === 'end') this.hud.setDock([]);
    else if (mine && vm.dock.buttons.length) {
      this.hud.setDock(vm.dock.buttons.map((b) => ({ ...b, onTap: () => (b.id === 'menu' ? void this.menu() : this.send({ type: 'dock', id: b.id })) })));
    } else {
      const who = vm.dock.for ? vm.names[vm.dock.for] ?? 'Another player' : null;
      const turnHero = state.party.find((c) => c.id === vm.turnId);
      const label = vm.mode === 'combat' ? (turnHero ? `${who ?? 'Host'}'s turn` : 'Enemies act…') : 'Waiting…';
      this.hud.setDock([
        { id: 'wait', label, icon: 'end_turn', off: true, onTap: () => {} },
        { id: 'menu', label: 'Menu', icon: 'menu', onTap: () => void this.menu() },
      ]);
    }

    // Camera: whoever acts in combat, otherwise the hero I lead.
    const focusId = vm.turnId ?? state.party[shownLead]?.id;
    const focusC = state.party.find((c) => c.id === focusId) ?? state.monsters.find((c) => c.id === focusId);
    const key = `${vm.mode}:${focusId}`;
    if (focusC && (first || key !== this.lastFocus || this.view.following)) { this.lastFocus = key; this.view.focus(focusC.pos, first); }
    if (first) this.hud.showBanner('You joined the delve', this.myHeroes().length ? `You play ${this.myHeroes().map((c) => c.name).join(' & ')}.` : 'You are watching. Take a hero in the lobby next time.', 5000);

    // Prompts
    const p = vm.prompt;
    if (this.shownPrompt && (!p || p.id !== this.shownPrompt)) { this.hud.dismissPrompts(); this.shownPrompt = null; }
    if (p && p.id !== this.shownPrompt) {
      this.shownPrompt = p.id;
      if (p.to === this.me.id) void this.answerPrompt(p);
      else if (p.kind === 'dialogue') void this.watchDialogue(p);
    }

    // End
    if (vm.end && !this.endShown) {
      this.endShown = true;
      this.hud.endScreen({ ...vm.end, buttons: [{ label: 'Back to title', primary: true, onTap: () => this.onLeave() }] });
    }
  }

  private partyFor(p: PromptSpec): Creature[] {
    const st = this.snap?.state;
    return p.partyIds.map((id) => st?.party.find((c) => c.id === id)).filter((c): c is Creature => !!c);
  }

  private async answerPrompt(p: PromptSpec): Promise<void> {
    sfx.ui();
    const options: SheetOption<number>[] = p.options.map((o, i) => ({ ...o, value: i }));
    const party = this.partyFor(p);
    let index: number | null = null;
    let actorId: string | null = null;
    if (p.kind === 'dialogue') {
      const r = await this.hud.dialogue(p.speaker ?? { name: p.title, narrator: false }, p.lead ?? '', options, party);
      if (!r) return; // dismissed (host decided instead)
      index = r.value; actorId = r.actor?.id ?? null;
    } else {
      const r = await this.hud.sheet<number>({ title: p.title, lead: p.lead, cancel: p.cancel, actorId: p.actorId, party: party.length ? party : undefined, options });
      if (r === null && this.shownPrompt !== p.id) return; // dismissed
      index = r ? r.value : null; actorId = r?.actor?.id ?? null;
    }
    this.send({ type: 'answer', pid: p.id, index, actorId });
  }

  private async watchDialogue(p: PromptSpec): Promise<void> {
    const name = this.snap?.vm.names[p.to] ?? 'Another player';
    const options: SheetOption<number>[] = p.options.map((o, i) => ({ ...o, value: i }));
    await this.hud.dialogue(p.speaker ?? { name: p.title, narrator: false }, p.lead ?? '', options, this.partyFor(p), { readonly: `${name} is speaking for the party…` });
  }

  // ---------- Input ----------

  private tap(p: { x: number; y: number }): void {
    const vm = this.snap?.vm;
    if (!vm || vm.mode === 'end') return;
    if (vm.mode === 'combat' && vm.dock.for !== this.me.id) {
      const hero = this.snap!.state.party.find((c) => c.id === vm.turnId);
      this.hud.localToast(hero ? `${hero.name}'s turn` : 'Enemies are acting');
      sfx.deny();
      return;
    }
    this.view.floatText(p, '•', 0xf2a65a);
    this.send({ type: 'tap', x: p.x, y: p.y });
  }

  private selectHero(i: number): void {
    const s = this.snap;
    if (!s) return;
    const c = s.state.party[i];
    if (s.vm.owners[c.id] === this.me.id && s.vm.mode === 'explore') this.send({ type: 'leader', idx: i });
    else this.hud.showCharacter(c);
  }

  private async menu(): Promise<void> {
    const r = await this.hud.sheet<string>({
      title: `Room ${this.link.code}`, options: [
        { label: 'Inventory', sub: this.snap ? invSummary(this.snap.state.inv) : undefined, value: 'inv', icon: 'potion' },
        { label: 'Journal', value: 'log', icon: 'sheet' },
        { label: 'My hero sheet', value: 'sheet', icon: 'sheet', disabled: this.myHeroes().length ? undefined : 'You are watching' },
        { label: 'Leave the room', sub: 'You can rejoin with the same code.', value: 'leave', icon: 'close' },
      ],
    });
    if (!r) return;
    if (r.value === 'inv' && this.snap) this.hud.showInventory(this.snap.state.inv);
    if (r.value === 'log') this.hud.showLog();
    if (r.value === 'sheet') this.hud.showCharacter(this.myHeroes()[0]);
    if (r.value === 'leave') this.onLeave();
  }

  private ended(msg: string): void {
    if (this.endShown) return;
    this.endShown = true;
    this.running = false;
    this.hud.endScreen({ title: 'Session over', text: msg, buttons: [{ label: 'Back to title', primary: true, onTap: () => this.onLeave() }] });
  }
}
