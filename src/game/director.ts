// The Director stands in for the DM: it runs exploration, rooms, traps, dialogue and rests,
// hands fights to the combat engine, and drives the map view and HUD.
import type { Application } from 'pixi.js';
import { CONFIG } from '../config';
import { abilityCheck, chance, savingThrow, type TestResult } from '../rules/checks';
import { CLASSES } from '../rules/content';
import {
  armorClass, canAct, checkBonus, levelForXp, levelUp, longRest, mod, passive, prof, shortRestRecover, spellAttack, spellDC,
  weaponDamageExpr, weaponToHit, type Creature,
} from '../rules/creature';
import { die, fmtMod, rollExpr } from '../rules/dice';
import { MONSTERS } from '../rules/monsters';
import { SPELLS, type SpellDef } from '../rules/spells';
import type { CheckKind, Pos } from '../rules/types';
import { DiceOverlay } from '../render/dice';
import { PAL } from '../render/textures';
import { wait } from '../render/tween';
import type { MapView } from '../render/view';
import { Hud, type DockBtn, type SheetOption } from '../ui/hud';
import { HostHud, type HostLink } from '../net/host';
import type { IncomingIntent, NetEvent } from '../net/protocol';
import { playFx, showDamage, showHeal } from '../render/fx';
import { sfx } from '../ui/sfx';
import { Combat } from './combat';
import { SNIKK, type DCtx, type DialogueEnd, type DOption } from './dialogue';
import { inRect, type MapObject } from './dungeon';
import { computeVisible, pathAdjacent, pathTo, canSee } from './grid';
import type { Presenter } from './presenter';
import { saveGame } from './save';
import { addLog, armedTrapAt, creatureAt, dist, livingParty, objectsAt, roomAt, type World } from './state';

type TargetMode =
  | { kind: 'aim'; aim: Aim }
  | { kind: 'area'; spell: string; preview: Pos | null }
  | null;

export interface DirectorHooks {
  onQuit: () => void;
  onNewParty: () => void;
  onReload: () => void;
}

export class Director {
  w: World;
  view: MapView;
  hud: Hud;
  dice: DiceOverlay;
  combat: Combat | null = null;
  busy = false;
  mode: 'explore' | 'combat' | 'end' = 'explore';
  private pendingMove: Pos | null = null;
  private target: TargetMode = null;
  private roomId: string | null = null;
  private searched = new Set<string>();
  private cryptAlerted = false;
  private hooks: DirectorHooks;
  p: Presenter;
  /** Co-op host link (null in single-player). */
  link: HostLink | null;

  constructor(app: Application, view: MapView, dice: DiceOverlay, w: World, hooks: DirectorHooks, link: HostLink | null = null) {
    this.w = w;
    this.view = view;
    this.dice = dice;
    this.hooks = hooks;
    this.link = link;
    if (link) {
      const hh = new HostHud(link);
      hh.getParty = () => this.s.party;
      this.hud = hh;
      link.getState = () => this.s;
      link.getMarks = () => this.view.marks;
      link.onIntent = (i) => this.onIntent(i);
      link.onPlayers = () => this.refreshHud();
      link.vm.end = null;
    } else this.hud = new Hud();
    this.p = this.makePresenter();
    view.onTap = (p) => void this.onTap(p, this.me);
    this.hud.onSelect = (i) => { this.hud.decider = this.me; this.selectLeader(i, this.me); };
    this.hud.onSheet = (c) => { this.hud.decider = this.me; this.hud.showCharacter(c); };
    void app;
  }

  /** This device's player id ('local' in single-player). */
  get me(): string { return this.link?.me ?? 'local'; }

  /** Which player controls a hero (falls back to the host if that player is offline). */
  ownerOf(c: Creature | undefined | null): string {
    if (!c || !this.link) return this.me;
    const pid = this.link.owners(this.s.party)[c.id] ?? this.me;
    return this.link.isOnline(pid) ? pid : this.me;
  }

  private emit(ev: NetEvent): void {
    this.link?.emit(ev);
  }

  private onIntent(i: IncomingIntent): void {
    const hh = this.hud as HostHud;
    switch (i.type) {
      case 'tap': void this.onTap({ x: i.x, y: i.y }, i.from); break;
      case 'dock': hh.dockTap(i.id, i.from); break;
      case 'answer': hh.answer(i.pid, i.index, i.actorId, i.from); break;
      case 'leader': if (this.s.party[i.idx] && this.mode !== 'combat' && !this.busy) this.selectLeader(i.idx, i.from); break;
    }
  }

  get s() { return this.w.state; }
  get leader(): Creature { return this.s.party[this.s.leader]; }

  // ---------- Presenter ----------

  private makePresenter(): Presenter {
    return {
      roll: async (r, note) => {
        this.emit({ k: 'roll', r, note });
        this.hud.log(`${r.who}: ${r.label} ${r.d20.kept}${r.bonus ? fmtMod(r.bonus) : ''} = ${r.total} vs ${r.targetKind} ${r.target} → ${r.crit ? 'critical!' : r.success ? 'success' : 'failure'}`, 'roll');
        await this.dice.show(r, note);
      },
      rolls: async (rs, title) => { this.emit({ k: 'rolls', rs, title }); await this.dice.showMany(rs, title); },
      damage: (t, amount, crit, note) => {
        this.emit({ k: 'damage', id: t.id, amount, crit, note });
        showDamage(this.view, t, amount, crit, note);
        this.refreshHud();
      },
      heal: (t, amount) => {
        this.emit({ k: 'heal', id: t.id, amount });
        showHeal(this.view, t, amount);
        this.refreshHud();
      },
      float: (at, text, color) => { this.emit({ k: 'float', at, text, color }); this.view.floatText(at, text, color); },
      log: (msg, tone) => { this.hud.log(msg, tone); addLog(this.w, msg); },
      move: (c, path, ms) => { this.emit({ k: 'move', id: c.id, path, ms: ms ?? CONFIG.STEP_MS }); return this.view.moveToken(c, path, ms ?? CONFIG.STEP_MS); },
      effect: async (kind, from, to) => { this.emit({ k: 'fx', kind, from, to }); await playFx(this.view, kind, from, to); },
      shake: (n) => { this.emit({ k: 'shake', n }); this.view.shake(n); },
      refresh: () => this.refresh(),
      choose: (t, x, o, who) => { if (who) this.hud.decider = this.ownerOf(who); return this.hud.choose(t, x, o); },
      pause: (ms) => wait(ms),
    };
  }

  // ---------- Lifecycle ----------

  start(isLoad: boolean): void {
    this.view.build(this.w);
    this.refresh();
    this.roomId = roomAt(this.w, this.leader.pos)?.id ?? null;
    const room = roomAt(this.w, this.leader.pos);
    if (!isLoad) {
      this.hud.showBanner(room?.name ?? 'Emberdeep', room?.intro ?? '', 6000);
      this.hud.log('Tap the floor to walk. Tap doors, chests and creatures to interact. Tap a hero to lead; tap again for their sheet.');
      this.s.visited.push('stair');
    } else {
      this.hud.showBanner(room?.name ?? 'Emberdeep', 'You pick up where you left off.');
      for (const l of this.s.log.slice(-1)) this.hud.log(l);
    }
    this.exploreDock();
    void this.resumeTriggers();
  }

  private async resumeTriggers(): Promise<void> {
    if (this.s.den === 'hostile' && this.denGoblins().length) await this.startCombat('den', null);
  }

  destroy(): void {
    this.hud.destroy();
  }

  private save(): void {
    if (this.mode === 'combat') return;
    saveGame(this.s);
  }

  // ---------- Refresh ----------

  refresh(): void {
    const vis = computeVisible(this.w);
    for (let i = 0; i < vis.length; i++) if (vis[i]) this.s.seen[i] = 1;
    this.view.updateFog(vis, this.s.seen);
    this.view.syncProps();
    this.view.syncTokens();
    this.refreshHud();
  }

  private visibleNow(p: Pos): boolean {
    const vis = computeVisible(this.w);
    return vis[p.y * this.w.def.w + p.x] === 1;
  }

  refreshHud(): void {
    const turnId = this.combat && this.mode === 'combat' ? this.combat.current?.id ?? null : null;
    this.hud.renderParty(this.s.party, this.s.leader, turnId);
    const chips: { text: string; icon?: string; cls?: string; toast?: string }[] = [];
    if (this.s.inv.potions) chips.push({ text: `${this.s.inv.potions}`, icon: 'potion' });
    if (this.s.inv.keys.length) chips.push({ text: 'Crypt key', icon: 'key', cls: 'ember' });
    if (this.s.inv.phial) chips.push({ text: 'Ember Phial', icon: 'turn_undead', cls: 'ember' });
    if (this.s.inv.gold) chips.push({ text: `${this.s.inv.gold} gp`, icon: 'gold' });
    if (this.s.sneaking && this.mode === 'explore') chips.push({ text: 'Sneaking', icon: 'sneak', cls: 'arc' });
    const canLvl = this.s.party.some((c) => !c.death.dead && levelForXp(c.xp) > c.level);
    if (canLvl) chips.push({ text: 'Level up at a long rest', icon: 'xp', cls: 'ember' });
    chips.push({ text: this.s.omen.omen.name, icon: 'd20', toast: this.s.omen.omen.text });
    this.hud.setChips(chips);
    this.view.insets = this.hud.insets();
    if (this.mode === 'combat') this.renderCombat();
  }

  private selectLeader(i: number, from: string = this.me): void {
    if (this.mode === 'combat') {
      const c = this.s.party[i];
      this.hud.showCharacter(c);
      return;
    }
    if (this.s.party[i].death.dead) return;
    this.s.leader = i;
    this.view.setActive(this.s.party[i].id);
    if (from === this.me) this.view.focus(this.s.party[i].pos);
    this.refreshHud();
  }

  // ---------- Input ----------

  private async onTap(p: Pos, from: string = this.me): Promise<void> {
    if (this.busy || this.mode === 'end') return;
    if (p.x < 0 || p.y < 0 || p.x >= this.w.def.w || p.y >= this.w.def.h) return;
    if (this.mode === 'combat') return this.combatTap(p, from);
    this.hud.decider = from;
    // In co-op, whoever moves the party leads with their own hero.
    if (this.link && this.ownerOf(this.leader) !== from) {
      const mine = this.s.party.findIndex((c) => !c.death.dead && c.hp > 0 && this.ownerOf(c) === from);
      if (mine >= 0) { this.s.leader = mine; this.view.setActive(this.leader.id); }
    }
    const seen = this.s.seen[p.y * this.w.def.w + p.x] === 1;
    if (!seen) { sfx.deny(); return; }
    // creature?
    const mon = this.s.monsters.find((m) => m.hp > 0 && m.pos.x === p.x && m.pos.y === p.y && m.faction !== 'object');
    if (mon && this.visibleNow(p)) return this.tapMonster(mon);
    // object?
    const obj = objectsAt(this.w, p).find((o) => !o.hidden && o.kind !== 'bones');
    if (obj) {
      this.busy = true;
      try {
        const adj = obj.kind === 'trap' ? this.trapApproach(obj) : pathAdjacent(this.w, this.leader.pos, obj.pos, { avoidTraps: true, blockers: this.blockers() });
        if (adj === null) { this.hud.log('You cannot reach that from here.'); sfx.deny(); return; }
        if (adj.length) { const ok = await this.walk(adj); if (!ok) return; }
        await this.interact(obj);
      } finally { this.busy = false; this.exploreDock(); }
      return;
    }
    this.busy = true;
    try {
      // While unseen in the den, prefer routes that keep a square away from every goblin.
      const wary = this.s.den === 'sneaked' ? this.denGoblins() : [];
      const forbid = wary.length ? (q: Pos) => wary.some((g) => dist(g.pos, q) <= 1) : undefined;
      const path = (forbid && pathTo(this.w, this.leader.pos, p, { avoidTraps: true, blockers: this.blockers(), forbid }))
        || pathTo(this.w, this.leader.pos, p, { avoidTraps: true, blockers: this.blockers() });
      if (!path) {
        const trap = this.s.objects.find((o) => o.kind === 'trap' && !o.hidden && o.armed);
        this.hud.log(trap && this.trapBetween(p) ? 'The needle plates bar the way. Deal with the trap first.' : 'No way through.');
        sfx.deny();
        return;
      }
      await this.walk(path);
    } finally { this.busy = false; this.exploreDock(); }
  }

  private blockers(): Creature[] {
    return this.s.monsters.filter((m) => m.hp > 0);
  }

  private trapBetween(goal: Pos): boolean {
    return pathTo(this.w, this.leader.pos, goal, { blockers: this.blockers() }) !== null;
  }

  private trapApproach(o: MapObject): Pos[] | null {
    // Stand on the near side of the plates.
    const side = this.leader.pos.y > o.pos.y ? 1 : -1;
    const spot = (o.tiles ?? [o.pos]).map((t) => ({ x: t.x, y: t.y + side })).sort((a, b) => dist(a, this.leader.pos) - dist(b, this.leader.pos))[0];
    if (dist(spot, this.leader.pos) === 0) return [];
    return pathTo(this.w, this.leader.pos, spot, { avoidTraps: true, blockers: this.blockers() });
  }

  // ---------- Walking ----------

  /** Walk the party in a line. Returns false if something interrupted the walk. */
  async walk(path: Pos[]): Promise<boolean> {
    const order = [this.leader, ...this.s.party.filter((c) => c.id !== this.leader.id && !c.death.dead)];
    const ms = CONFIG.WALK_MS * (this.s.sneaking ? 1.6 : 1);
    for (const step of path) {
      const moves: { c: Creature; to: Pos }[] = [];
      let prev = { ...order[0].pos };
      moves.push({ c: order[0], to: step });
      for (let i = 1; i < order.length; i++) {
        const c = order[i];
        const here = { ...c.pos };
        if (dist(c.pos, moves[i - 1].to) > 1 || (c.pos.x === moves[i - 1].to.x && c.pos.y === moves[i - 1].to.y)) moves.push({ c, to: prev });
        else moves.push({ c, to: here });
        prev = here;
      }
      this.emit({ k: 'group', steps: moves.map((m) => ({ id: m.c.id, to: m.to })), ms });
      await this.view.moveGroup(moves, ms);
      for (const m of moves) m.c.pos = { ...m.to };
      this.view.focus(step);
      sfx.step();
      // Trap underfoot?
      const trap = armedTrapAt(this.w, step);
      if (trap) { this.refresh(); await this.springTrap(order[0], trap); return false; }
      const revealed = this.passiveSpot();
      this.refresh();
      if (await this.roomCheck()) return false;
      if (revealed) return false;
      if (await this.sneakProximity()) return false;
    }
    return true;
  }

  /** Passive Perception against hidden things in sight. Returns true only if a trap was spotted (that should stop a walk). */
  private passiveSpot(): boolean {
    let found = false;
    const vis = computeVisible(this.w);
    for (const o of this.s.objects) {
      if (!o.hidden || !o.passiveDC) continue;
      const tiles = o.tiles ?? [o.pos];
      const spotter = livingParty(this.w)
        .filter((c) => c.hp > 0 && tiles.some((t) => dist(t, c.pos) <= 3 && (vis[t.y * this.w.def.w + t.x] || this.wallAdjacentVisible(t, vis))))
        .sort((a, b) => passive(b, 'perception') - passive(a, 'perception'))[0];
      if (!spotter) continue;
      if (passive(spotter, 'perception') >= o.passiveDC) {
        o.hidden = false;
        if (o.kind === 'trap') found = true;
        this.view.burst(o.pos, PAL.gold, 16);
        sfx.crit();
        const what = o.kind === 'trap' ? 'pressure plates in the floor ahead' : o.kind === 'secret' ? 'a hairline seam in the wall: a hidden door!' : 'a loose flagstone';
        this.hud.log(`${spotter.name} notices ${what} (passive Perception ${passive(spotter, 'perception')}).`, 'good');
        this.hud.toast(o.kind === 'trap' ? 'Trap spotted!' : 'Something hidden!');
        this.onReveal(o);
      }
    }
    return found;
  }

  private wallAdjacentVisible(t: Pos, vis: Uint8Array): boolean {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = t.x + dx, y = t.y + dy;
      if (vis[y * this.w.def.w + x] && this.w.def.tiles[y]?.[x] !== 'wall') return true;
    }
    return false;
  }

  private onReveal(o: MapObject): void {
    if (o.kind === 'trap') this.award('trap', 50, 'Found the needle trap');
    if (o.id === 'secret-1') this.award('secret1', 50, 'Found a secret door');
    if (o.id === 'secret-2') this.award('secret2', 25, 'Found the Sister Passage door');
    if (o.id === 'cache') this.award('cache', 25, 'Found a hidden cache');
  }

  // ---------- Rooms & triggers ----------

  private async roomCheck(): Promise<boolean> {
    const room = roomAt(this.w, this.leader.pos);
    if (!room || room.id === this.roomId) return false;
    this.roomId = room.id;
    const first = !this.s.visited.includes(room.id);
    if (first) {
      this.s.visited.push(room.id);
      this.hud.showBanner(room.name, room.intro);
      if (room.id === 'shrine') this.award('shrine', 75, 'Reached the Shrine of the Last Candle');
    }
    if (room.id === 'hall' && this.s.den === 'sneaked') this.award('den', 175, 'Slipped past the goblins unseen');
    this.save();
    if (room.id === 'den' && this.s.den === 'unaware') {
      await this.denTrigger();
      return true;
    }
    if (room.id === 'crypt' && !this.s.bossDone && this.wardenAlive()) {
      await this.startBoss();
      return true;
    }
    return false;
  }

  private denGoblins(): Creature[] {
    return this.s.monsters.filter((m) => m.hp > 0 && m.faction === 'goblins');
  }
  private wardenAlive(): boolean {
    return this.s.monsters.some((m) => m.monsterId === 'ash-warden' && m.hp > 0);
  }

  private async sneakProximity(): Promise<boolean> {
    if (this.s.den !== 'sneaked') return false;
    const near = this.denGoblins().some((g) => livingParty(this.w).some((c) => dist(c.pos, g.pos) <= 1));
    if (!near) return false;
    this.hud.log('You creep too close. A goblin ear twitches...', 'bad');
    this.s.den = 'unaware';
    await this.runDialogue(true);
    return true;
  }

  private async denTrigger(): Promise<void> {
    const dc = 11 + (this.s.omen.omen.mods.goblinDC ?? 0);
    if (this.s.sneaking) {
      const rs: TestResult[] = livingParty(this.w).filter((c) => c.hp > 0).map((c) => abilityCheck(c, 'stealth', dc));
      await this.p.rolls(rs, `Group Stealth vs the goblins (DC ${dc}): half must succeed`);
      const ok = rs.filter((r) => r.success).length >= rs.length / 2;
      if (ok) {
        this.s.den = 'sneaked';
        this.hud.showBanner('Unseen', 'The goblins bicker over the fire, oblivious. Slip past to the north, or tap them to ambush or talk.');
        this.hud.log('Group Stealth succeeds. The goblins have not noticed you.', 'good');
        this.save();
        return;
      }
      this.hud.log('A boot scrapes on stone. The goblins spin around!', 'bad');
      await this.runDialogue(true);
      return;
    }
    await this.runDialogue(false);
  }

  // ---------- Dialogue ----------

  private async runDialogue(noticed: boolean): Promise<void> {
    this.s.denNoticed = noticed;
    const ctx: DCtx = { potions: this.s.inv.potions, fearKnown: false, insightTried: false, noticed, dcMod: this.s.omen.omen.mods.goblinDC ?? 0 };
    let node = SNIKK.start;
    let outcome: DialogueEnd | null = null;
    const party = this.s.party.filter((c) => !c.death.dead);
    while (!outcome) {
      const speaker = node.speaker === 'snikk' ? { name: 'Snikk, Goblin Boss', portrait: 'goblin_boss', narrator: false } : { name: '', narrator: true };
      if (node.end) {
        const end = node.end;
        await this.hud.dialogue(speaker, node.text(ctx), [{ label: end === 'fight' ? 'Fight!' : 'Continue', value: 'x', primary: true, icon: end === 'fight' ? 'attack' : 'talk' }], party);
        outcome = end;
        break;
      }
      const opts = (node.options ?? []).filter((o) => !o.when || o.when(ctx));
      const sheetOpts: SheetOption<DOption>[] = opts.map((o) => ({
        label: o.text,
        value: o,
        tag: o.tag,
        icon: o.tag === 'fight' ? 'attack' : o.tag === 'pay' ? 'potion' : o.tag === 'read' ? 'search' : o.tag === 'threat' ? 'frightened' : 'talk',
        check: o.check ? { kind: o.check.kind, dc: o.check.dc(ctx), adv: o.check.adv?.(ctx) ? [o.check.adv(ctx)!] : [] } : undefined,
      }));
      const pick = (await this.hud.dialogue(speaker, node.text(ctx), sheetOpts, party))!;
      const o = pick.value;
      if (o.sets) Object.assign(ctx, o.sets);
      if (o.pay === 'potion') { this.s.inv.potions--; ctx.potions--; sfx.coin(); }
      if (o.end) { outcome = o.end; break; }
      if (o.check && pick.actor) {
        const dc = o.check.dc(ctx);
        const adv = o.check.adv?.(ctx);
        const r = await this.check(pick.actor, o.check.kind, dc, adv ? [adv] : []);
        if (o.id === 'insight' && r.success) ctx.fearKnown = true;
        node = SNIKK[r.success ? o.next! : o.fail!];
      } else if (o.next) node = SNIKK[o.next];
    }
    await this.applyDenOutcome(outcome);
  }

  private async applyDenOutcome(o: DialogueEnd): Promise<void> {
    const goblins = this.denGoblins();
    switch (o) {
      case 'ally':
        this.s.den = 'ally';
        this.s.inv.keys.push('crypt-key');
        this.s.tip = true;
        for (const id of ['secret-1', 'secret-2']) { const s = this.s.objects.find((x) => x.id === id)!; if (s.hidden) { s.hidden = false; this.onReveal(s); } }
        this.hud.toast('Snikk gives you the Crypt Key');
        this.hud.log('Snikk hands over a black iron key and points out two hidden doors on your map.', 'good');
        this.award('den', 175, 'Made a pact with Snikk');
        break;
      case 'peace':
        this.s.den = 'toll';
        this.award('den', 175, 'Talked your way past the goblins');
        break;
      case 'toll': {
        this.s.den = 'toll';
        const trap = this.s.objects.find((x) => x.kind === 'trap')!;
        if (trap.hidden) { trap.hidden = false; this.onReveal(trap); this.hud.log('"Mind the needles," Snikk said. You know where the trap is.', 'good'); }
        this.award('den', 175, 'Paid the goblin toll');
        break;
      }
      case 'flee':
        this.s.den = 'fled';
        for (const g of goblins) { g.hp = 0; g.pos = { x: 0, y: 0 }; }
        { const stash = this.s.objects.find((x) => x.id === 'stash')!; stash.locked = false; }
        this.award('den', 175, 'Scared off the goblins');
        break;
      case 'fight':
        this.s.den = 'hostile';
        this.refresh();
        await this.startCombat('den', null);
        return;
    }
    this.refresh();
    this.exploreDock();
    this.save();
  }

  private async tapMonster(m: Creature): Promise<void> {
    if (m.faction === 'goblins') {
      const den = this.s.den;
      const opts: SheetOption<string>[] = [];
      if (den === 'sneaked') {
        opts.push({ label: 'Ambush them', sub: 'Start a fight. They are Surprised (disadvantage on initiative).', value: 'ambush', icon: 'attack', primary: true });
        opts.push({ label: 'Reveal yourselves and talk', sub: 'Snikk will hear you out.', value: 'talk', icon: 'talk' });
      } else if (den === 'ally' || den === 'toll') {
        opts.push({ label: 'Attack them', sub: 'Break the truce. They will not be surprised.', value: 'betray', icon: 'attack' });
      }
      opts.push({ label: 'Look closer', value: 'inspect', icon: 'search' });
      const r = await this.hud.sheet({ title: m.name, lead: den === 'ally' ? 'Snikk grins and waves you north.' : den === 'toll' ? 'The goblins watch you, hands on their blades.' : 'Hunched by the fire, unaware of you.', options: opts });
      if (!r) return;
      if (r.value === 'inspect') return this.inspect(m);
      if (r.value === 'talk') { this.s.den = 'unaware'; return this.runDialogue(false); }
      if (r.value === 'ambush') { this.s.den = 'hostile'; return this.startCombat('den', 'enemies'); }
      if (r.value === 'betray') { this.s.den = 'hostile'; this.hud.log('Snikk shrieks: "Liars! Tall-folk liars!"', 'bad'); return this.startCombat('den', null); }
    } else this.inspect(m);
  }

  private inspect(m: Creature): void {
    const def = m.monsterId ? MONSTERS[m.monsterId] : null;
    this.hud.showCreature(m, def ? [`Challenge ${def.cr}: ${def.xp} XP`, ...def.traits.map((t) => `${t.name}: ${t.text}`), ...m.weapons.map((w) => `${w.name}: ${fmtMod(w.toHit ?? 0)} to hit, ${w.dmg} ${w.type}`)] : []);
  }

  // ---------- Checks with rerolls ----------

  /** An ability check with the dice overlay, offering Heroic Inspiration or Tactical Mind on failure. */
  async check(c: Creature, kind: CheckKind, dc: number, adv: string[] = []): Promise<TestResult> {
    let r = abilityCheck(c, kind, dc, { adv });
    await this.p.roll(r);
    if (r.success) return r;
    // The hero's own player decides how to spend that hero's resources.
    const prevDecider = this.hud.decider;
    this.hud.decider = this.ownerOf(c);
    try { return await this.rerollOffers(c, kind, dc, adv, r); } finally { this.hud.decider = prevDecider; }
  }

  private async rerollOffers(c: Creature, kind: CheckKind, dc: number, adv: string[], first: TestResult): Promise<TestResult> {
    let r = first;
    if (c.res.inspiration > 0) {
      const yes = await this.hud.choose('Heroic Inspiration', `${c.name} can reroll this check once (recharges on a long rest).`, [
        { label: 'Reroll', value: true, primary: true }, { label: 'Accept failure', value: false }]);
      if (yes) {
        c.res.inspiration--;
        r = abilityCheck(c, kind, dc, { adv });
        await this.p.roll(r, '(Heroic Inspiration)');
        if (r.success) return r;
      }
    }
    if (c.classId === 'fighter' && c.level >= 2 && c.res.secondWind > 0 && r.total + 10 >= dc) {
      const yes = await this.hud.choose('Tactical Mind', `Spend a Second Wind use to add 1d10 to this check? (${r.total} vs DC ${dc})`, [
        { label: 'Add 1d10', value: true, primary: true }, { label: 'Keep it', value: false }]);
      if (yes) {
        c.res.secondWind--;
        const d = die(10);
        r.total += d;
        r.extras.push({ label: 'Tactical Mind', value: d });
        r.success = r.total >= dc;
        this.hud.log(`Tactical Mind: +${d} → ${r.total} (${r.success ? 'success' : 'still short'}).`, r.success ? 'good' : 'bad');
        this.view.floatText(c.pos, `+${d}`, PAL.ember);
      }
    }
    return r;
  }

  // ---------- Interactions ----------

  private async interact(o: MapObject): Promise<void> {
    const party = this.s.party.filter((c) => !c.death.dead);
    switch (o.kind) {
      case 'door': {
        if (o.open) return;
        if (!o.locked) { await this.openDoor(o); return; }
        const hasKey = o.keyId && this.s.inv.keys.includes(o.keyId);
        const r = await this.hud.sheet<string>({
          title: o.name, lead: o.text, party,
          options: [
            ...(hasKey ? [{ label: 'Use the Crypt Key', sub: 'Snikk\'s key turns smoothly.', value: 'key', icon: 'key', primary: true }] : []),
            { label: 'Pick the lock', value: 'pick', icon: 'lockpick', check: { kind: 'tools' as CheckKind, dc: o.lockDC! }, sub: 'Quiet.' },
            { label: 'Force it open', value: 'force', icon: 'str', check: { kind: 'athletics' as CheckKind, dc: o.forceDC! }, sub: 'Loud: a failure alerts whatever is inside.' },
          ],
        });
        if (!r) return;
        if (r.value === 'key') { o.locked = false; sfx.coin(); await this.openDoor(o); return; }
        const res = await this.check(r.actor!, r.value === 'pick' ? 'tools' : 'athletics', r.value === 'pick' ? o.lockDC! : o.forceDC!);
        if (res.success) { o.locked = false; await this.openDoor(o); }
        else if (r.value === 'force') { this.cryptAlerted = true; this.hud.log('The door booms in its frame. Something beyond it stirs.', 'bad'); this.view.shake(4); }
        else this.hud.log('The lock resists. You can try again.', 'info');
        return;
      }
      case 'secret': {
        if (o.open) return;
        const r = await this.hud.sheet<string>({ title: 'Hidden door', lead: o.text, options: [{ label: 'Press the seam', value: 'open', icon: 'search', primary: true }] });
        if (r) await this.openDoor(o);
        return;
      }
      case 'chest': case 'cache': {
        if (o.looted) { this.hud.log('Empty.'); return; }
        const watched = o.id === 'stash' && this.denGoblins().length > 0 && this.s.den !== 'hostile';
        if (!o.locked) {
          if (watched) { await this.stashWatched(o, 'open'); return; }
          const r = await this.hud.sheet<string>({ title: o.name, lead: o.text, options: [{ label: o.kind === 'cache' ? 'Pry up the stone' : 'Open it', value: 'open', icon: 'gold', primary: true }] });
          if (r) this.loot(o);
          return;
        }
        const r = await this.hud.sheet<string>({
          title: o.name, lead: `${o.text}${watched ? ' Snikk is watching.' : ''}`, party,
          options: [
            { label: 'Pick the lock', value: 'pick', icon: 'lockpick', check: { kind: 'tools', dc: o.lockDC! }, sub: watched && this.s.den !== 'sneaked' ? 'The goblins will see. That means a fight.' : watched ? 'Quietly, while they are distracted. Failure gets you noticed.' : '' },
            { label: 'Smash it open', value: 'smash', icon: 'str', check: { kind: 'athletics', dc: o.forceDC! }, sub: 'Something fragile inside may break.' },
          ],
        });
        if (!r) return;
        if (watched && (this.s.den !== 'sneaked' || r.value === 'smash')) { await this.stashWatched(o, r.value); return; }
        const res = await this.check(r.actor!, r.value === 'pick' ? 'tools' : 'athletics', r.value === 'pick' ? o.lockDC! : o.forceDC!);
        if (res.success) {
          o.locked = false;
          if (r.value === 'smash' && o.loot?.includes('potion')) { o.loot.splice(o.loot.indexOf('potion'), 1); this.hud.log('Glass crunches. One potion is lost.', 'bad'); }
          this.loot(o);
        } else if (watched) {
          this.hud.log('The lock clicks loudly. Snikk turns around.', 'bad');
          this.s.den = 'unaware';
          await this.runDialogue(true);
        } else this.hud.log('No luck this time.');
        return;
      }
      case 'trap': return this.trapSheet(o);
      case 'shrine': return this.restSheet(true);
      case 'campfire': this.hud.log('The goblins\' fire pops and spits.'); return;
      case 'stairs': this.hud.log('Daylight waits up there. The Warden waits down here.'); return;
    }
  }

  private async stashWatched(o: MapObject, how: string): Promise<void> {
    const yes = await this.hud.choose('Snikk\'s stash', 'The goblins are right there. Touching the stash means a fight.', [
      { label: 'Do it anyway', value: true, detail: how === 'open' ? 'Grab it and fight.' : 'Steel yourselves.' }, { label: 'Leave it', value: false, primary: true }]);
    if (!yes) return;
    this.s.den = 'hostile';
    this.hud.log('"THIEVES!" Snikk shrieks.', 'bad');
    await this.startCombat('den', null);
    void o;
  }

  private loot(o: MapObject): void {
    o.looted = true;
    sfx.coin();
    const got: string[] = [];
    for (const l of o.loot ?? []) {
      if (l === 'potion') { this.s.inv.potions++; got.push('a Potion of Healing'); }
      else if (l === 'phial') { this.s.inv.phial++; got.push('the Ember Phial (holy light; shatters the Binding Brazier)'); }
      else if (l.startsWith('gold:')) { const g = parseInt(l.slice(5), 10); this.s.inv.gold += g; got.push(`${g} gold`); }
    }
    this.hud.log(`Found ${got.join(', ') || 'nothing'}.`, 'good');
    if (got.length) this.hud.toast(`Found ${got.length > 1 ? `${got.length} things` : got[0].split(' (')[0]}`);
    this.view.burst(o.pos, PAL.gold, 18);
    this.refresh();
    this.save();
  }

  private async openDoor(o: MapObject): Promise<void> {
    o.open = true;
    sfx.door();
    this.hud.log(`The ${o.kind === 'secret' ? 'hidden door' : o.name.toLowerCase()} swings open.`);
    this.refresh();
    if ((o.id === 'door-crypt' || o.id === 'secret-2') && this.wardenAlive() && !this.s.bossDone) {
      this.s.bossSurprised = o.id === 'secret-2' && !this.cryptAlerted;
      await wait(250);
      await this.startBoss();
    }
  }

  // ---------- Search ----------

  private async search(): Promise<void> {
    const party = this.s.party.filter((c) => c.hp > 0 && !c.death.dead);
    const room = roomAt(this.w, this.leader.pos)?.id ?? 'x';
    const r = await this.hud.sheet<CheckKind>({
      title: 'Search the area', lead: 'Each hero can search a room once. Look for traps, seams and hidden things nearby.', party, actorId: this.leader.id,
      options: [
        { label: 'Look around', sub: 'Spot what is out of place.', value: 'perception', icon: 'search', check: { kind: 'perception', dc: 13, dcHidden: true } },
        { label: 'Study the stonework', sub: 'Reason out mechanisms and seams.', value: 'investigation', icon: 'int', check: { kind: 'investigation', dc: 13, dcHidden: true } },
      ],
    });
    if (!r || !r.actor) return;
    const key = `${room}:${r.actor.id}`;
    if (this.searched.has(key)) { this.hud.log(`${r.actor.name} has already searched here.`); sfx.deny(); return; }
    this.searched.add(key);
    const res = abilityCheck(r.actor, r.value, 0);
    res.target = 0;
    await this.dice.show({ ...res, targetKind: 'DC', target: res.total, success: true }, 'search result');
    let found = 0;
    for (const o of this.s.objects) {
      if (!o.hidden || !o.searchDC) continue;
      const near = (o.tiles ?? [o.pos]).some((t) => dist(t, r.actor!.pos) <= 4);
      if (near && res.total >= o.searchDC) { o.hidden = false; found++; this.view.burst(o.pos, PAL.gold, 16); this.onReveal(o); }
    }
    this.hud.log(found ? `${r.actor.name} finds ${found} hidden thing${found > 1 ? 's' : ''}! (${res.total})` : `${r.actor.name} finds nothing (${res.total}).`, found ? 'good' : 'info');
    if (found) { sfx.crit(); this.hud.toast('Found something!'); }
    this.refresh();
  }

  // ---------- Traps ----------

  private async springTrap(c: Creature, trap: MapObject): Promise<void> {
    sfx.trap();
    const wasHidden = trap.hidden;
    trap.hidden = false;
    if (wasHidden) this.onReveal(trap);
    this.view.shake(4);
    this.hud.log(`Click. Needles hiss from the walls at ${c.name}!`, 'bad');
    const dc = 13;
    const r = savingThrow(c, 'dex', dc);
    await this.p.roll(r, 'vs needle trap');
    if (!r.success) {
      const d = rollExpr('2d4').total;
      await this.applyOutOfCombatDamage(c, d, 'piercing');
      const p = savingThrow(c, 'con', 11, 'poisoned');
      await this.p.roll(p, 'vs poison');
      if (!p.success) { c.conds.poisoned = { untilRest: true }; this.hud.log(`${c.name} is Poisoned until a rest.`, 'bad'); }
    } else this.hud.log(`${c.name} twists away from the needles.`, 'good');
    this.refresh();
  }

  private async applyOutOfCombatDamage(c: Creature, dmg: number, type: string): Promise<void> {
    let d = dmg;
    if (c.resist.includes(type as never)) d = Math.floor(d / 2);
    c.hp = Math.max(0, c.hp - d);
    this.p.damage(c, d, false);
    if (c.hp <= 0) {
      c.conds = { unconscious: {} };
      c.death = { s: 0, f: 0, stable: true, dead: false };
      this.hud.log(`${c.name} collapses! The others stabilise them.`, 'bad');
    }
  }

  private async trapSheet(o: MapObject): Promise<void> {
    if (!o.armed) { this.hud.log('The plates are jammed. Safe.'); return; }
    const party = this.s.party.filter((c) => !c.death.dead);
    const r = await this.hud.sheet<string>({
      title: 'Needle plates', lead: o.text, party,
      options: [
        { label: 'Disarm it', sub: 'Jam the plates for good. Failing by 5 or more springs it on you.', value: 'disarm', icon: 'lockpick', check: { kind: 'tools', dc: 13 } },
        { label: 'Time the mechanism', sub: 'Work out the reload delay, then everyone crosses between volleys.', value: 'time', icon: 'int', check: { kind: 'investigation', dc: 12 } },
        { label: 'Leap across', sub: 'Everyone jumps the plates: an Athletics check (DC 8) each.', value: 'leap', icon: 'dash' },
      ],
    });
    if (!r) return;
    if (r.value === 'disarm') {
      const res = await this.check(r.actor!, 'tools', 13);
      if (res.success) { o.armed = false; sfx.coin(); this.hud.log(`${r.actor!.name} wedges the plates. The trap is disarmed.`, 'good'); this.award('trapx', 25, 'Disarmed the needle trap'); }
      else if (res.total <= 8) { this.hud.log('Snap! The mechanism fires.', 'bad'); await this.springTrap(r.actor!, o); }
      else this.hud.log('The plates won\'t budge yet.');
      this.refresh();
      return;
    }
    if (r.value === 'time') {
      const res = await this.check(r.actor!, 'investigation', 12);
      if (res.success) { this.hud.log('Click... hiss... and a slow reload. You cross between volleys.', 'good'); await this.crossTrap(o, null); }
      else { this.hud.log('You misjudge the rhythm!', 'bad'); await this.crossTrap(o, this.leader); }
      return;
    }
    // leap
    const rs = this.s.party.filter((c) => c.hp > 0 && !c.death.dead).map((c) => abilityCheck(c, 'athletics', 8));
    await this.p.rolls(rs, 'Leap the plates: Athletics DC 8 each');
    const failed = rs.filter((x) => !x.success).map((x) => this.s.party.find((c) => c.id === x.whoId)!);
    await this.crossTrap(o, null);
    for (const f of failed) { this.hud.log(`${f.name} lands on a plate!`, 'bad'); await this.springTrap(f, o); }
  }

  private async crossTrap(o: MapObject, victim: Creature | null): Promise<void> {
    const dir = this.leader.pos.y > o.pos.y ? -1 : 1;
    const order = [this.leader, ...this.s.party.filter((c) => c.id !== this.leader.id && !c.death.dead)];
    const landY = o.pos.y + dir * 2;
    const spots = [{ x: 9, y: landY }, { x: 8, y: landY }, { x: 10, y: landY }, { x: 9, y: landY + dir }];
    this.emit({ k: 'group', steps: order.map((c, i) => ({ id: c.id, to: spots[i] })), ms: 420 });
    await this.view.moveGroup(order.map((c, i) => ({ c, to: spots[i] })), 420);
    order.forEach((c, i) => (c.pos = { ...spots[i] }));
    this.view.focus(this.leader.pos);
    this.refresh();
    if (victim) await this.springTrap(victim, o);
    await this.roomCheck();
  }

  // ---------- Rests ----------

  private async restSheet(atShrine: boolean): Promise<void> {
    if (this.mode !== 'explore') return;
    const shrine = roomAt(this.w, this.leader.pos)?.safe;
    const denDanger = roomAt(this.w, this.leader.pos)?.id === 'den' && this.denGoblins().length > 0 && this.s.den !== 'ally' && this.s.den !== 'toll';
    const left = CONFIG.SHORT_RESTS_PER_LONG - this.s.shortRests;
    const canLvl = this.s.party.some((c) => !c.death.dead && levelForXp(c.xp) > c.level);
    const r = await this.hud.sheet<string>({
      title: atShrine || shrine ? 'The Last Candle' : 'Rest',
      lead: shrine ? 'The candle\'s light keeps the dead away. You are safe here.' : 'A short rest takes an hour. You can rest twice before you need a long rest.',
      options: [
        { label: 'Short rest (1 hour)', sub: `Spend Hit Dice to heal; Second Wind, Channel Divinity and Arcane Recovery come back. ${left} left.`, value: 'short', icon: 'rest_short', disabled: left <= 0 ? 'Rested enough: you need a long rest' : denDanger ? 'Not with goblins watching' : undefined },
        { label: 'Long rest (8 hours)', sub: `Full HP and spell slots, half your Hit Dice.${canLvl ? ' You have earned a level!' : ''}`, value: 'long', icon: 'rest_long', primary: !!shrine, disabled: shrine ? undefined : 'Only somewhere truly safe, like a shrine' },
      ],
    });
    if (!r) return;
    if (r.value === 'short') await this.shortRest();
    else await this.longRestAll();
  }

  private async shortRest(): Promise<void> {
    this.s.shortRests++;
    const lines: string[] = [];
    for (const c of this.s.party) {
      if (c.death.dead) continue;
      if (c.hp <= 0) { c.hp = 1; delete c.conds.unconscious; c.death = { s: 0, f: 0, stable: false, dead: false }; }
      let healed = 0;
      while (c.hitDiceLeft > 0 && c.maxHp - c.hp >= c.hitDie / 2 + 1) {
        c.hitDiceLeft--;
        const amt = Math.max(1, die(c.hitDie) + mod(c, 'con'));
        c.hp = Math.min(c.maxHp, c.hp + amt);
        healed += amt;
      }
      const extra = shortRestRecover(c);
      if (c.classId === 'wizard' && c.res.arcaneRecovery > 0 && c.slots[0] < c.slotsMax[0]) {
        c.res.arcaneRecovery = 0;
        c.slots[0]++;
        extra.push('Arcane Recovery: 1 slot');
      }
      lines.push(`${c.name}: ${healed ? `+${healed} HP` : 'no Hit Dice spent'}${extra.length ? ` · ${extra.join(', ')}` : ''}`);
    }
    sfx.heal();
    this.hud.log('You rest for an hour. ' + lines.join(' | '), 'good');
    await this.hud.panel('Short rest', this.listEl(lines), true);
    this.refresh();
    this.save();
  }

  private async longRestAll(): Promise<void> {
    for (const c of this.s.party) if (!c.death.dead) longRest(c);
    this.s.shortRests = 0;
    sfx.heal();
    this.hud.log('You sleep beneath the Last Candle. Hit points and spell slots restored.', 'good');
    const reports = this.s.party.filter((c) => !c.death.dead).map((c) => levelUp(c)).filter((x): x is NonNullable<typeof x> => !!x);
    if (reports.length) {
      for (const c of this.s.party) if (!c.death.dead) { c.hp = c.maxHp; }
      await this.hud.levelUp(reports);
      this.hud.log(`Level up! The party is now level ${reports[0].to}.`, 'good');
    } else {
      await this.hud.panel('Long rest', this.listEl(['Hit points and spell slots restored.', 'Half your Hit Dice return.', 'Heroic Inspiration and class resources recharge.']), true);
    }
    this.refresh();
    this.save();
  }

  private listEl(lines: string[]): HTMLElement {
    const d = document.createElement('div');
    for (const l of lines) { const p = document.createElement('p'); p.className = 'feat'; p.textContent = l; d.append(p); }
    return d;
  }

  // ---------- XP ----------

  award(key: string, xp: number, why: string): void {
    if (this.s.awards.includes(key)) return;
    this.s.awards.push(key);
    for (const c of this.s.party) if (!c.death.dead) c.xp += xp;
    this.hud.log(`+${xp} XP each: ${why}.`, 'good');
    this.view.floatText(this.leader.pos, `+${xp} XP`, PAL.gold, true);
    const lvl = this.s.party.some((c) => !c.death.dead && levelForXp(c.xp) > c.level);
    if (lvl) this.hud.toast('Level up ready: take a long rest');
    this.refreshHud();
  }

  // ---------- Exploration dock ----------

  exploreDock(): void {
    if (this.mode !== 'explore') return;
    this.hud.dockFor = 'all';
    this.hud.setTurnbar(null);
    this.hud.setOrder(null);
    this.view.clearMarks();
    this.view.setActive(this.leader.id);
    const btns: DockBtn[] = [
      { id: 'search', label: 'Search', icon: 'search', onTap: () => this.guard(() => this.search()) },
      { id: 'sneak', label: this.s.sneaking ? 'Sneaking' : 'Sneak', icon: 'sneak', on: this.s.sneaking, onTap: () => { this.s.sneaking = !this.s.sneaking; this.hud.log(this.s.sneaking ? 'You move quietly (half speed). Heavy armour makes Stealth harder.' : 'You stop sneaking.'); this.exploreDock(); this.refreshHud(); } },
      { id: 'rest', label: 'Rest', icon: 'rest_short', onTap: () => this.guard(() => this.restSheet(false)) },
      { id: 'potion', label: 'Potion', icon: 'potion', count: this.s.inv.potions, off: this.s.inv.potions <= 0, onTap: () => this.guard(() => this.explorePotion()) },
      { id: 'menu', label: 'Menu', icon: 'menu', onTap: () => this.guard(() => this.menu()) },
    ];
    this.hud.setDock(btns);
  }

  private async guard(fn: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try { await fn(); } finally { this.busy = false; if (this.mode === 'explore') this.exploreDock(); }
  }

  private async explorePotion(): Promise<void> {
    if (this.s.inv.potions <= 0) return;
    const r = await this.hud.sheet<Creature>({
      title: 'Potion of Healing', lead: 'Restores 2d4 + 2 hit points.',
      options: this.s.party.filter((c) => !c.death.dead).map((c) => ({ label: c.name, sub: `${Math.max(0, c.hp)}/${c.maxHp} HP`, value: c, icon: 'heal', primary: c.hp < c.maxHp / 2 })),
    });
    if (!r) return;
    const t = r.value;
    this.s.inv.potions--;
    const amt = rollExpr('2d4+2').total;
    if (t.hp <= 0) { delete t.conds.unconscious; t.death = { s: 0, f: 0, stable: false, dead: false }; }
    t.hp = Math.min(t.maxHp, Math.max(0, t.hp) + amt);
    this.p.heal(t, amt);
    this.hud.log(`${t.name} drinks a potion (+${amt} HP).`, 'good');
    this.refresh();
  }

  private async menu(): Promise<void> {
    const r = await this.hud.sheet<string>({
      title: 'Menu', options: [
        { label: 'Journal', sub: 'Everything that has happened.', value: 'log', icon: 'sheet' },
        { label: 'Party sheets', sub: 'Abilities, skills, spells, features.', value: 'sheets', icon: 'sheet' },
        { label: this.link ? 'Save and end the session for everyone' : 'Save and quit to title', value: 'quit', icon: 'close' },
      ],
    });
    if (!r) return;
    if (r.value === 'log') this.hud.showLog();
    if (r.value === 'sheets') this.hud.showCharacter(this.leader);
    if (r.value === 'quit') { this.save(); this.hooks.onQuit(); }
    if (r.value === 'leave') this.hooks.onQuit();
  }

  // ---------- Combat ----------

  private async startBoss(): Promise<void> {
    this.hud.showBanner('The Ash Warden', '"None pass the Last Candle." Violet fire coils around its blade.', 5000);
    this.hud.log('The Ash Warden rises from its vigil. Its binding brazier flares. Douse it (Arcana, Athletics, cold, or the Ember Phial) to stop the Warden healing.', 'bad');
    await this.startCombat('crypt', this.s.bossSurprised ? 'enemies' : this.cryptAlerted ? 'party' : null);
  }

  async startCombat(group: 'den' | 'crypt', surprised: 'party' | 'enemies' | null): Promise<void> {
    const ids = new Set(this.w.def.spawns.filter((s) => s.group === group).map((s) => s.pos.x * 100 + s.pos.y));
    void ids;
    const monsters = group === 'den' ? this.denGoblins() : this.s.monsters.filter((m) => (m.faction === 'undead' || m.faction === 'object') && (m.hp > 0 || m.monsterId === 'brazier'));
    if (!monsters.length) return;
    this.save();
    this.mode = 'combat';
    this.s.sneaking = false;
    for (const m of monsters) { delete m.conds.asleep; }
    const c = new Combat(this.w, this.p);
    this.combat = c;
    // Combat may start from inside a tap handler; release its lock so the player can act.
    this.busy = false;
    c.onChange = () => this.renderCombat();
    c.onTrap = async (pc) => { const t = armedTrapAt(this.w, pc.pos); if (t) await this.springTrap(pc, t); };
    this.hud.toast(surprised === 'enemies' ? 'Ambush!' : 'Roll for initiative!');
    sfx.thunk();
    await wait(500);
    await c.start(monsters, surprised);
    this.refresh();
    const outcome = await c.run();
    this.view.clearMarks();
    this.combat = null;
    if (outcome === 'victory') await this.victory(group, monsters);
    else await this.defeat(group);
  }

  private async victory(group: 'den' | 'crypt', monsters: Creature[]): Promise<void> {
    this.mode = 'explore';
    for (const c of this.s.party) {
      if (!c.death.dead && c.hp <= 0) { c.death.stable = true; }
      for (const k of ['blessed', 'dodging', 'hidden', 'sapped', 'guided', 'shielded', 'slowed', 'vexed', 'aimed', 'frightened', 'prone'] as const) delete c.conds[k];
      c.concentration = undefined;
    }
    const xp = monsters.filter((m) => m.hp <= 0).reduce((s, m) => s + m.xpValue, 0);
    const living = this.s.party.filter((c) => !c.death.dead);
    const each = Math.floor(xp / Math.max(1, living.length));
    for (const c of living) c.xp += each;
    this.hud.log(`Victory! +${each} XP each from the fight.`, 'good');
    sfx.level();
    if (group === 'den') {
      this.s.den = 'defeated';
      this.award('den', 175, 'Defeated Snikk\'s gang');
      const stash = this.s.objects.find((o) => o.id === 'stash')!;
      if (stash.locked) { stash.locked = false; this.hud.log('Snikk\'s key ring opens his stash. On it hangs a black iron key.', 'good'); }
      if (!this.s.inv.keys.includes('crypt-key')) this.s.inv.keys.push('crypt-key');
      this.hud.toast('Victory!');
      this.refresh();
      this.exploreDock();
      this.save();
      return;
    }
    // Boss defeated: the end of the delve.
    this.s.bossDone = true;
    this.refresh();
    this.save();
    await wait(600);
    this.mode = 'end';
    const fallen = this.s.party.filter((c) => c.death.dead).map((c) => c.name);
    const denLine: Record<string, string> = {
      ally: 'You made a pact with Snikk, and kept it.', toll: 'You paid the goblins\' price and passed in peace.', fled: 'You frightened the goblins out of their own den.',
      defeated: 'You cut through Snikk\'s gang.', sneaked: 'The goblins never knew you were there.', hostile: 'The goblins fought you.', unaware: '',
    };
    this.hud.endScreen({
      title: 'The Candle Burns Brighter', emblem: true,
      text: 'The Ash Warden crumbles to cinders and the violet fire dies. Somewhere above, the Last Candle flares white.',
      lines: [denLine[this.s.den] ?? '', `Party level ${Math.max(...living.map((c) => c.level))} · ${living[0]?.xp ?? 0} XP each.`, fallen.length ? `Fallen: ${fallen.join(', ')}.` : 'Everyone made it out alive.'].filter(Boolean),
      buttons: [
        { label: 'Gather a new party', primary: true, onTap: () => this.hooks.onNewParty() },
        { label: 'Back to title', onTap: () => this.hooks.onQuit() },
      ],
    });
  }

  private async defeat(group: 'den' | 'crypt'): Promise<void> {
    this.mode = 'end';
    sfx.death();
    const why = group === 'den'
      ? 'Snikk\'s gang overwhelmed you. Four blades and a bow are a lot at level 1. Sleep, a parley, or sneaking past might go better.'
      : 'The Ash Warden kept rising while its brazier burned. Douse the brazier first, use bludgeoning weapons, and let the cleric Turn the skeletons.';
    this.hud.endScreen({
      title: 'The Party Falls', text: why,
      buttons: [
        { label: 'Try again from the last checkpoint', primary: true, onTap: () => this.hooks.onReload() },
        { label: 'Gather a new party', onTap: () => this.hooks.onNewParty() },
      ],
    });
  }

  // ---------- Combat UI ----------
  // Action first: pick what to do from the dock menus, then tap a target on the map.
  // The squares the action can reach light up and valid targets get a gold ring with their odds.

  private renderCombat(): void {
    const c = this.combat;
    if (!c || this.mode !== 'combat') return;
    const cur = c.current;
    const mine = c.isPlayerTurn() && !c.busy && !this.busy;
    this.view.setActive(cur?.id ?? null);
    if (cur?.kind === 'pc') {
      const i = this.s.party.indexOf(cur);
      if (i >= 0 && this.s.leader !== i) { this.s.leader = i; }
    }
    this.hud.renderParty(this.s.party, this.s.leader, cur?.id ?? null);
    const aimName = this.target?.kind === 'aim' ? `${this.target.aim.label}: tap a target` : this.target?.kind === 'area' ? `${SPELLS[this.target.spell].name}: tap where to aim` : null;
    this.hud.setTurnbar(cur ? {
      name: mine && aimName ? aimName : `${cur.name}'s turn`, move: Math.max(0, c.turn.moveLeft), actions: c.turn.actions, bonus: c.turn.bonus,
      reaction: !c.reactionUsed.has(cur.id), round: c.round,
    } : null);
    this.hud.setOrder(this.turnOrder());
    this.hud.dockFor = mine && cur ? this.ownerOf(cur) : null;
    if (mine && cur) this.hud.decider = this.ownerOf(cur);
    if (!mine || !cur) {
      this.view.clearMarks();
      this.hud.setDock([{ id: 'wait', label: cur && cur.kind !== 'pc' ? `${cur.name.split(',')[0]} acts…` : 'Wait…', icon: 'end_turn', off: true, onTap: () => {} }]);
      return;
    }
    if (this.target) {
      this.showTargetMarks(cur);
      this.hud.setDock([
        { id: 'cancel', label: 'Cancel', icon: 'close', onTap: () => { this.target = null; this.renderCombat(); } },
      ]);
      if (this.view.following) this.view.focus(cur.pos);
      return;
    }
    this.view.clearMarks();
    this.view.showReach(c.reachable(cur));
    if (this.pendingMove) {
      const path = c.pathFor(cur, this.pendingMove);
      if (path) this.view.showPath(path, cur.pos, `${path.reduce((s, p) => s + (this.w.def.tiles[p.y][p.x] === 'rubble' ? 2 : 1), 0) * 5} ft · tap again`);
    }
    const caster = cur.cantrips.length + cur.spells.length > 0;
    const bonusOpts = this.bonusOptions(cur);
    const actOpts = this.actionOptions(cur);
    const atkOpts = this.attackOptions(cur);
    const noAct = c.turn.actions <= 0;
    const btns: DockBtn[] = [
      { id: 'attack', label: 'Attack', icon: 'attack', cost: 'action', off: noAct || !atkOpts.some((o) => !o.disabled), ready: !noAct && atkOpts.some((o) => !o.disabled), onTap: () => this.guard(() => this.optionMenu(cur, 'Attack', 'Choose how to attack, then tap the target on the map.', atkOpts)) },
      caster ? { id: 'spells', label: 'Spells', icon: 'spell', cost: 'action', count: `${cur.slots[0]}${cur.slotsMax[1] ? `+${cur.slots[1]}` : ''}`, onTap: () => this.guard(() => this.optionMenu(cur, `${cur.name}'s spells`, `Slots: ${cur.slots[0]}/${cur.slotsMax[0]} 1st${cur.slotsMax[1] ? `, ${cur.slots[1]}/${cur.slotsMax[1]} 2nd` : ''} · spell save DC ${spellDC(cur)} · spell attack ${fmtMod(spellAttack(cur))}. Choose a spell, then tap its target on the map.`, this.spellOptions(cur))) } : null,
      { id: 'actions', label: 'Actions', icon: 'dodge', cost: 'action', off: noAct || !actOpts.some((o) => !o.disabled), onTap: () => this.guard(() => this.optionMenu(cur, 'Actions', undefined, actOpts)) },
      { id: 'bonus', label: 'Bonus', icon: 'bonus', cost: 'bonus', off: !bonusOpts.some((o) => !o.disabled), ready: bonusOpts.some((o) => !o.disabled), onTap: () => this.guard(() => this.optionMenu(cur, 'Bonus actions', undefined, bonusOpts)) },
      { id: 'end', label: 'End turn', icon: 'end_turn', cls: 'endturn', onTap: () => { this.target = null; this.pendingMove = null; this.view.clearMarks(); c.endPlayerTurn(); } },
    ].filter(Boolean) as DockBtn[];
    this.hud.setDock(btns);
    if (!this.view.following) return;
    this.view.focus(cur.pos);
  }

  /** Initiative order from the current creature onwards; unseen enemies are left out. */
  private turnOrder() {
    const c = this.combat;
    if (!c || !c.order.length) return null;
    const n = c.order.length;
    const init = new Map(c.initiativeRolls.map((r) => [r.c.id, r.total]));
    const out = [];
    for (let k = 0; k < n; k++) {
      const x = c.order[(c.idx + k) % n];
      const gone = x.kind === 'pc' ? x.death.dead : x.hp <= 0;
      if (gone) continue;
      if (x.faction !== 'party' && !this.visibleNow(x.pos)) continue;
      out.push({ id: x.id, name: x.name, token: x.token, init: init.get(x.id) ?? 0, current: k === 0, foe: x.faction !== 'party', down: x.hp <= 0 || !canAct(x) });
    }
    return out;
  }

  /** Squares within `range` that `cur` could target (line of sight unless melee). */
  private rangeCells(cur: Creature, range: number, melee: boolean): number[] {
    const c = this.combat!;
    const { w: W, h: H } = this.w.def;
    const out: number[] = [];
    for (let y = Math.max(0, cur.pos.y - range); y <= Math.min(H - 1, cur.pos.y + range); y++) {
      for (let x = Math.max(0, cur.pos.x - range); x <= Math.min(W - 1, cur.pos.x + range); x++) {
        if (x === cur.pos.x && y === cur.pos.y) continue;
        if (this.w.def.tiles[y][x] === 'wall') continue;
        if (!this.s.seen[y * W + x]) continue;
        if (c.reachWhy(cur, { x, y }, range, melee) === null) out.push(y * W + x);
      }
    }
    return out;
  }

  private showTargetMarks(cur: Creature): void {
    const c = this.combat!;
    const t = this.target!;
    this.view.clearMarks();
    if (t.kind === 'area') {
      const s = SPELLS[t.spell];
      const color = s.dmgType === 'fire' ? PAL.ember : PAL.arcane;
      this.view.showRange(this.rangeCells(cur, s.target === 'cone' ? 1 : s.range, s.target === 'cone'), color);
      if (t.preview) this.view.showArea(s.target === 'cone' ? c.coneSquares(cur, t.preview, s.size!) : c.sphereSquares(t.preview, s.size!), color);
      return;
    }
    const a = t.aim;
    this.view.showRange(this.rangeCells(cur, a.range, a.melee), a.color);
    this.view.showTargets(a.pool().filter((x) => x.faction === 'party' || this.visibleNow(x.pos)).map((x) => {
      const why = this.aimWhy(cur, a, x);
      return { pos: x.pos, ok: why === null, label: why === null ? a.odds?.(x) : undefined };
    }));
  }

  /** Null if `x` is a valid target for the aimed action, else a plain-language reason. */
  private aimWhy(cur: Creature, a: Aim, x: Creature): string | null {
    const c = this.combat!;
    if (!a.pool().some((p) => p.id === x.id)) return a.wrongKind ?? 'Not a valid target for that';
    if (x.faction !== 'party' && !this.visibleNow(x.pos)) return 'You cannot see it';
    return c.reachWhy(cur, x.pos, a.range, a.melee) ?? a.check?.(x) ?? null;
  }

  /** Tell the acting player why something failed (on their own device in co-op). */
  private tell(msg: string): void {
    sfx.deny();
    if (this.link && this.hud.decider && this.hud.decider !== this.me) this.link.emit({ k: 'toast', text: msg });
    else this.hud.localToast(msg);
    this.hud.log(msg, 'bad');
  }

  private beginAim(a: Aim): void {
    this.target = { kind: 'aim', aim: a };
    this.pendingMove = null;
    this.renderCombat();
  }

  private async combatTap(p: Pos, from: string = this.me): Promise<void> {
    const c = this.combat;
    if (!c || !c.isPlayerTurn() || c.busy) return;
    const cur = c.current;
    if (from !== this.ownerOf(cur)) return;
    this.hud.decider = from;
    const who = creatureAt(this.w, p, [...this.s.party, ...this.s.monsters.filter((m) => m.hp > 0)]) ?? (c.brazier && c.brazier.hp > 0 && c.brazier.pos.x === p.x && c.brazier.pos.y === p.y ? c.brazier : undefined);
    // Aiming an area spell
    if (this.target?.kind === 'area') {
      const t = this.target;
      const s = SPELLS[t.spell];
      if (s.target === 'sphere' && !c.spellInRange(cur, s, p)) { this.tell(c.reachWhy(cur, p, Math.max(1, s.range)) ?? 'Out of reach'); return; }
      if (t.preview && t.preview.x === p.x && t.preview.y === p.y) {
        this.target = null;
        await this.act(() => c.cast(cur, t.spell, p));
      } else { t.preview = p; this.renderCombat(); if (!t.preview || true) this.hud.log('Tap the same square again to cast, or another square to re-aim.'); }
      return;
    }
    // Aiming at a creature
    if (this.target?.kind === 'aim') {
      const a = this.target.aim;
      if (!who) { this.target = null; this.hud.localToast('Cancelled'); this.renderCombat(); return; }
      const why = this.aimWhy(cur, a, who);
      if (why) { this.tell(why); return; }
      this.target = null;
      await this.act(() => a.run(who));
      return;
    }
    // Nothing chosen: creatures show their info, floor squares move.
    if (who) {
      if (who.faction === 'party') this.hud.showCharacter(who);
      else if (this.visibleNow(who.pos)) this.inspect(who);
      return;
    }
    const cost = c.reachable(cur);
    const i = p.y * this.w.def.w + p.x;
    if (!isFinite(cost[i])) { sfx.deny(); this.pendingMove = null; this.renderCombat(); return; }
    if (this.pendingMove && this.pendingMove.x === p.x && this.pendingMove.y === p.y) {
      const path = c.pathFor(cur, p);
      this.pendingMove = null;
      if (path) await this.act(() => c.moveAlong(cur, path));
    } else { this.pendingMove = p; this.renderCombat(); }
  }

  private async act(fn: () => Promise<unknown>): Promise<void> {
    const c = this.combat!;
    c.busy = true;
    this.busy = true;
    this.view.clearMarks();
    try { await fn(); } finally {
      c.busy = false;
      this.busy = false;
      this.refresh();
    }
  }

  // ----- option lists (no enemies in here: targets are picked on the map) -----

  private foes(cur: Creature, withBrazier = false): Creature[] {
    const c = this.combat!;
    return [...c.enemiesOf(cur), ...(withBrazier && c.brazier && c.brazier.hp > 0 ? [c.brazier] : [])];
  }

  /** Make an option that starts aiming, disabled with a reason when nothing is in reach. */
  private aimOption(cur: Creature, base: Omit<SheetOption<() => Promise<unknown>>, 'value'>, a: Aim, cost: string | undefined): SheetOption<() => Promise<unknown>> {
    const any = a.pool().some((x) => this.aimWhy(cur, a, x) === null);
    return {
      ...base,
      value: async () => this.beginAim(a),
      disabled: cost ?? (any ? undefined : a.none),
    };
  }

  attackOptions(cur: Creature): SheetOption<() => Promise<unknown>>[] {
    const c = this.combat!;
    const out: SheetOption<() => Promise<unknown>>[] = [];
    const noAct = c.turn.actions <= 0 ? 'No action left this turn' : undefined;
    for (const w of cur.weapons) {
      const reach = w.melee ? w.range : w.long ?? w.range;
      const a: Aim = {
        label: w.name, range: reach, melee: w.melee, color: PAL.goldUi,
        pool: () => this.foes(cur, true),
        none: w.melee ? `No enemy next to ${cur.name}: move up first` : `No enemy ${cur.name} can see within ${reach * 5} ft`,
        odds: (t) => {
          const rng = c.weaponInRange(cur, w, t);
          const p = chance(weaponToHit(cur, w), armorClass(t), c.previewAdv(cur, t, w.melee, rng === 'long'));
          return `${Math.round(p * 100)}%`;
        },
        run: (t) => c.actAttack(cur, t, w),
      };
      const how = w.melee ? `Melee: hit a creature next to you` : `Ranged: up to ${w.range * 5} ft (to ${reach * 5} ft at disadvantage)`;
      const extra = w.mastery === 'sap' ? ' A hit makes its next attack worse (Sap).' : w.mastery === 'vex' ? ' A hit makes your next attack on it easier (Vex).' : w.mastery === 'slow' ? ' A hit slows it by 10 ft (Slow).' : '';
      const sneak = sneakText(cur, w);
      out.push(this.aimOption(cur, { label: w.name, icon: w.melee ? 'attack' : 'ranged', sub: `${how}. ${fmtMod(weaponToHit(cur, w))} to hit, ${weaponDamageExpr(cur, w)} ${w.type} damage.${extra}${sneak}` }, a, noAct));
    }
    for (const sid of cur.cantrips.concat(cur.spells)) {
      const s = SPELLS[sid];
      if (!(s.target === 'enemy' || s.target === 'any')) continue;
      const can = c.canCast(cur, s);
      out.push(this.aimOption(cur, { label: `${s.name}${s.level ? '' : ' · cantrip'}`, icon: s.icon, sub: plainSpell(s, cur), odds: s.level ? (s.level === 1 ? '1st' : '2nd') : 'free' }, this.spellAim(cur, s), can.ok ? undefined : can.why));
    }
    if (this.s.inv.phial > 0) {
      out.push(this.aimOption(cur, { label: 'Throw the Ember Phial', icon: 'turn_undead', sub: 'Up to 20 ft. Holy light: 3d6 radiant damage on a hit, and it snuffs the Binding Brazier instantly. One use.' }, {
        label: 'Ember Phial', range: 4, melee: false, color: PAL.goldUi, pool: () => this.foes(cur, true), none: 'No target within 20 ft',
        odds: (t) => (t.monsterId === 'brazier' ? 'Douse' : `${Math.round(chance(mod(cur, 'dex') + prof(cur), armorClass(t)) * 100)}%`),
        run: (t) => c.actPhial(cur, t),
      }, noAct));
    }
    return out;
  }

  private spellAim(cur: Creature, s: SpellDef): Aim {
    const c = this.combat!;
    const ally = s.target === 'ally';
    const melee = s.range <= 1;
    return {
      label: s.name, range: Math.max(1, s.range), melee, color: ally ? PAL.verdigris : PAL.arcane,
      pool: () => (ally ? c.alliesOf(cur) : this.foes(cur, s.target === 'any')),
      wrongKind: ally ? `${s.name} only works on allies` : `${s.name} is for enemies`,
      none: ally ? (melee ? `No ally next to ${cur.name}` : `No ally within ${s.range * 5} ft`) : `No enemy ${cur.name} can see within ${s.range * 5} ft`,
      odds: (t) => {
        if (ally) return t.hp <= 0 ? 'Revive' : `${t.hp}/${t.maxHp}`;
        if (t.immune.includes(s.dmgType!)) return 'Immune';
        if (s.id === 'magic-missile') return 'Hits';
        if (s.attack) return `${Math.round(chance(spellAttack(cur), armorClass(t), c.previewAdv(cur, t, false, false)) * 100)}%`;
        if (s.save) return `${Math.round((1 - chance(t.saveFixed?.[s.save] ?? mod(t, s.save), spellDC(cur))) * 100)}%`;
        return '';
      },
      run: (t) => c.cast(cur, s.id, t),
    };
  }

  private spellOptions(cur: Creature): SheetOption<() => Promise<unknown>>[] {
    const c = this.combat!;
    return cur.cantrips.concat(cur.spells).map((sid) => {
      const s = SPELLS[sid];
      const can = c.canCast(cur, s);
      const base = { label: `${s.name}${s.level ? '' : ' · cantrip'}`, icon: s.icon, sub: plainSpell(s, cur), odds: s.level ? (s.level === 1 ? '1st' : '2nd') : 'free' };
      if (s.cast === 'reaction') return { ...base, value: async () => {}, disabled: 'Cast automatically when you are hit' };
      if (s.target === 'enemy' || s.target === 'any' || s.target === 'ally') return this.aimOption(cur, base, this.spellAim(cur, s), can.ok ? undefined : can.why);
      if (s.target === 'sphere' || s.target === 'cone') {
        return { ...base, disabled: can.ok ? undefined : can.why, value: async () => { this.target = { kind: 'area', spell: s.id, preview: null }; this.renderCombat(); } };
      }
      return { ...base, disabled: can.ok ? undefined : can.why, value: () => c.cast(cur, s.id, null) };
    });
  }

  private actionOptions(cur: Creature): SheetOption<() => Promise<unknown>>[] {
    const c = this.combat!;
    const noAct = c.turn.actions <= 0 ? 'No action left' : undefined;
    const out: SheetOption<() => Promise<unknown>>[] = [
      { label: 'Dash', icon: 'dash', sub: `Move another ${cur.speed} ft this turn.`, value: () => c.actDash(cur), disabled: noAct },
      { label: 'Disengage', icon: 'disengage', sub: 'Walk away from enemies this turn without them getting a free swing at you.', value: () => c.actDisengage(cur), disabled: noAct },
      { label: 'Dodge', icon: 'dodge', sub: 'Until your next turn, attacks against you are harder (disadvantage).', value: () => c.actDodge(cur), disabled: noAct },
      { label: 'Hide', icon: 'hide', sub: 'Roll Stealth vs 15. If hidden, your next attack is easier (advantage).', value: () => c.actHide(cur), disabled: noAct ?? (c.canHide(cur) ? undefined : 'Not while an enemy is next to you') },
    ];
    if (cur.classId === 'cleric' && cur.level >= 2) {
      out.push({ label: 'Turn Undead', icon: 'turn_undead', sub: `Every undead within 30 ft must resist (WIS vs ${spellDC(cur)}) or flee in terror until hurt. ${cur.res.channel} use(s) left.`, value: () => c.actTurnUndead(cur), disabled: noAct ?? (cur.res.channel > 0 ? undefined : 'No Channel Divinity left') });
      out.push(this.aimOption(cur, { label: 'Divine Spark', icon: 'turn_undead', sub: `Within 30 ft: heal an ally 1d8+${mod(cur, 'wis')}, or burn an enemy for the same (it can resist for half).` }, {
        label: 'Divine Spark', range: 6, melee: false, color: PAL.goldUi, pool: () => [...c.alliesOf(cur), ...c.enemiesOf(cur)], none: 'Nobody within 30 ft',
        odds: (t) => (t.faction === 'party' ? 'Heal' : 'Burn'), run: (t) => c.actDivineSpark(cur, t),
      }, noAct ?? (cur.res.channel > 0 ? undefined : 'No Channel Divinity left')));
    }
    out.push(this.aimOption(cur, { label: 'Stabilise', icon: 'heal', sub: 'Steady a dying ally next to you so they stop making death saves (WIS check, DC 10).' }, {
      label: 'Stabilise', range: 1, melee: true, color: PAL.verdigris,
      pool: () => c.alliesOf(cur).filter((a) => a.hp <= 0 && !a.death.stable && !a.death.dead), none: 'No dying ally next to you',
      wrongKind: 'Only a dying ally can be stabilised', odds: () => `${Math.round(chance(checkBonus(cur, 'wis'), 10) * 100)}%`,
      run: (t) => c.actStabilize(cur, t),
    }, noAct));
    if (c.brazier && c.brazier.hp > 0) {
      const dc = 13 + (this.s.omen.omen.mods.brazierDC ?? 0);
      const br = (how: 'arcana' | 'athletics', label: string, kind: 'arcana' | 'athletics', d: number) => this.aimOption(cur,
        { label, icon: kind === 'arcana' ? 'int' : 'str', sub: `Stand next to the Binding Brazier. ${kind === 'arcana' ? 'Arcana' : 'Athletics'} ${fmtMod(checkBonus(cur, kind))} vs DC ${d}. Puts out the fire that heals the Warden.` },
        { label, range: 1, melee: true, color: PAL.goldUi, pool: () => [c.brazier!], none: 'Move next to the brazier first', wrongKind: 'Tap the brazier',
          odds: () => `${Math.round(chance(checkBonus(cur, kind), d) * 100)}%`, run: () => c.actDouse(cur, how) }, noAct);
      out.push(br('arcana', 'Unpick the binding', 'arcana', dc), br('athletics', 'Topple the brazier', 'athletics', 15));
    }
    return out;
  }

  private bonusOptions(cur: Creature): SheetOption<() => Promise<unknown>>[] {
    const c = this.combat!;
    const noB = c.turn.bonus ? undefined : 'Bonus action used';
    const out: SheetOption<() => Promise<unknown>>[] = [];
    if (cur.classId === 'fighter') {
      out.push({ label: 'Second Wind', icon: 'second_wind', sub: `Catch your breath: regain 1d10+${cur.level} HP. ${cur.res.secondWind} left.`, value: () => c.actSecondWind(cur), disabled: noB ?? (cur.res.secondWind > 0 ? undefined : 'None left') });
      if (cur.level >= 2) out.push({ label: 'Action Surge', icon: 'surge', sub: 'Free: take one more action this turn. Once per short rest.', value: async () => c.actSurge(cur), disabled: cur.res.actionSurge > 0 && !c.turn.surgeUsed ? undefined : 'Used' });
    }
    if (cur.classId === 'rogue' && cur.level >= 2) {
      out.push({ label: 'Cunning Action: Dash', icon: 'dash', sub: `Move another ${cur.speed} ft.`, value: () => c.actDash(cur, true), disabled: noB });
      out.push({ label: 'Cunning Action: Disengage', icon: 'disengage', sub: 'Slip away without free swings at you.', value: () => c.actDisengage(cur, true), disabled: noB });
      out.push({ label: 'Cunning Action: Hide', icon: 'hide', sub: 'Stealth vs 15; if hidden, your next attack is easier.', value: () => c.actHide(cur, true), disabled: noB ?? (c.canHide(cur) ? undefined : 'Enemy adjacent') });
    }
    if (cur.classId === 'rogue' && cur.level >= 3) out.push({ label: 'Steady Aim', icon: 'steady_aim', sub: 'Your next attack this turn is easier, but you cannot move.', value: async () => c.actSteadyAim(cur), disabled: noB ?? (c.turn.moved ? 'Already moved' : undefined) });
    if (cur.spells.includes('healing-word')) {
      const s = SPELLS['healing-word'];
      const can = c.canCast(cur, s);
      out.push(this.aimOption(cur, { label: 'Healing Word', icon: 'heal', sub: plainSpell(s, cur) }, this.spellAim(cur, s), noB ?? (can.ok ? undefined : can.why)));
    }
    if (this.s.inv.potions > 0) {
      out.push(this.aimOption(cur, { label: 'Potion of Healing', icon: 'potion', sub: `Drink it yourself or pour it for an ally next to you: 2d4+2 HP. ${this.s.inv.potions} left.` }, {
        label: 'Potion', range: 1, melee: true, color: PAL.verdigris, pool: () => c.alliesOf(cur), none: 'Nobody to give it to',
        wrongKind: 'Potions are for allies', odds: (t) => (t.id === cur.id ? 'Drink' : `${t.hp}/${t.maxHp}`), run: (t) => c.actPotion(cur, t),
      }, noB));
    }
    if (!out.length) out.push({ label: 'No bonus actions yet', value: async () => {}, disabled: `${CLASSES[cur.classId!].name}s gain bonus actions at higher levels`, icon: 'bonus' });
    return out;
  }

  private async optionMenu(cur: Creature, title: string, lead: string | undefined, opts: SheetOption<() => Promise<unknown>>[]): Promise<void> {
    const r = await this.hud.sheet({ title, lead: lead ?? `${cur.name} · ${this.combat!.turn.moveLeft * 5} ft of movement left`, options: opts });
    if (!r) return;
    this.busy = false;
    await this.act(r.value);
    this.busy = true;
  }
}

interface Aim {
  label: string;
  /** Reach in squares. */
  range: number;
  /** Melee reach ignores line of sight beyond adjacency. */
  melee: boolean;
  color: number;
  /** Creatures this action can be used on. */
  pool: () => Creature[];
  /** Reason shown when nothing in the pool is in reach. */
  none: string;
  /** Reason shown when tapping something outside the pool. */
  wrongKind?: string;
  check?: (t: Creature) => string | null;
  /** Label above each valid target, e.g. hit chance. */
  odds?: (t: Creature) => string;
  run: (t: Creature) => Promise<unknown>;
}

function sneakText(c: Creature, w: { ability: string; melee: boolean }): string {
  if (c.classId !== 'rogue' || !(w.ability === 'finesse' || !w.melee)) return '';
  return ` Sneak Attack +${Math.ceil(c.level / 2)}d6 when you have advantage or an ally is next to the target.`;
}

/** Spell descriptions in plain language, with this caster's numbers filled in. */
function plainSpell(s: SpellDef, c: Creature): string {
  const ft = `${Math.max(1, s.range) * 5} ft`;
  const dc = spellDC(c), atk = fmtMod(spellAttack(c)), wis = mod(c, 'wis');
  switch (s.id) {
    case 'fire-bolt': return `Hurl fire at an enemy up to ${ft}. You roll ${atk} to hit; 1d10 fire damage. Free, any time.`;
    case 'ray-of-frost': return `An icy beam up to ${ft}. You roll ${atk} to hit; 1d8 cold damage and it moves 10 ft slower. Puts out fires.`;
    case 'sacred-flame': return `Holy fire falls on an enemy up to ${ft}. It must dodge (DEX vs ${dc}) or take 1d8 radiant damage. Armor doesn't help it. Free, any time.`;
    case 'magic-missile': return `Three glowing darts that never miss, up to ${ft}. 1d4+1 force damage each.`;
    case 'burning-hands': return `A 15-ft cone of flame from your hands. Everyone in it dodges (DEX vs ${dc}): 3d6 fire, half if they dodge. Careful with allies.`;
    case 'sleep': return `Pick a spot up to ${ft}: creatures around it resist (WIS vs ${dc}) or fall asleep until hurt. Undead and elves are immune.`;
    case 'shield': return 'When you are hit, a barrier gives +5 AC until your next turn, often turning the hit into a miss. You will be asked.';
    case 'scorching-ray': return `Three rays of fire up to ${ft}, each rolled separately: ${atk} to hit, 2d6 fire.`;
    case 'cure-wounds': return `Touch an ally next to you: they regain 2d8+${wis} HP.`;
    case 'healing-word': return `Bonus action. A word of power heals an ally up to ${ft} for 2d4+${wis} HP, enough to get a fallen ally back up.`;
    case 'bless': return 'Up to three allies within 30 ft add 1d4 to attack rolls and saving throws. Lasts while you concentrate.';
    case 'guiding-bolt': return `A bolt of light up to ${ft}: ${atk} to hit, 4d6 radiant, and the next attack on it is easier.`;
    case 'aid': return 'Up to three allies within 30 ft gain 5 extra max and current HP until a long rest.';
    default: return s.text;
  }
}

export { canAct, canSee, inRect };
