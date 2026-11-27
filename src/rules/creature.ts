// Creatures: player characters and monsters share one shape so combat treats them alike.
import { CONFIG } from '../config';
import {
  BACKGROUNDS, CASTER_SLOTS, CLASSES, SPECIES, abilityMod, profBonus,
  type BackgroundId, type ClassId, type SpeciesId,
} from './content';
import { MONSTERS, type AiKind } from './monsters';
import type { Ability, CheckKind, CondInfo, ConditionId, DamageType, Faction, Pos, Skill, Weapon } from './types';
import { SKILL_ABILITY, ABILITIES } from './types';

export interface Creature {
  id: string;
  name: string;
  kind: 'pc' | 'monster';
  faction: Faction;
  token: string;
  portrait?: string;
  // PC build
  classId?: ClassId;
  species?: SpeciesId;
  background?: BackgroundId;
  level: number;
  xp: number;
  base: Record<Ability, number>; // scores before nothing else; final scores
  skills: Skill[];
  expertise: (Skill | 'tools')[];
  tools: boolean;
  saveProfs: Ability[];
  weapons: Weapon[];
  cantrips: string[];
  spells: string[];
  slotsMax: number[]; // [1st, 2nd]
  slots: number[];
  // Health
  maxHp: number;
  hp: number;
  tempHp: number;
  aidBonus: number;
  hitDie: number;
  hitDiceLeft: number;
  death: { s: number; f: number; stable: boolean; dead: boolean };
  // Defense
  armorBase: number;
  dexCap: number;
  shield: boolean;
  stealthDis: boolean;
  monsterAc?: number;
  speed: number;
  // Resources
  res: {
    secondWind: number;
    actionSurge: number;
    arcaneRecovery: number;
    channel: number;
    inspiration: number;
    dreadGaze: boolean;
  };
  conds: Partial<Record<ConditionId, CondInfo>>;
  concentration?: { spell: string; targets: string[] };
  // Monster
  monsterId?: string;
  ai?: AiKind;
  multiattack?: number;
  passiveFixed?: number;
  saveFixed?: Partial<Record<Ability, number>>;
  vuln: DamageType[];
  resist: DamageType[];
  immune: DamageType[];
  condImmune: ConditionId[];
  undead: boolean;
  xpValue: number;
  // Placement
  pos: Pos;
}

let nextId = 1;
export function newId(prefix: string): string {
  return `${prefix}${nextId++}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export interface CharacterBuild {
  name: string;
  classId: ClassId;
  species: SpeciesId;
  background: BackgroundId;
  /** Standard array assignment (before background bonus). */
  scores: Record<Ability, number>;
  /** +2 and +1 targets from the background's three abilities. */
  plus2: Ability;
  plus1: Ability;
  /** 2024 option: +1 to each of the background's three abilities instead of +2/+1. */
  spread?: boolean;
  skills: Skill[];
  bonusSkill?: Skill;
}

/** The background bonus ("sticker") on one ability: 0, 1 or 2. */
export function bonusOf(b: CharacterBuild, a: Ability): number {
  if (b.spread) return BACKGROUNDS[b.background].abilities.includes(a) ? 1 : 0;
  return a === b.plus2 ? 2 : a === b.plus1 ? 1 : 0;
}

export function finalScores(b: CharacterBuild): Record<Ability, number> {
  const s = { ...b.scores };
  for (const a of Object.keys(s) as Ability[]) s[a] = Math.min(20, s[a] + bonusOf(b, a));
  return s;
}

export function allSkills(b: CharacterBuild): Skill[] {
  const set = new Set<Skill>(b.skills);
  BACKGROUNDS[b.background].skills.forEach((k) => set.add(k));
  const sp = SPECIES[b.species];
  if (sp.bonusSkill && sp.bonusSkill !== 'choice') set.add(sp.bonusSkill);
  if (sp.bonusSkill === 'choice' && b.bonusSkill) set.add(b.bonusSkill);
  return [...set];
}

export function buildCharacter(b: CharacterBuild): Creature {
  const cls = CLASSES[b.classId];
  const scores = finalScores(b);
  const c: Creature = {
    id: newId('pc'),
    name: b.name.trim() || cls.name,
    kind: 'pc',
    faction: 'party',
    token: b.classId,
    portrait: b.classId,
    classId: b.classId,
    species: b.species,
    background: b.background,
    level: 1,
    xp: 0,
    base: scores,
    skills: allSkills(b),
    expertise: b.classId === 'rogue' ? ['stealth', 'tools'] : [],
    tools: !!cls.tools || !!BACKGROUNDS[b.background].tools,
    saveProfs: [...cls.saves],
    weapons: cls.weapons.map((w) => ({ ...w })),
    cantrips: [...(cls.cantrips ?? [])],
    spells: [...(cls.spellsByLevel?.[1] ?? [])],
    slotsMax: cls.caster ? [...CASTER_SLOTS[1]] : [0, 0],
    slots: cls.caster ? [...CASTER_SLOTS[1]] : [0, 0],
    maxHp: 0,
    hp: 0,
    tempHp: 0,
    aidBonus: 0,
    hitDie: cls.hitDie,
    hitDiceLeft: 1,
    death: { s: 0, f: 0, stable: false, dead: false },
    armorBase: cls.armor.base,
    dexCap: cls.armor.dexCap,
    shield: cls.armor.shield,
    stealthDis: cls.armor.stealthDis,
    speed: SPECIES[b.species].speed,
    res: { secondWind: 2, actionSurge: 0, arcaneRecovery: 1, channel: 0, inspiration: b.species === 'human' ? 1 : 0, dreadGaze: false },
    conds: {},
    vuln: [],
    resist: b.species === 'dwarf' ? ['poison'] : [],
    immune: [],
    condImmune: b.species === 'elf' ? ['asleep'] : [],
    undead: false,
    xpValue: 0,
    pos: { x: 0, y: 0 },
  };
  if (b.classId !== 'fighter') c.res.secondWind = 0;
  if (b.classId !== 'wizard') c.res.arcaneRecovery = 0;
  c.maxHp = hpAtLevel(c, 1);
  c.hp = c.maxHp;
  return c;
}

/** Level 1: max hit die + CON. Later levels: fixed average (die/2 + 1) + CON. Dwarves +1/level. */
export function hpAtLevel(c: Creature, level: number): number {
  const con = abilityMod(c.base.con);
  let hp = c.hitDie + con;
  for (let l = 2; l <= level; l++) hp += c.hitDie / 2 + 1 + con;
  if (c.species === 'dwarf') hp += level;
  return Math.max(1, hp);
}

export function buildMonster(id: string, pos: Pos, hpBonus = 0): Creature {
  const m = MONSTERS[id];
  const hp = m.hp + hpBonus;
  return {
    id: newId('m'),
    name: m.name,
    kind: 'monster',
    faction: m.ai === 'object' ? 'object' : m.undead ? 'undead' : 'goblins',
    token: m.token,
    portrait: m.portrait,
    level: 1,
    xp: 0,
    base: { ...m.abilities },
    skills: [],
    expertise: [],
    tools: false,
    saveProfs: [],
    weapons: m.attacks.map((w) => ({ ...w })),
    cantrips: [],
    spells: [],
    slotsMax: [0, 0],
    slots: [0, 0],
    maxHp: hp,
    hp,
    tempHp: 0,
    aidBonus: 0,
    hitDie: 8,
    hitDiceLeft: 0,
    death: { s: 0, f: 0, stable: false, dead: false },
    armorBase: 0,
    dexCap: 0,
    shield: false,
    stealthDis: false,
    monsterAc: m.ac,
    speed: m.speed,
    res: { secondWind: 0, actionSurge: 0, arcaneRecovery: 0, channel: 0, inspiration: 0, dreadGaze: m.id === 'ash-warden' },
    conds: {},
    monsterId: m.id,
    ai: m.ai,
    multiattack: m.multiattack,
    passiveFixed: m.passive,
    saveFixed: m.saves,
    vuln: [...(m.vuln ?? [])],
    resist: [...(m.resist ?? [])],
    immune: [...(m.immune ?? [])],
    condImmune: [...(m.condImmune ?? [])],
    undead: !!m.undead,
    xpValue: m.xp,
    pos: { ...pos },
  };
}

// ---------- Derived numbers ----------

export const mod = (c: Creature, a: Ability) => abilityMod(c.base[a]);
export const prof = (c: Creature) => profBonus(c.level);

export function armorClass(c: Creature): number {
  let ac = c.monsterAc ?? c.armorBase + Math.min(mod(c, 'dex'), c.dexCap) + (c.shield ? 2 : 0);
  if (c.conds.shielded) ac += 5;
  return ac;
}

export function hasProf(c: Creature, k: CheckKind): boolean {
  if (k === 'tools') return c.tools;
  return (c.skills as string[]).includes(k);
}

export function hasExpertise(c: Creature, k: CheckKind): boolean {
  if (c.classId === 'wizard' && c.level >= 2 && k === 'arcana') return true;
  return (c.expertise as string[]).includes(k);
}

/** Bonus to an ability check of this kind. */
export function checkBonus(c: Creature, k: CheckKind): number {
  const ability: Ability = (ABILITIES as string[]).includes(k) ? (k as Ability) : SKILL_ABILITY[k as Skill | 'tools'];
  let b = mod(c, ability);
  if (c.kind === 'monster') {
    if (k === 'perception') b = (c.passiveFixed ?? 10) - 10;
    if (k === 'stealth') b += 4;
    return b;
  }
  if (hasProf(c, k)) b += prof(c) * (hasExpertise(c, k) ? 2 : 1);
  return b;
}

export function saveBonus(c: Creature, a: Ability): number {
  if (c.saveFixed?.[a] !== undefined) return c.saveFixed[a]!;
  return mod(c, a) + (c.saveProfs.includes(a) ? prof(c) : 0);
}

export function passive(c: Creature, k: Skill): number {
  if (c.kind === 'monster' && k === 'perception') return c.passiveFixed ?? 10;
  return 10 + checkBonus(c, k);
}

export function spellMod(c: Creature): number {
  const cls = c.classId ? CLASSES[c.classId] : undefined;
  return cls?.caster ? mod(c, cls.caster) : 0;
}
export const spellDC = (c: Creature) => 8 + prof(c) + spellMod(c);
export const spellAttack = (c: Creature) => prof(c) + spellMod(c);

export function weaponAbilityMod(c: Creature, w: Weapon): number {
  if (w.ability === 'finesse') return Math.max(mod(c, 'str'), mod(c, 'dex'));
  if (w.ability === 'spell') return spellMod(c);
  return mod(c, w.ability);
}

export function weaponToHit(c: Creature, w: Weapon): number {
  return w.toHit ?? weaponAbilityMod(c, w) + prof(c);
}

export function weaponDamageExpr(c: Creature, w: Weapon): string {
  if (w.toHit !== undefined) return w.dmg;
  const m = weaponAbilityMod(c, w) + (w.melee ? w.bonusDmg ?? 0 : 0);
  return m === 0 ? w.dmg : `${w.dmg}${m > 0 ? '+' : ''}${m}`;
}

export function sneakDice(c: Creature): number {
  if (c.classId !== 'rogue') return 0;
  return Math.ceil(c.level / 2);
}

export function critRange(c: Creature): number {
  return c.classId === 'fighter' && c.level >= 3 ? 19 : 20;
}

export function speedSquares(c: Creature): number {
  let ft = c.speed;
  if (c.conds.slowed) ft -= 10;
  return Math.max(0, Math.floor(ft / CONFIG.FEET_PER_SQUARE));
}

export function isDown(c: Creature): boolean {
  return c.hp <= 0;
}
export function canAct(c: Creature): boolean {
  return c.hp > 0 && !c.conds.unconscious && !c.conds.asleep && !c.conds.turned && !c.death.dead;
}
export function isAlive(c: Creature): boolean {
  return c.kind === 'pc' ? !c.death.dead : c.hp > 0;
}

export function visionRadius(c: Creature, omenVision = 0): number {
  const dark = c.species && SPECIES[c.species].darkvision;
  return CONFIG.TORCH_RADIUS + (dark ? CONFIG.DARKVISION_BONUS : 0) + omenVision;
}

// ---------- Levelling and rests ----------

export function levelForXp(xp: number): number {
  let l = 1;
  CONFIG.XP_LEVELS.forEach((t, i) => { if (xp >= t) l = i + 1; });
  return Math.min(CONFIG.MAX_LEVEL, l);
}

export interface LevelUpReport { name: string; from: number; to: number; hpGain: number; gains: string[] }

export function levelUp(c: Creature): LevelUpReport | null {
  if (c.kind !== 'pc' || !c.classId) return null;
  const target = levelForXp(c.xp);
  if (target <= c.level) return null;
  const from = c.level;
  const oldMax = hpAtLevel(c, from);
  c.level = target;
  const newMax = hpAtLevel(c, target);
  const hpGain = newMax - oldMax;
  c.maxHp = newMax + c.aidBonus;
  c.hp = Math.min(c.maxHp, c.hp + hpGain);
  c.hitDiceLeft += target - from;
  const cls = CLASSES[c.classId];
  const gains = cls.features.filter((f) => f.level > from && f.level <= target).map((f) => `${f.name}: ${f.text}`);
  if (cls.caster) {
    const slots = CASTER_SLOTS[target];
    for (let i = 0; i < 2; i++) {
      c.slots[i] += slots[i] - c.slotsMax[i];
      c.slotsMax[i] = slots[i];
    }
    gains.push(`Spell slots: ${slots[0]} × 1st${slots[1] ? `, ${slots[1]} × 2nd` : ''}.`);
    for (let l = from + 1; l <= target; l++) (cls.spellsByLevel?.[l] ?? []).forEach((s) => c.spells.includes(s) || c.spells.push(s));
  }
  if (c.classId === 'fighter' && target >= 2 && from < 2) c.res.actionSurge = 1;
  if (c.classId === 'cleric' && target >= 2 && from < 2) c.res.channel = 2;
  return { name: c.name, from, to: target, hpGain, gains };
}

export function shortRestRecover(c: Creature): string[] {
  const out: string[] = [];
  if (c.classId === 'fighter') {
    if (c.res.secondWind < 2) { c.res.secondWind++; out.push('Second Wind +1'); }
    if (c.level >= 2 && c.res.actionSurge < 1) { c.res.actionSurge = 1; out.push('Action Surge ready'); }
  }
  if (c.classId === 'cleric' && c.level >= 2 && c.res.channel < 2) { c.res.channel++; out.push('Channel Divinity +1'); }
  delete c.conds.poisoned;
  return out;
}

export function longRest(c: Creature): void {
  c.aidBonus = 0;
  c.maxHp = hpAtLevel(c, c.level);
  c.hp = c.maxHp;
  c.tempHp = 0;
  c.hitDiceLeft = Math.min(c.level, c.hitDiceLeft + Math.max(1, Math.floor(c.level / 2)));
  c.slots = [...c.slotsMax];
  c.death = { s: 0, f: 0, stable: false, dead: c.death.dead };
  c.conds = {};
  c.concentration = undefined;
  if (c.classId === 'fighter') { c.res.secondWind = 2; c.res.actionSurge = c.level >= 2 ? 1 : 0; }
  if (c.classId === 'cleric') c.res.channel = c.level >= 2 ? 2 : 0;
  if (c.classId === 'wizard') c.res.arcaneRecovery = 1;
  if (c.species === 'human') c.res.inspiration = 1;
}
