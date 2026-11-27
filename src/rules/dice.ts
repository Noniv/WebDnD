// Dice and seeded randomness. Everything random in the rules goes through here,
// so a seed reproduces a run and the headless simulator can replay it.

export type Adv = 'normal' | 'advantage' | 'disadvantage';

let state = (Date.now() ^ 0x9e3779b9) >>> 0;

export function seedRng(seed: number): void {
  state = seed >>> 0 || 1;
}

/** mulberry32: small, fast and good enough for dice. */
export function rand(): number {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function die(sides: number): number {
  return 1 + Math.floor(rand() * sides);
}

/** Combine advantage sources the 5e way: any number of each cancel to normal. */
export function combineAdv(adv: boolean, dis: boolean): Adv {
  if (adv && dis) return 'normal';
  if (adv) return 'advantage';
  if (dis) return 'disadvantage';
  return 'normal';
}

export interface D20Roll {
  rolls: number[]; // one or two raw d20s
  kept: number; // the d20 that counts
  adv: Adv;
  rerolledOne?: boolean; // Halfling Luck
}

/** Roll a d20 test die. `lucky` rerolls a natural 1 once (Halfling Luck). */
export function rollD20(adv: Adv = 'normal', lucky = false): D20Roll {
  const roll1 = () => {
    let r = die(20);
    let re = false;
    if (lucky && r === 1) {
      r = die(20);
      re = true;
    }
    return { r, re };
  };
  const a = roll1();
  if (adv === 'normal') return { rolls: [a.r], kept: a.r, adv, rerolledOne: a.re };
  const b = roll1();
  const kept = adv === 'advantage' ? Math.max(a.r, b.r) : Math.min(a.r, b.r);
  return { rolls: [a.r, b.r], kept, adv, rerolledOne: a.re || b.re };
}

/** Parse and roll "2d6+3". Crit doubles the number of dice. */
export interface DamageRoll {
  total: number;
  dice: number[];
  bonus: number;
  expr: string;
}
export function rollExpr(expr: string, crit = false): DamageRoll {
  const m = expr.replace(/\s+/g, '').match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!m) {
    const n = parseInt(expr, 10) || 0;
    return { total: n, dice: [], bonus: n, expr };
  }
  const count = (parseInt(m[1] || '1', 10)) * (crit ? 2 : 1);
  const sides = parseInt(m[2], 10);
  const bonus = parseInt(m[3] || '0', 10);
  const dice: number[] = [];
  for (let i = 0; i < count; i++) dice.push(die(sides));
  const total = Math.max(0, dice.reduce((s, d) => s + d, 0) + bonus);
  return { total, dice, bonus, expr };
}

export function avgExpr(expr: string): number {
  const m = expr.replace(/\s+/g, '').match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!m) return parseInt(expr, 10) || 0;
  return parseInt(m[1] || '1', 10) * (parseInt(m[2], 10) + 1) / 2 + parseInt(m[3] || '0', 10);
}

export function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
