// The one rule: d20 + modifier against a target number (DC or AC).
import { rollD20, combineAdv, die, type Adv, type D20Roll } from './dice';
import { checkBonus, saveBonus, type Creature } from './creature';
import type { Ability, CheckKind, ConditionId } from './types';
import { ABILITY_NAME, SKILL_NAME } from './types';

export interface TestResult {
  who: string;
  whoId: string;
  label: string;
  d20: D20Roll;
  bonus: number;
  extras: { label: string; value: number }[];
  total: number;
  target: number;
  targetKind: 'DC' | 'AC';
  success: boolean;
  crit: boolean;
  fumble: boolean;
  advReasons: string[];
  disReasons: string[];
}

export interface AdvCtx {
  adv?: string[];
  dis?: string[];
  extras?: { label: string; value: number }[];
}

export function runTest(
  c: Creature, label: string, bonus: number, target: number, targetKind: 'DC' | 'AC', ctx: AdvCtx = {}, critOn = 20,
): TestResult {
  const advR = ctx.adv ?? [];
  const disR = ctx.dis ?? [];
  const adv: Adv = combineAdv(advR.length > 0, disR.length > 0);
  const d20 = rollD20(adv, c.species === 'halfling');
  const extras = ctx.extras ?? [];
  const total = d20.kept + bonus + extras.reduce((s, e) => s + e.value, 0);
  const crit = targetKind === 'AC' && d20.kept >= critOn;
  const fumble = targetKind === 'AC' && d20.kept === 1;
  const success = crit ? true : fumble ? false : total >= target;
  return {
    who: c.name, whoId: c.id, label, d20, bonus, extras, total, target, targetKind, success, crit, fumble,
    advReasons: advR, disReasons: disR,
  };
}

export function checkLabel(k: CheckKind): string {
  return (SKILL_NAME as Record<string, string>)[k] ?? `${ABILITY_NAME[k as Ability]} check`;
}

/** Ability check (skill or raw ability) against a DC. */
export function abilityCheck(c: Creature, k: CheckKind, dc: number, ctx: AdvCtx = {}): TestResult {
  const dis = [...(ctx.dis ?? [])];
  if (c.conds.poisoned) dis.push('Poisoned');
  if (c.conds.frightened) dis.push('Frightened');
  if (k === 'stealth' && c.stealthDis) dis.push('Heavy armor');
  return runTest(c, checkLabel(k), checkBonus(c, k), dc, 'DC', { ...ctx, dis });
}

export function checkPreview(c: Creature, k: CheckKind, ctxAdv: string[] = []): { bonus: number; adv: Adv; dis: string[]; advR: string[] } {
  const dis: string[] = [];
  if (c.conds.poisoned) dis.push('Poisoned');
  if (c.conds.frightened) dis.push('Frightened');
  if (k === 'stealth' && c.stealthDis) dis.push('Heavy armor');
  return { bonus: checkBonus(c, k), adv: combineAdv(ctxAdv.length > 0, dis.length > 0), dis, advR: ctxAdv };
}

/** Saving throw. `against` names the condition the save resists (for racial traits). */
export function savingThrow(c: Creature, a: Ability, dc: number, against?: ConditionId | 'turn', ctx: AdvCtx = {}): TestResult {
  const adv = [...(ctx.adv ?? [])];
  const dis = [...(ctx.dis ?? [])];
  const extras = [...(ctx.extras ?? [])];
  if (c.conds.blessed) extras.push({ label: 'Bless', value: die(4) });
  if (c.conds.dodging && a === 'dex') adv.push('Dodging');
  if (against === 'poisoned' && c.species === 'dwarf') adv.push('Dwarven Resilience');
  if (against === 'frightened' && c.species === 'halfling') adv.push('Brave');
  if (against === 'turn' && c.monsterId === 'ash-warden') adv.push('Turn Resistance');
  const r = runTest(c, `${ABILITY_NAME[a]} save`, saveBonus(c, a), dc, 'DC', { adv, dis, extras });
  if ((c.conds.unconscious || c.conds.asleep) && (a === 'str' || a === 'dex')) {
    r.success = false;
    r.disReasons = [...r.disReasons, 'Unconscious: auto-fail'];
  }
  return r;
}

/** Chance (0..1) that d20 + bonus meets target with the given advantage state. */
export function chance(bonus: number, target: number, adv: Adv = 'normal'): number {
  const need = Math.min(20, Math.max(2, target - bonus));
  const p = (21 - need) / 20;
  if (adv === 'advantage') return 1 - (1 - p) * (1 - p);
  if (adv === 'disadvantage') return p * p;
  return p;
}

export function difficultyWord(dc: number): string {
  if (dc <= 7) return 'Very easy';
  if (dc <= 10) return 'Easy';
  if (dc <= 13) return 'Medium';
  if (dc <= 16) return 'Hard';
  if (dc <= 20) return 'Very hard';
  return 'Nearly impossible';
}
