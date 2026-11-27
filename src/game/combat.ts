// Grid combat: initiative, move + action + bonus action + reaction, opportunity attacks,
// death saves and conditions. Rules only; all display goes through the Presenter.
import { CONFIG } from '../config';
import { abilityCheck, runTest, savingThrow, type AdvCtx, type TestResult } from '../rules/checks';
import {
  armorClass, canAct, critRange, mod, prof, sneakDice, spellAttack, spellDC, spellMod, speedSquares,
  weaponDamageExpr, weaponToHit, type Creature,
} from '../rules/creature';
import { die, rollD20, rollExpr, combineAdv, type Adv } from '../rules/dice';
import { SPELLS, type SpellDef } from '../rules/spells';
import type { Ability, ConditionId, CondInfo, DamageType, Pos, Weapon } from '../rules/types';
import { canSee, clearShot, floodCosts, pathTo } from './grid';
import type { Presenter } from './presenter';
import { armedTrapAt, dist, type World } from './state';

export interface TurnState {
  moveLeft: number;
  actions: number;
  bonus: boolean;
  moved: boolean;
  sneakUsed: boolean;
  disengaged: boolean;
  slotUsed: boolean;
  surgeUsed: boolean;
}

export type Outcome = 'victory' | 'defeat' | null;

const PHIAL_RANGE = 4;

export class Combat {
  w: World;
  p: Presenter;
  order: Creature[] = [];
  idx = 0;
  round = 1;
  turn: TurnState = this.freshTurn(null);
  reactionUsed = new Set<string>();
  outcome: Outcome = null;
  busy = false;
  participants: Creature[] = [];
  private endTurnResolve: (() => void) | null = null;
  onChange: () => void = () => {};
  /** Headless play: drives player characters instead of waiting for input. */
  pcAuto: ((c: Creature) => Promise<void>) | null = null;
  /** Safety valve for simulations. */
  maxRounds = 60;
  /** Called when a creature steps onto an armed trap. */
  onTrap: ((c: Creature) => Promise<void>) | null = null;
  initiativeRolls: { c: Creature; total: number; roll: number }[] = [];

  constructor(w: World, p: Presenter) {
    this.w = w;
    this.p = p;
  }

  get party(): Creature[] { return this.w.state.party; }
  get current(): Creature { return this.order[this.idx]; }
  get brazier(): Creature | undefined { return this.w.state.monsters.find((m) => m.monsterId === 'brazier'); }

  enemiesOf(c: Creature): Creature[] {
    const foes = c.faction === 'party' ? this.participants.filter((m) => m.faction !== 'party' && m.faction !== 'object') : this.party;
    return foes.filter((f) => (f.kind === 'pc' ? !f.death.dead : f.hp > 0));
  }
  alliesOf(c: Creature): Creature[] {
    const list = c.faction === 'party' ? this.party : this.participants.filter((m) => m.faction === c.faction);
    return list.filter((f) => (f.kind === 'pc' ? !f.death.dead : f.hp > 0));
  }
  allAlive(): Creature[] {
    return [...this.party.filter((c) => !c.death.dead), ...this.participants.filter((m) => m.hp > 0)];
  }

  private freshTurn(c: Creature | null): TurnState {
    return {
      moveLeft: c ? speedSquares(c) : 0, actions: 1, bonus: true, moved: false,
      sneakUsed: false, disengaged: false, slotUsed: false, surgeUsed: false,
    };
  }

  // ---------- Start ----------

  async start(monsters: Creature[], surprised: 'party' | 'enemies' | null): Promise<void> {
    this.participants = monsters;
    const fighters = [...this.party.filter((c) => !c.death.dead), ...monsters.filter((m) => m.faction !== 'object' && m.hp > 0)];
    const rolls: TestResult[] = [];
    this.initiativeRolls = fighters.map((c) => {
      const isSurprised = (surprised === 'party' && c.faction === 'party') || (surprised === 'enemies' && c.faction !== 'party');
      const r = runTest(c, 'Initiative', mod(c, 'dex'), 0, 'DC', { dis: isSurprised ? ['Surprised'] : [] });
      if (c.kind === 'pc') rolls.push(r);
      return { c, total: r.total, roll: r.d20.kept };
    });
    this.initiativeRolls.sort((a, b) => b.total - a.total || mod(b.c, 'dex') - mod(a.c, 'dex') || (a.c.kind === 'pc' ? -1 : 1));
    this.order = this.initiativeRolls.map((r) => r.c);
    await this.p.rolls(rolls, surprised === 'enemies' ? 'Initiative: they never saw you coming' : surprised === 'party' ? 'Initiative: ambushed!' : 'Roll initiative');
    this.p.log(`Initiative: ${this.initiativeRolls.map((r) => `${r.c.name} ${r.total}`).join(', ')}`, 'roll');
    this.idx = 0;
    this.round = 1;
  }

  /** Main loop. Resolves when the fight is over. */
  async run(): Promise<Outcome> {
    while (!this.outcome) {
      const c = this.current;
      if (c && this.isInFight(c)) {
        const acts = await this.beginTurn(c);
        if (this.checkEnd()) break;
        if (acts) {
          if (c.kind === 'pc' && this.pcAuto) {
            await this.pcAuto(c);
          } else if (c.kind === 'pc') {
            await new Promise<void>((res) => { this.endTurnResolve = res; this.onChange(); });
          } else {
            await this.aiTurn(c);
          }
        }
        if (this.checkEnd()) break;
        await this.endTurn(c);
        if (this.checkEnd()) break;
      }
      this.idx++;
      if (this.idx >= this.order.length) { this.idx = 0; this.round++; if (this.round > this.maxRounds) { this.outcome = 'defeat'; break; } }
    }
    this.onChange();
    return this.outcome;
  }

  isInFight(c: Creature): boolean {
    return c.kind === 'pc' ? !c.death.dead : c.hp > 0;
  }

  isPlayerTurn(): boolean {
    return !this.outcome && !!this.endTurnResolve && this.current?.kind === 'pc';
  }

  endPlayerTurn(): void {
    const r = this.endTurnResolve;
    this.endTurnResolve = null;
    r?.();
  }

  checkEnd(): boolean {
    if (this.outcome) return true;
    const foes = this.participants.filter((m) => m.faction !== 'object' && m.hp > 0);
    if (foes.length === 0) { this.outcome = 'victory'; return true; }
    if (this.party.every((c) => c.hp <= 0)) { this.outcome = 'defeat'; return true; }
    return false;
  }

  // ---------- Turn structure ----------

  private expire(c: Creature, when: 'start' | 'end'): void {
    for (const x of this.allAlive().concat(this.participants)) {
      for (const [k, info] of Object.entries(x.conds) as [ConditionId, CondInfo][]) {
        if (info?.expires && info.expires.who === c.id && info.expires.when === when) delete x.conds[k];
      }
    }
  }

  async beginTurn(c: Creature): Promise<boolean> {
    this.turn = this.freshTurn(c);
    this.reactionUsed.delete(c.id);
    this.expire(c, 'start');
    delete c.conds.dodging;
    this.onChange();

    if (c.kind === 'pc' && c.hp <= 0) {
      if (!c.death.stable && !c.death.dead) await this.deathSave(c);
      this.p.refresh();
      return false;
    }
    if (c.monsterId === 'ash-warden') {
      const b = this.brazier;
      if (b && b.hp > 0 && c.hp < c.maxHp) {
        const regen = 6 + (this.w.state.omen.omen.mods.regen ?? 0);
        const amt = Math.min(regen, c.maxHp - c.hp);
        c.hp += amt;
        this.p.heal(c, amt);
        this.p.log(`The brazier's violet fire knits the Warden's bones (+${amt} HP).`, 'bad');
        await this.p.pause(350);
      }
      if (!c.res.dreadGaze && die(6) >= 5) c.res.dreadGaze = true;
    }
    if (!canAct(c)) {
      if (c.conds.asleep) this.p.log(`${c.name} sleeps.`);
      else if (c.conds.turned) this.p.log(`${c.name} cowers from the holy light.`);
      return false;
    }
    if (c.conds.prone && c.kind === 'monster') {
      delete c.conds.prone;
      this.turn.moveLeft = Math.floor(this.turn.moveLeft / 2);
    }
    return true;
  }

  async endTurn(c: Creature): Promise<void> {
    this.expire(c, 'end');
    for (const [k, info] of Object.entries(c.conds) as [ConditionId, CondInfo][]) {
      if (info?.saveEnds && c.hp > 0) {
        const r = savingThrow(c, info.saveEnds.ability, info.saveEnds.dc, k);
        await this.p.roll(r, `to shake off ${k}`);
        if (r.success) { delete c.conds[k]; this.p.log(`${c.name} is no longer ${k}.`, 'info'); }
      }
    }
    this.onChange();
  }

  async deathSave(c: Creature): Promise<void> {
    const d = rollD20('normal', c.species === 'halfling');
    const r: TestResult = {
      who: c.name, whoId: c.id, label: 'Death save', d20: d, bonus: 0, extras: [], total: d.kept, target: 10,
      targetKind: 'DC', success: d.kept >= 10, crit: d.kept === 20, fumble: d.kept === 1, advReasons: [], disReasons: [],
    };
    await this.p.roll(r);
    if (d.kept === 20) {
      c.hp = 1;
      c.death = { s: 0, f: 0, stable: false, dead: false };
      delete c.conds.unconscious;
      this.p.log(`${c.name} gasps back to consciousness!`, 'good');
      this.p.heal(c, 1);
      return;
    }
    if (d.kept >= 10) c.death.s++;
    else c.death.f += d.kept === 1 ? 2 : 1;
    if (c.death.f >= 3) {
      c.death.dead = true;
      this.p.log(`${c.name} has died.`, 'bad');
      this.p.shake(6);
    } else if (c.death.s >= 3) {
      c.death.stable = true;
      this.p.log(`${c.name} is stable, unconscious but alive.`, 'info');
    } else {
      this.p.log(`${c.name}: death saves ${c.death.s}✓ ${c.death.f}✗`, d.kept >= 10 ? 'info' : 'bad');
    }
  }

  /** Undead cannot enter the Last Candle's light (the shrine). */
  forbidFor(c: Creature): ((p: Pos) => boolean) | undefined {
    if (!c.undead) return undefined;
    const shrine = this.w.def.rooms.find((r) => r.safe);
    if (!shrine) return undefined;
    const r = shrine.rect;
    return (p) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
  }

  // ---------- Queries for the UI ----------

  reachable(c: Creature): Float32Array {
    let left = this.turn.moveLeft;
    if (c.conds.prone) left = Math.floor(left - speedSquares(c) / 2);
    const allies = this.alliesOf(c).filter((a) => a.id !== c.id);
    const blockers = this.allAlive().filter((a) => a.id !== c.id);
    const { cost } = floodCosts(this.w, c.pos, { blockers, passThrough: allies, maxCost: Math.max(0, left) });
    const fear = c.conds.frightened?.source ? this.allAlive().find((x) => x.id === c.conds.frightened!.source) : undefined;
    if (fear) {
      const W = this.w.def.w;
      const d0 = dist(c.pos, fear.pos);
      for (let i = 0; i < cost.length; i++) if (isFinite(cost[i]) && dist({ x: i % W, y: (i / W) | 0 }, fear.pos) < d0) cost[i] = Infinity;
    }
    return cost;
  }

  pathFor(c: Creature, goal: Pos): Pos[] | null {
    const allies = this.alliesOf(c).filter((a) => a.id !== c.id);
    const blockers = this.allAlive().filter((a) => a.id !== c.id);
    return pathTo(this.w, c.pos, goal, { blockers, passThrough: allies });
  }

  hostileAdjacent(c: Creature): Creature[] {
    return this.enemiesOf(c).filter((e) => e.hp > 0 && canAct(e) && dist(e.pos, c.pos) <= 1);
  }

  weaponInRange(c: Creature, w: Weapon, t: Creature): 'normal' | 'long' | null {
    const d = dist(c.pos, t.pos);
    if (w.melee) return d <= w.range ? 'normal' : null;
    if (!clearShot(this.w, c.pos, t.pos)) return null;
    if (d <= w.range) return 'normal';
    if (w.long && d <= w.long) return 'long';
    return null;
  }

  spellInRange(c: Creature, s: SpellDef, t: Pos): boolean {
    return this.reachWhy(c, t, Math.max(1, s.range)) === null;
  }

  /** Null if `t` is within `range` squares with a clear line; otherwise a plain-language reason. */
  reachWhy(c: Creature, t: Pos, range: number, melee = false): string | null {
    const d = dist(c.pos, t);
    if (melee) return d <= range ? null : `Not next to it: move adjacent first (${d * 5} ft away)`;
    if (d > range) return `Too far: ${d * 5} ft away, reach is ${range * 5} ft`;
    if (!clearShot(this.w, c.pos, t)) return `${c.name} can't see it from here: a wall or door is in the way`;
    return null;
  }

  /** Advantage/disadvantage reasons for an attack. */
  attackMods(a: Creature, t: Creature, melee: boolean, longRange: boolean): AdvCtx {
    const adv: string[] = [];
    const dis: string[] = [];
    const extras: { label: string; value: number }[] = [];
    const d = dist(a.pos, t.pos);
    if (a.conds.hidden) adv.push('Unseen attacker');
    if (a.conds.aimed) adv.push('Steady Aim');
    if (t.conds.guided) adv.push('Guiding Bolt');
    if (t.conds.vexed && t.conds.vexed.source === a.id) adv.push('Vex');
    if (t.conds.unconscious || t.conds.asleep || t.conds.turned) adv.push(t.conds.turned ? 'Target incapacitated' : 'Target unconscious');
    if (t.conds.prone && !(t.conds.unconscious || t.conds.asleep)) (melee && d <= 1 ? adv : dis).push('Target prone');
    if (t.conds.dodging && canAct(t)) dis.push('Target dodging');
    if (a.conds.prone) dis.push('Prone');
    if (a.conds.poisoned) dis.push('Poisoned');
    if (a.conds.frightened) dis.push('Frightened');
    if (a.conds.sapped) dis.push('Sapped');
    if (!melee && this.hostileAdjacent(a).length > 0) dis.push('Enemy adjacent');
    if (longRange) dis.push('Long range');
    if (a.conds.blessed) extras.push({ label: 'Bless', value: die(4) });
    return { adv, dis, extras };
  }

  previewAdv(a: Creature, t: Creature, melee: boolean, longRange: boolean): Adv {
    const m = this.attackMods(a, t, melee, longRange);
    return combineAdv((m.adv ?? []).length > 0, (m.dis ?? []).length > 0);
  }

  canSneak(a: Creature, t: Creature, w: Weapon | null, adv: Adv): boolean {
    if (!w || sneakDice(a) === 0 || this.turn.sneakUsed) return false;
    if (!(w.ability === 'finesse' || !w.melee)) return false;
    if (adv === 'disadvantage') return false;
    if (adv === 'advantage') return true;
    return this.alliesOf(a).some((al) => al.id !== a.id && al.hp > 0 && canAct(al) && dist(al.pos, t.pos) <= 1);
  }

  // ---------- Damage, healing, conditions ----------

  addCond(t: Creature, k: ConditionId, info: CondInfo = {}): boolean {
    if (t.condImmune.includes(k)) return false;
    if (k === 'turned' && t.condImmune.includes('turned')) return false;
    t.conds[k] = info;
    return true;
  }

  async damage(t: Creature, amount: number, type: DamageType, crit: boolean, src?: Creature): Promise<number> {
    let dmg = amount;
    let note = '';
    if (t.immune.includes(type)) { dmg = 0; note = 'immune'; }
    else if (t.vuln.includes(type)) { dmg *= 2; note = 'vulnerable!'; }
    else if (t.resist.includes(type)) { dmg = Math.floor(dmg / 2); note = 'resists'; }
    if (dmg <= 0) {
      this.p.float(t.pos, note || '0', 0xcdb98f);
      return 0;
    }
    if (t.tempHp > 0) {
      const soak = Math.min(t.tempHp, dmg);
      t.tempHp -= soak;
      dmg -= soak;
    }
    const before = t.hp;
    this.p.damage(t, dmg, crit, note);
    if (t.kind === 'pc' && before <= 0) {
      if (dmg >= t.maxHp) { t.death.dead = true; this.p.log(`${t.name} is slain outright.`, 'bad'); }
      else {
        t.death.f += crit ? 2 : 1;
        t.death.stable = false;
        if (t.death.f >= 3) { t.death.dead = true; this.p.log(`${t.name} has died.`, 'bad'); }
        else this.p.log(`${t.name} suffers a death save failure.`, 'bad');
      }
      return dmg;
    }
    t.hp = Math.max(0, t.hp - dmg);
    if (t.conds.asleep?.endsOnDamage) { delete t.conds.asleep; this.p.log(`${t.name} wakes up!`); }
    if (t.conds.turned?.endsOnDamage) delete t.conds.turned;
    if (t.hp <= 0) await this.dropToZero(t, dmg - before, src);
    else if (t.concentration) await this.concentrationCheck(t, dmg);
    return dmg;
  }

  private async dropToZero(t: Creature, overflow: number, src?: Creature): Promise<void> {
    this.breakConcentration(t);
    if (t.kind === 'pc') {
      if (overflow >= t.maxHp) {
        t.death.dead = true;
        this.p.log(`${t.name} is slain outright by the blow.`, 'bad');
      } else {
        t.conds = { unconscious: {}, prone: {} };
        t.death = { s: 0, f: 0, stable: false, dead: false };
        this.p.log(`${t.name} falls unconscious!`, 'bad');
      }
      this.p.shake(5);
    } else if (t.monsterId === 'brazier') {
      this.p.log('The Binding Brazier gutters out. The Warden staggers!', 'good');
      await this.p.effect('douse', t.pos, t.pos);
      const warden = this.participants.find((m) => m.monsterId === 'ash-warden');
      if (warden && warden.hp > 0) this.addCond(warden, 'prone', {});
    } else {
      this.p.log(`${t.name} falls${src ? ` to ${src.name}` : ''}.`, 'good');
      this.breakConcentration(t);
      if (t.monsterId === 'ash-warden') this.p.shake(10);
    }
    this.p.refresh();
  }

  async heal(t: Creature, amount: number): Promise<void> {
    if (t.death.dead) return;
    const wasDown = t.hp <= 0;
    const amt = Math.min(amount, t.maxHp - t.hp);
    t.hp += amt;
    if (wasDown && t.hp > 0) {
      delete t.conds.unconscious;
      t.death = { s: 0, f: 0, stable: false, dead: false };
      this.p.log(`${t.name} is back on their feet!`, 'good');
    }
    this.p.heal(t, amt);
  }

  async concentrationCheck(c: Creature, dmg: number): Promise<void> {
    const dc = Math.max(10, Math.floor(dmg / 2));
    const r = savingThrow(c, 'con', dc);
    await this.p.roll(r, `to keep ${SPELLS[c.concentration!.spell].name}`);
    if (!r.success) {
      this.p.log(`${c.name} loses concentration on ${SPELLS[c.concentration!.spell].name}.`, 'bad');
      this.breakConcentration(c);
    }
  }

  breakConcentration(c: Creature): void {
    if (!c.concentration) return;
    const s = SPELLS[c.concentration.spell];
    for (const id of c.concentration.targets) {
      const t = [...this.party, ...this.w.state.monsters].find((x) => x.id === id);
      if (t && s.effect && t.conds[s.effect]?.source === c.id) delete t.conds[s.effect];
    }
    c.concentration = undefined;
  }

  // ---------- Movement ----------

  async moveAlong(c: Creature, path: Pos[]): Promise<void> {
    if (c.conds.prone && path.length) {
      delete c.conds.prone;
      this.turn.moveLeft -= Math.floor(speedSquares(c) / 2);
      this.p.log(`${c.name} stands up.`);
    }
    for (const step of path) {
      const cost = this.w.def.tiles[step.y][step.x] === 'rubble' ? 2 : 1;
      if (cost > this.turn.moveLeft) break;
      // Opportunity attacks from foes we are leaving
      if (!this.turn.disengaged) {
        for (const e of this.enemiesOf(c)) {
          if (e.faction === 'object' || !canAct(e) || this.reactionUsed.has(e.id)) continue;
          const melee = e.weapons.find((w) => w.melee);
          if (!melee) continue;
          if (dist(e.pos, c.pos) <= melee.range && dist(e.pos, step) > melee.range) {
            this.reactionUsed.add(e.id);
            this.p.log(`${e.name} takes an opportunity attack!`, 'bad');
            await this.attack(e, c, melee, { reaction: true });
            if (c.hp <= 0 || !canAct(c)) return;
          }
        }
      }
      await this.p.move(c, [step], CONFIG.STEP_MS);
      c.pos = { ...step };
      this.turn.moveLeft -= cost;
      this.turn.moved = true;
      const trap = armedTrapAt(this.w, step);
      if (trap && c.kind === 'pc') {
        if (this.onTrap) await this.onTrap(c);
        return;
      }
      this.p.refresh();
    }
  }

  // ---------- Attacks ----------

  async attack(a: Creature, t: Creature, w: Weapon, opts: { reaction?: boolean } = {}): Promise<boolean> {
    const range = this.weaponInRange(a, w, t) ?? 'normal';
    const ctx = this.attackMods(a, t, w.melee, range === 'long');
    const advState = combineAdv((ctx.adv ?? []).length > 0, (ctx.dis ?? []).length > 0);
    const r = runTest(a, w.name, weaponToHit(a, w), armorClass(t), 'AC', ctx, critRange(a));
    if (r.success && !r.crit && (t.conds.unconscious || t.conds.asleep) && dist(a.pos, t.pos) <= 1) r.crit = true;
    this.consumeAttackEffects(a, t);
    await this.p.effect(w.melee ? 'slash' : 'arrow', a.pos, t.pos);
    await this.p.roll(r, `vs ${t.name}`);
    if (r.success && !r.crit) {
      const blocked = await this.tryShield(t, r);
      if (blocked) return false;
    }
    if (!r.success) {
      this.p.float(t.pos, 'miss', 0xcdb98f);
      this.p.log(`${a.name} misses ${t.name} (${r.total} vs AC ${r.target}).`);
      return false;
    }
    const expr = weaponDamageExpr(a, w);
    const dr = rollExpr(expr, r.crit);
    let total = dr.total;
    let sneakNote = '';
    if (!opts.reaction && this.canSneak(a, t, w, advState)) {
      const s = rollExpr(`${sneakDice(a)}d6`, r.crit);
      total += s.total;
      this.turn.sneakUsed = true;
      sneakNote = ` + ${s.total} sneak attack`;
    }
    this.p.log(`${a.name} ${r.crit ? 'CRITS' : 'hits'} ${t.name} with ${w.name}: ${total} ${w.type}${sneakNote}.`, a.kind === 'pc' ? 'good' : 'bad');
    if (r.crit) this.p.shake(4);
    if (w.mastery && t.hp > 0) this.applyMastery(a, t, w);
    await this.damage(t, total, w.type, r.crit, a);
    return true;
  }

  private consumeAttackEffects(a: Creature, t: Creature): void {
    delete a.conds.hidden;
    delete a.conds.aimed;
    delete a.conds.sapped;
    delete t.conds.guided;
    if (t.conds.vexed?.source === a.id) delete t.conds.vexed;
  }

  private applyMastery(a: Creature, t: Creature, w: Weapon): void {
    if (w.mastery === 'sap') this.addCond(t, 'sapped', { source: a.id, expires: { who: a.id, when: 'start' } });
    // Vex lasts until the end of the attacker's next turn: expire at its *next* end of turn.
    if (w.mastery === 'vex') this.addCond(t, 'vexed', { source: a.id });
    if (w.mastery === 'slow') this.addCond(t, 'slowed', { source: a.id, expires: { who: a.id, when: 'start' } });
  }

  /** Wizard's Shield reaction. Returns true if it turns a hit into a miss. */
  private async tryShield(t: Creature, r: TestResult): Promise<boolean> {
    if (t.kind !== 'pc' || !t.spells.includes('shield') || this.reactionUsed.has(t.id) || !canAct(t)) return false;
    if (t.slots[0] <= 0 && t.slots[1] <= 0) return false;
    if (r.total >= r.target + 5) return false;
    const yes = await this.p.choose(`${t.name} is hit!`, `${r.total} beats AC ${r.target}. Cast Shield as a reaction for +5 AC (${t.slots[0]} slot${t.slots[0] === 1 ? '' : 's'} left)?`, [
      { label: 'Cast Shield', value: true, primary: true, detail: `AC ${r.target} → ${r.target + 5}` },
      { label: 'Take the hit', value: false },
    ], t);
    if (!yes) return false;
    this.reactionUsed.add(t.id);
    if (t.slots[0] > 0) t.slots[0]--; else t.slots[1]--;
    this.addCond(t, 'shielded', { expires: { who: t.id, when: 'start' } });
    await this.p.effect('force', t.pos, t.pos);
    this.p.float(t.pos, 'SHIELD', 0x8a6bd1);
    this.p.log(`${t.name} snaps up a Shield. The blow glances off (AC ${armorClass(t)}).`, 'good');
    return true;
  }

  // ---------- Player actions ----------

  spendAction(): boolean {
    if (this.turn.actions <= 0) return false;
    this.turn.actions--;
    return true;
  }

  async actAttack(a: Creature, t: Creature, w: Weapon): Promise<void> {
    if (!this.spendAction()) return;
    await this.attack(a, t, w);
    this.after();
  }

  async actDash(a: Creature, bonus = false): Promise<void> {
    if (bonus ? !this.useBonus() : !this.spendAction()) return;
    this.turn.moveLeft += speedSquares(a);
    this.p.log(`${a.name} dashes.`);
    this.after();
  }

  async actDisengage(a: Creature, bonus = false): Promise<void> {
    if (bonus ? !this.useBonus() : !this.spendAction()) return;
    this.turn.disengaged = true;
    this.p.log(`${a.name} disengages.`);
    this.after();
  }

  async actDodge(a: Creature): Promise<void> {
    if (!this.spendAction()) return;
    this.addCond(a, 'dodging', { expires: { who: a.id, when: 'start' } });
    this.p.log(`${a.name} takes the Dodge action.`);
    this.after();
  }

  canHide(a: Creature): boolean {
    return this.hostileAdjacent(a).length === 0 && !a.conds.hidden;
  }

  async actHide(a: Creature, bonus = false): Promise<void> {
    if (!this.canHide(a)) return;
    if (bonus ? !this.useBonus() : !this.spendAction()) return;
    const dc = Math.max(15, ...this.enemiesOf(a).map((e) => e.passiveFixed ?? 10));
    const r = abilityCheck(a, 'stealth', dc);
    await this.p.roll(r, 'to hide');
    if (r.success) {
      this.addCond(a, 'hidden', {});
      this.p.log(`${a.name} melts into the shadows.`, 'good');
    } else this.p.log(`${a.name} fails to find cover.`);
    this.after();
  }

  useBonus(): boolean {
    if (!this.turn.bonus) return false;
    this.turn.bonus = false;
    return true;
  }

  async actSecondWind(a: Creature): Promise<void> {
    if (a.res.secondWind <= 0 || !this.useBonus()) return;
    a.res.secondWind--;
    const amt = die(10) + a.level;
    await this.p.effect('heal', a.pos, a.pos);
    await this.heal(a, amt);
    this.p.log(`${a.name} catches a Second Wind (+${amt} HP).`, 'good');
    this.after();
  }

  actSurge(a: Creature): void {
    if (a.res.actionSurge <= 0 || this.turn.surgeUsed) return;
    a.res.actionSurge--;
    this.turn.surgeUsed = true;
    this.turn.actions++;
    this.p.float(a.pos, 'ACTION SURGE', 0xe0782f);
    this.p.log(`${a.name} surges with one more action!`, 'good');
    this.after();
  }

  actSteadyAim(a: Creature): void {
    if (this.turn.moved || !this.useBonus()) return;
    this.addCond(a, 'aimed', { expires: { who: a.id, when: 'end' } });
    this.turn.moveLeft = 0;
    this.p.log(`${a.name} takes Steady Aim.`);
    this.after();
  }

  async actPotion(a: Creature, t: Creature): Promise<void> {
    if (this.w.state.inv.potions <= 0 || dist(a.pos, t.pos) > 1 || !this.useBonus()) return;
    this.w.state.inv.potions--;
    const amt = rollExpr('2d4+2').total;
    await this.p.effect('heal', t.pos, t.pos);
    await this.heal(t, amt);
    this.p.log(`${a.name} ${a.id === t.id ? 'drinks' : `pours for ${t.name}`} a Potion of Healing (+${amt}).`, 'good');
    this.after();
  }

  async actStabilize(a: Creature, t: Creature): Promise<void> {
    if (t.hp > 0 || t.death.stable || t.death.dead || dist(a.pos, t.pos) > 1) return;
    if (!this.spendAction()) return;
    const r = abilityCheck(a, 'wis', 10);
    r.label = 'Medicine (WIS)';
    await this.p.roll(r, `to stabilise ${t.name}`);
    if (r.success) { t.death.stable = true; this.p.log(`${a.name} stabilises ${t.name}.`, 'good'); }
    this.after();
  }

  async actDouse(a: Creature, how: 'arcana' | 'athletics'): Promise<void> {
    const b = this.brazier;
    if (!b || b.hp <= 0 || dist(a.pos, b.pos) > 1 || !this.spendAction()) return;
    const dc = how === 'arcana' ? 13 + (this.w.state.omen.omen.mods.brazierDC ?? 0) : 15;
    const r = abilityCheck(a, how, dc);
    await this.p.roll(r, how === 'arcana' ? 'to unpick the binding' : 'to topple the brazier');
    if (r.success) {
      b.hp = 0;
      await this.dropToZero(b, 0, a);
    } else {
      this.p.log(how === 'arcana' ? 'The weave of violet flame resists.' : 'The brazier rocks but stands.', 'bad');
    }
    this.after();
  }

  async actPhial(a: Creature, t: Creature): Promise<void> {
    if (this.w.state.inv.phial <= 0 || dist(a.pos, t.pos) > PHIAL_RANGE || !this.spendAction()) return;
    this.w.state.inv.phial--;
    await this.p.effect('radiant', a.pos, t.pos);
    if (t.monsterId === 'brazier') {
      this.p.log('The Ember Phial bursts over the brazier in a gout of white light!', 'good');
      t.hp = 0;
      await this.dropToZero(t, 0, a);
    } else {
      const ctx = this.attackMods(a, t, false, false);
      const r = runTest(a, 'Ember Phial', mod(a, 'dex') + prof(a), armorClass(t), 'AC', ctx);
      await this.p.roll(r, `vs ${t.name}`);
      if (r.success) {
        const d = rollExpr('3d6', r.crit).total;
        this.p.log(`Holy light sears ${t.name} for ${d} radiant.`, 'good');
        await this.damage(t, d, 'radiant', r.crit, a);
      } else this.p.log('The phial shatters harmlessly on the floor.');
    }
    this.after();
  }

  async actTurnUndead(a: Creature): Promise<void> {
    if (a.res.channel <= 0 || !this.spendAction()) return;
    a.res.channel--;
    const undead = this.enemiesOf(a).filter((e) => e.undead && dist(e.pos, a.pos) <= 6);
    await this.p.effect('turn', a.pos, a.pos);
    const rs: TestResult[] = [];
    for (const u of undead) {
      const r = savingThrow(u, 'wis', spellDC(a), 'turn');
      rs.push(r);
      if (!r.success) this.addCond(u, 'turned', { endsOnDamage: true, expires: undefined, source: a.id });
    }
    await this.p.rolls(rs, 'Turn Undead: WIS saves');
    this.p.log(`${a.name} presents the holy symbol. ${rs.filter((r) => !r.success).length} undead are turned.`, 'good');
    this.after();
  }

  async actDivineSpark(a: Creature, t: Creature): Promise<void> {
    if (a.res.channel <= 0 || dist(a.pos, t.pos) > 6 || !this.spendAction()) return;
    a.res.channel--;
    const amt = die(8) + spellMod(a);
    await this.p.effect('radiant', a.pos, t.pos);
    if (t.faction === 'party') {
      await this.heal(t, amt);
      this.p.log(`Divine Spark restores ${amt} HP to ${t.name}.`, 'good');
    } else {
      const r = savingThrow(t, 'con', spellDC(a));
      await this.p.roll(r);
      const d = r.success ? Math.floor(amt / 2) : amt;
      await this.damage(t, d, 'radiant', false, a);
    }
    this.after();
  }

  // ---------- Spells ----------

  canCast(a: Creature, s: SpellDef): { ok: boolean; why?: string; slot: number } {
    if (s.cast === 'reaction') return { ok: false, why: 'Reaction only', slot: 0 };
    if (s.cast === 'action' && this.turn.actions <= 0) return { ok: false, why: 'No action left', slot: 0 };
    if (s.cast === 'bonus' && !this.turn.bonus) return { ok: false, why: 'No bonus action left', slot: 0 };
    if (s.level === 0) return { ok: true, slot: 0 };
    let slot = 0;
    for (let l = s.level; l <= 2; l++) if (a.slots[l - 1] > 0) { slot = l; break; }
    if (!slot) return { ok: false, why: 'No spell slots left: a long rest restores them', slot: 0 };
    if (this.turn.slotUsed) return { ok: false, why: 'Already used a spell slot this turn (max one per turn)', slot: 0 };
    return { ok: true, slot };
  }

  coneSquares(a: Creature, toward: Pos, len: number): Pos[] {
    const out: Pos[] = [];
    const dx = toward.x - a.pos.x, dy = toward.y - a.pos.y;
    const dl = Math.hypot(dx, dy) || 1;
    for (let y = a.pos.y - len; y <= a.pos.y + len; y++) {
      for (let x = a.pos.x - len; x <= a.pos.x + len; x++) {
        if (x === a.pos.x && y === a.pos.y) continue;
        const vx = x - a.pos.x, vy = y - a.pos.y;
        const vl = Math.hypot(vx, vy);
        if (Math.max(Math.abs(vx), Math.abs(vy)) > len) continue;
        const cos = (vx * dx + vy * dy) / (vl * dl);
        if (cos >= Math.cos(Math.PI / 5.5) && canSee(this.w, a.pos, { x, y })) out.push({ x, y });
      }
    }
    return out;
  }

  sphereSquares(center: Pos, r: number): Pos[] {
    const out: Pos[] = [];
    for (let y = center.y - r; y <= center.y + r; y++) for (let x = center.x - r; x <= center.x + r; x++) out.push({ x, y });
    return out;
  }

  creaturesIn(squares: Pos[]): Creature[] {
    return this.allAlive().filter((c) => squares.some((s) => s.x === c.pos.x && s.y === c.pos.y));
  }

  autoAllies(a: Creature, s: SpellDef): Creature[] {
    return this.alliesOf(a)
      .filter((c) => dist(c.pos, a.pos) <= s.range && c.hp > 0)
      .sort((x, y) => (x.classId === 'fighter' ? -1 : 0) - (y.classId === 'fighter' ? -1 : 0) || x.hp / x.maxHp - y.hp / y.maxHp)
      .slice(0, 3);
  }

  /** Cast a spell. `target` is a creature (for single-target) or a square (areas). */
  async cast(a: Creature, spellId: string, target: Creature | Pos | null): Promise<boolean> {
    const s = SPELLS[spellId];
    const can = this.canCast(a, s);
    if (!can.ok) return false;
    if (s.cast === 'action') this.turn.actions--;
    else this.turn.bonus = false;
    const slot = can.slot;
    if (slot > 0) { a.slots[slot - 1]--; this.turn.slotUsed = true; }
    delete a.conds.hidden;
    const extra = Math.max(0, slot - s.level);
    const tc = target && 'id' in target ? (target as Creature) : null;
    const tp = target ? ('id' in target ? (target as Creature).pos : (target as Pos)) : a.pos;
    if (s.concentration) this.breakConcentration(a);
    this.p.log(`${a.name} casts ${s.name}${slot > s.level ? ` at level ${slot}` : ''}.`, 'info');

    switch (s.id) {
      case 'fire-bolt': case 'ray-of-frost': case 'guiding-bolt': case 'scorching-ray': {
        if (!tc) break;
        const n = s.count ?? 1;
        const fx = s.id === 'ray-of-frost' ? 'frost' : s.id === 'guiding-bolt' ? 'radiant' : 'fire';
        for (let i = 0; i < n && tc.hp > 0; i++) {
          const ctx = this.attackMods(a, tc, false, false);
          const r = runTest(a, s.name, spellAttack(a), armorClass(tc), 'AC', ctx);
          this.consumeAttackEffects(a, tc);
          await this.p.effect(fx, a.pos, tc.pos);
          await this.p.roll(r, `vs ${tc.name}`);
          if (r.success && !r.crit && (await this.tryShield(tc, r))) continue;
          if (!r.success) { this.p.float(tc.pos, 'miss', 0xcdb98f); continue; }
          const dice = s.dmg! + (extra && s.upcast ? '' : '');
          let dmg = rollExpr(dice, r.crit).total;
          if (extra && s.upcast) dmg += rollExpr(`${extra}${s.upcast.slice(1)}`, r.crit).total;
          if (s.id === 'ray-of-frost') this.addCond(tc, 'slowed', { expires: { who: a.id, when: 'start' } });
          if (s.id === 'guiding-bolt') this.addCond(tc, 'guided', { expires: { who: a.id, when: 'end' } });
          await this.damage(tc, dmg, s.dmgType!, r.crit, a);
        }
        break;
      }
      case 'sacred-flame': {
        if (!tc) break;
        await this.p.effect('radiant', a.pos, tc.pos);
        const r = savingThrow(tc, 'dex', spellDC(a));
        await this.p.roll(r, `${s.name}`);
        if (!r.success) await this.damage(tc, rollExpr(s.dmg!).total, 'radiant', false, a);
        else this.p.log(`${tc.name} dodges the flame.`);
        break;
      }
      case 'magic-missile': {
        if (!tc) break;
        const darts = 3 + extra;
        await this.p.effect('darts', a.pos, tc.pos);
        let total = 0;
        for (let i = 0; i < darts; i++) total += rollExpr('1d4+1').total;
        this.p.log(`${darts} darts strike ${tc.name} for ${total} force.`, 'good');
        await this.damage(tc, total, 'force', false, a);
        break;
      }
      case 'burning-hands': {
        const sq = this.coneSquares(a, tp, s.size!);
        await this.p.effect('fire', a.pos, sq);
        const victims = this.creaturesIn(sq).filter((c) => c.id !== a.id);
        const base = rollExpr(`${3 + extra}d6`).total;
        const rs: TestResult[] = victims.map((v) => savingThrow(v, 'dex', spellDC(a)));
        if (rs.length) await this.p.rolls(rs, `Burning Hands: DEX saves (${base} fire)`);
        for (let i = 0; i < victims.length; i++) await this.damage(victims[i], rs[i].success ? Math.floor(base / 2) : base, 'fire', false, a);
        break;
      }
      case 'sleep': {
        const sq = this.sphereSquares(tp, s.size!);
        await this.p.effect('sleep', a.pos, sq);
        const victims = this.creaturesIn(sq).filter((c) => c.faction !== 'object');
        const rs: TestResult[] = [];
        const slept: string[] = [];
        for (const v of victims) {
          if (v.condImmune.includes('asleep')) { this.p.float(v.pos, 'immune', 0xcdb98f); continue; }
          const r = savingThrow(v, 'wis', spellDC(a));
          rs.push(r);
          if (!r.success && this.addCond(v, 'asleep', { endsOnDamage: true, source: a.id })) { slept.push(v.id); this.addCond(v, 'prone', {}); }
        }
        if (rs.length) await this.p.rolls(rs, 'Sleep: WIS saves');
        if (slept.length) a.concentration = { spell: 'sleep', targets: slept };
        this.p.log(slept.length ? `${slept.length} creature(s) slump into magical sleep.` : 'No one falls asleep.', slept.length ? 'good' : 'info');
        break;
      }
      case 'cure-wounds': case 'healing-word': {
        if (!tc || dist(a.pos, tc.pos) > s.range) break;
        await this.p.effect('heal', a.pos, tc.pos);
        let amt = rollExpr(`${(s.id === 'cure-wounds' ? 2 : 2) * (1 + extra)}${s.heal!.slice(1)}`).total + spellMod(a);
        if (a.classId === 'cleric' && a.level >= 3) amt += 2 + slot;
        await this.heal(tc, amt);
        this.p.log(`${tc.name} regains ${amt} HP.`, 'good');
        break;
      }
      case 'bless': {
        const allies = this.autoAllies(a, s);
        for (const t of allies) this.addCond(t, 'blessed', { source: a.id });
        a.concentration = { spell: 'bless', targets: allies.map((t) => t.id) };
        await this.p.effect('radiant', a.pos, allies.map((t) => t.pos));
        this.p.log(`Blessed: ${allies.map((t) => t.name).join(', ')}.`, 'good');
        break;
      }
      case 'aid': {
        const allies = this.autoAllies(a, s);
        for (const t of allies) { t.aidBonus += 5; t.maxHp += 5; await this.heal(t, 5); }
        this.p.log(`Aid: ${allies.map((t) => t.name).join(', ')} +5 max HP.`, 'good');
        break;
      }
    }
    this.after();
    return true;
  }

  private after(): void {
    this.p.refresh();
    this.onChange();
    this.checkEnd();
    if (this.outcome) this.endPlayerTurn();
  }

  // ---------- Monster AI ----------

  private pickTarget(m: Creature): Creature | null {
    const foes = this.enemiesOf(m);
    const conscious = foes.filter((f) => f.hp > 0);
    const pool = conscious.length ? conscious : [];
    if (!pool.length) return null;
    const blockers = this.allAlive().filter((x) => x.id !== m.id);
    const { cost } = floodCosts(this.w, m.pos, { blockers, forbid: this.forbidFor(m) });
    const W = this.w.def.w;
    let best: Creature | null = null;
    let bestScore = Infinity;
    for (const f of pool) {
      let reach = Infinity;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = f.pos.x + dx, y = f.pos.y + dy;
        if (x < 0 || y < 0 || x >= W || y >= this.w.def.h) continue;
        if (x === m.pos.x && y === m.pos.y) reach = 0;
        reach = Math.min(reach, cost[y * W + x]);
      }
      const d = Math.min(reach, dist(m.pos, f.pos) + 6);
      const score = d * 2 + armorClass(f) * 0.6 + (f.hp / f.maxHp) * 3 + (f.conds.hidden ? 50 : 0);
      if (score < bestScore) { bestScore = score; best = f; }
    }
    return best;
  }

  private async approach(m: Creature, t: Creature, stopAt = 1): Promise<void> {
    if (dist(m.pos, t.pos) <= stopAt) return;
    const blockers = this.allAlive().filter((x) => x.id !== m.id);
    const allies = this.alliesOf(m).filter((x) => x.id !== m.id);
    const { cost, parent } = floodCosts(this.w, m.pos, { blockers, passThrough: allies, forbid: this.forbidFor(m) });
    const W = this.w.def.w;
    // choose the reachable square closest to the target within movement, preferring adjacency
    let bestI = -1, bestD = Infinity, bestC = Infinity;
    for (let i = 0; i < cost.length; i++) {
      if (!isFinite(cost[i])) continue;
      const p = { x: i % W, y: (i / W) | 0 };
      const d = dist(p, t.pos);
      if (d < stopAt) continue;
      const fear = m.conds.frightened?.source;
      if (fear) { const src = this.allAlive().find((x) => x.id === fear); if (src && dist(p, src.pos) < dist(m.pos, src.pos)) continue; }
      if (d < bestD || (d === bestD && cost[i] < bestC)) { bestD = d; bestC = cost[i]; bestI = i; }
    }
    if (bestI < 0) return;
    const path: Pos[] = [];
    let cur = bestI;
    while (cur !== -1 && cur !== m.pos.y * W + m.pos.x) { path.push({ x: cur % W, y: (cur / W) | 0 }); cur = parent[cur]; }
    path.reverse();
    let budget = this.turn.moveLeft;
    const trimmed: Pos[] = [];
    for (const s of path) {
      const c = this.w.def.tiles[s.y][s.x] === 'rubble' ? 2 : 1;
      if (c > budget) break;
      budget -= c;
      trimmed.push(s);
    }
    // never end on an ally square
    while (trimmed.length && allies.some((al) => al.pos.x === trimmed[trimmed.length - 1].x && al.pos.y === trimmed[trimmed.length - 1].y)) trimmed.pop();
    await this.moveAlong(m, trimmed);
  }

  private async retreatFrom(m: Creature, foes: Creature[], squares: number): Promise<void> {
    const blockers = this.allAlive().filter((x) => x.id !== m.id);
    const { cost } = floodCosts(this.w, m.pos, { blockers, maxCost: Math.min(squares, this.turn.moveLeft), forbid: this.forbidFor(m) });
    const W = this.w.def.w;
    let best = -1, bestScore = -Infinity;
    for (let i = 0; i < cost.length; i++) {
      if (!isFinite(cost[i])) continue;
      const p = { x: i % W, y: (i / W) | 0 };
      const near = Math.min(...foes.map((f) => dist(p, f.pos)));
      const los = foes.some((f) => canSee(this.w, p, f.pos)) ? 2 : 0;
      const score = Math.min(near, 5) + los - cost[i] * 0.05;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) return;
    const path = pathTo(this.w, m.pos, { x: best % W, y: (best / W) | 0 }, { blockers, forbid: this.forbidFor(m) });
    if (path) await this.moveAlong(m, path);
  }

  async aiTurn(m: Creature): Promise<void> {
    await this.p.pause(CONFIG.AI_PAUSE_MS);
    const t = this.pickTarget(m);
    if (!t) return;
    const melee = m.weapons.find((w) => w.melee)!;
    const ranged = m.weapons.find((w) => !w.melee);
    const swings = m.multiattack ?? 1;

    // Boss: Dread Gaze first
    if (m.monsterId === 'ash-warden' && m.res.dreadGaze) {
      const gazeT = this.enemiesOf(m).filter((f) => f.hp > 0 && !f.conds.frightened && dist(f.pos, m.pos) <= 6 && canSee(this.w, m.pos, f.pos))
        .sort((a, b) => b.level - a.level)[0];
      if (gazeT) {
        m.res.dreadGaze = false;
        await this.p.effect('turn', m.pos, gazeT.pos);
        const r = savingThrow(gazeT, 'wis', 12, 'frightened');
        await this.p.roll(r, 'vs Dread Gaze');
        if (!r.success) {
          this.addCond(gazeT, 'frightened', { source: m.id, expires: { who: gazeT.id, when: 'end' } });
          this.p.log(`The Warden's ember eyes fix on ${gazeT.name}. ${gazeT.name} is Frightened!`, 'bad');
        } else this.p.log(`${gazeT.name} meets the Warden's gaze and does not flinch.`, 'info');
      }
    }

    const adjacent = this.hostileAdjacent(m).filter((f) => f.hp > 0);
    if (m.ai === 'archer' && ranged) {
      if (adjacent.length && m.faction === 'goblins' && this.turn.bonus) {
        this.turn.bonus = false;
        this.turn.disengaged = true;
        this.p.log(`${m.name} scampers back (Nimble Escape).`);
        await this.retreatFrom(m, this.enemiesOf(m), 4);
      } else if (adjacent.length) {
        // Skeletons just fight when cornered
        await this.attackN(m, adjacent[0], melee, swings);
        return;
      }
      const shoot = this.pickRangedTarget(m, ranged) ?? null;
      if (!shoot) await this.approach(m, t, 4);
      const tgt = this.pickRangedTarget(m, ranged);
      if (tgt) await this.attackN(m, tgt, ranged, swings);
      return;
    }

    // melee & boss
    const wounded = m.hp < m.maxHp * 0.35;
    if (m.faction === 'goblins' && wounded && adjacent.length && ranged && this.turn.bonus) {
      this.turn.bonus = false;
      this.turn.disengaged = true;
      this.p.log(`${m.name} breaks away (Nimble Escape).`);
      await this.retreatFrom(m, this.enemiesOf(m), 5);
      const tgt = this.pickRangedTarget(m, ranged);
      if (tgt) await this.attackN(m, tgt, ranged, 1);
      return;
    }
    if (adjacent.length) {
      const pick = adjacent.sort((a, b) => a.hp - b.hp)[0];
      await this.attackN(m, pick, melee, swings);
      return;
    }
    await this.approach(m, t, 1);
    const now = this.hostileAdjacent(m).filter((f) => f.hp > 0);
    if (now.length) await this.attackN(m, now.sort((a, b) => a.hp - b.hp)[0], melee, swings);
    else if (ranged) {
      const tgt = this.pickRangedTarget(m, ranged);
      if (tgt) await this.attackN(m, tgt, ranged, 1);
    }
  }

  private pickRangedTarget(m: Creature, w: Weapon): Creature | undefined {
    return this.enemiesOf(m).filter((f) => f.hp > 0 && !f.conds.hidden && this.weaponInRange(m, w, f))
      .sort((a, b) => armorClass(a) - armorClass(b) || a.hp - b.hp)[0];
  }

  private async attackN(m: Creature, t: Creature, w: Weapon, n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      let target = t;
      if (target.hp <= 0) {
        const alt = w.melee ? this.hostileAdjacent(m).find((f) => f.hp > 0) : this.pickRangedTarget(m, w);
        if (!alt) return;
        target = alt;
      }
      if (!canAct(m)) return;
      await this.attack(m, target, w);
      this.p.refresh();
      if (this.checkEnd()) return;
      await this.p.pause(450);
    }
  }
}

export function abilityName(a: Ability): string {
  return a.toUpperCase();
}
