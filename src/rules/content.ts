// Character options built on SRD 5.2.1 (CC-BY-4.0). Simplified for a 5-room delve.
import type { Ability, Skill, Weapon } from './types';

export type ClassId = 'fighter' | 'rogue' | 'wizard' | 'cleric';
export type SpeciesId = 'human' | 'elf' | 'dwarf' | 'halfling';
export type BackgroundId = 'acolyte' | 'criminal' | 'sage' | 'soldier';

export interface Feature { name: string; level: number; text: string }

export interface ClassDef {
  id: ClassId;
  name: string;
  blurb: string;
  role: string;
  hitDie: number;
  saves: Ability[];
  skillChoices: Skill[];
  numSkills: number;
  defaultSkills: Skill[];
  /** Standard array placement, highest first. */
  array: Ability[];
  armor: { name: string; base: number; dexCap: number; shield: boolean; stealthDis: boolean };
  weapons: Weapon[];
  tools?: boolean;
  caster?: 'int' | 'wis';
  cantrips?: string[];
  spellsByLevel?: Record<number, string[]>;
  features: Feature[];
  color: number;
}

const W = {
  longsword: { id: 'longsword', name: 'Longsword', dmg: '1d8', type: 'slashing', ability: 'str', range: 1, melee: true, mastery: 'sap', bonusDmg: 2 },
  javelin: { id: 'javelin', name: 'Javelin', dmg: '1d6', type: 'piercing', ability: 'str', range: 6, long: 24, melee: false, mastery: 'slow' },
  rapier: { id: 'rapier', name: 'Rapier', dmg: '1d8', type: 'piercing', ability: 'finesse', range: 1, melee: true, mastery: 'vex' },
  shortbow: { id: 'shortbow', name: 'Shortbow', dmg: '1d6', type: 'piercing', ability: 'dex', range: 16, long: 64, melee: false, mastery: 'vex' },
  dagger: { id: 'dagger', name: 'Dagger', dmg: '1d4', type: 'piercing', ability: 'finesse', range: 1, melee: true },
  mace: { id: 'mace', name: 'Mace', dmg: '1d6', type: 'bludgeoning', ability: 'str', range: 1, melee: true, mastery: 'sap' },
} satisfies Record<string, Weapon>;

export const CLASSES: Record<ClassId, ClassDef> = {
  fighter: {
    id: 'fighter', name: 'Fighter', role: 'Front line', color: 0x4a7bb0,
    blurb: 'Steel and stamina. Hits hard, takes hits, and gets a second wind when it matters.',
    hitDie: 10, saves: ['str', 'con'],
    skillChoices: ['athletics', 'intimidation', 'insight', 'perception'], numSkills: 2, defaultSkills: ['athletics', 'perception'],
    array: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
    armor: { name: 'Chain mail + shield', base: 16, dexCap: 0, shield: true, stealthDis: true },
    weapons: [W.longsword, W.javelin],
    features: [
      { name: 'Fighting Style: Dueling', level: 1, text: '+2 damage with a one-handed melee weapon.' },
      { name: 'Second Wind', level: 1, text: 'Bonus action: regain 1d10 + fighter level HP. 2 uses; regain one on a short rest, all on a long rest.' },
      { name: 'Weapon Mastery', level: 1, text: 'Longsword (Sap): a hit gives the target disadvantage on its next attack. Javelin (Slow): a hit reduces speed by 10 ft.' },
      { name: 'Action Surge', level: 2, text: 'Once per short rest, take one additional action on your turn.' },
      { name: 'Tactical Mind', level: 2, text: 'When you fail an ability check, spend a Second Wind to add 1d10 instead of healing.' },
      { name: 'Improved Critical', level: 3, text: 'Champion: your weapon attacks score a critical hit on a 19 or 20.' },
    ],
  },
  rogue: {
    id: 'rogue', name: 'Rogue', role: 'Skills & striker', color: 0x4f9d8a,
    blurb: 'Locks, traps and shadows. Strikes precisely for Sneak Attack and slips away.',
    hitDie: 8, saves: ['dex', 'int'], tools: true,
    skillChoices: ['stealth', 'investigation', 'insight', 'perception', 'persuasion', 'intimidation', 'athletics'], numSkills: 4,
    defaultSkills: ['stealth', 'perception', 'insight', 'persuasion'],
    array: ['dex', 'con', 'cha', 'wis', 'int', 'str'],
    armor: { name: 'Leather armor', base: 11, dexCap: 99, shield: false, stealthDis: false },
    weapons: [W.rapier, W.shortbow],
    features: [
      { name: 'Sneak Attack', level: 1, text: 'Once per turn, +1d6 damage (2d6 at level 3) with a finesse or ranged weapon if you have advantage, or an ally is next to the target.' },
      { name: 'Expertise', level: 1, text: "Double proficiency in Stealth and Thieves' Tools." },
      { name: 'Weapon Mastery', level: 1, text: 'Rapier & Shortbow (Vex): a hit gives you advantage on your next attack against that target.' },
      { name: 'Cunning Action', level: 2, text: 'Dash, Disengage or Hide as a bonus action.' },
      { name: 'Steady Aim', level: 3, text: "Bonus action, if you haven't moved: advantage on your next attack this turn, but your speed becomes 0." },
    ],
  },
  wizard: {
    id: 'wizard', name: 'Wizard', role: 'Arcane control', color: 0x8a6bd1,
    blurb: 'Fragile but decisive. Sleep, fire and force, plus the lore to unpick old magic.',
    hitDie: 6, saves: ['int', 'wis'], caster: 'int',
    skillChoices: ['arcana', 'investigation', 'insight'], numSkills: 2, defaultSkills: ['arcana', 'investigation'],
    array: ['int', 'con', 'dex', 'wis', 'cha', 'str'],
    armor: { name: 'No armor', base: 10, dexCap: 99, shield: false, stealthDis: false },
    weapons: [W.dagger],
    cantrips: ['fire-bolt', 'ray-of-frost'],
    spellsByLevel: { 1: ['magic-missile', 'burning-hands', 'sleep', 'shield'], 3: ['scorching-ray'] },
    features: [
      { name: 'Spellcasting', level: 1, text: 'INT-based. Spell save DC 8 + prof + INT; spell attack prof + INT.' },
      { name: 'Arcane Recovery', level: 1, text: 'Once per long rest, after a short rest, recover spell slots totalling up to half your level (rounded up).' },
      { name: 'Scholar', level: 2, text: 'Expertise in Arcana.' },
      { name: '2nd-level spells', level: 3, text: 'Two 2nd-level slots and Scorching Ray.' },
    ],
  },
  cleric: {
    id: 'cleric', name: 'Cleric', role: 'Healer & support', color: 0xd8b24a,
    blurb: 'Faith made manifest. Heals, blesses, and drives back the restless dead.',
    hitDie: 8, saves: ['wis', 'cha'], caster: 'wis',
    skillChoices: ['insight', 'persuasion', 'perception'], numSkills: 2, defaultSkills: ['insight', 'perception'],
    array: ['wis', 'con', 'str', 'cha', 'dex', 'int'],
    armor: { name: 'Scale mail + shield', base: 14, dexCap: 2, shield: true, stealthDis: true },
    weapons: [W.mace],
    cantrips: ['sacred-flame'],
    spellsByLevel: { 1: ['cure-wounds', 'healing-word', 'bless', 'guiding-bolt'], 3: ['aid'] },
    features: [
      { name: 'Spellcasting', level: 1, text: 'WIS-based. Healing, blessing and radiant light.' },
      { name: 'Channel Divinity', level: 2, text: '2 uses (one back on a short rest). Turn Undead: undead within 30 ft make a WIS save or are Turned. Divine Spark: 1d8 + WIS healing or radiant damage.' },
      { name: 'Disciple of Life', level: 3, text: 'Life Domain: healing spells restore an extra 2 + the spell slot level.' },
    ],
  },
};

export interface SpeciesDef {
  id: SpeciesId; name: string; text: string; darkvision: boolean; speed: number;
  bonusSkill?: Skill | 'choice';
}
export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  human: { id: 'human', name: 'Human', darkvision: false, speed: 30, bonusSkill: 'choice',
    text: 'Skillful: one extra skill. Resourceful: Heroic Inspiration after each long rest (reroll one failed check).' },
  elf: { id: 'elf', name: 'Elf', darkvision: true, speed: 30, bonusSkill: 'perception',
    text: 'Darkvision. Keen Senses: Perception proficiency. Fey Ancestry: magic cannot put you to sleep.' },
  dwarf: { id: 'dwarf', name: 'Dwarf', darkvision: true, speed: 30,
    text: 'Darkvision. Dwarven Resilience: resistance to poison damage, advantage on saves against Poisoned. Dwarven Toughness: +1 HP per level.' },
  halfling: { id: 'halfling', name: 'Halfling', darkvision: false, speed: 30,
    text: 'Luck: reroll a natural 1 on any d20 test. Brave: advantage on saves against Frightened. Nimble: move through larger creatures.' },
};

export interface BackgroundDef {
  id: BackgroundId; name: string; abilities: [Ability, Ability, Ability]; skills: Skill[]; tools?: boolean; text: string;
}
export const BACKGROUNDS: Record<BackgroundId, BackgroundDef> = {
  acolyte: { id: 'acolyte', name: 'Acolyte', abilities: ['int', 'wis', 'cha'], skills: ['insight', 'persuasion'], text: 'Raised in a temple. Reads people and speaks with conviction.' },
  criminal: { id: 'criminal', name: 'Criminal', abilities: ['dex', 'con', 'int'], skills: ['stealth', 'investigation'], tools: true, text: "Picked locks for a living. Thieves' Tools proficiency." },
  sage: { id: 'sage', name: 'Sage', abilities: ['con', 'int', 'wis'], skills: ['arcana', 'investigation'], text: 'A life among books and old wards.' },
  soldier: { id: 'soldier', name: 'Soldier', abilities: ['str', 'dex', 'con'], skills: ['athletics', 'intimidation'], text: 'Drilled, scarred, and hard to scare.' },
};

export const DEFAULT_BG: Record<ClassId, BackgroundId> = { fighter: 'soldier', rogue: 'criminal', wizard: 'sage', cleric: 'acolyte' };
export const DEFAULT_SPECIES: Record<ClassId, SpeciesId> = { fighter: 'dwarf', rogue: 'halfling', wizard: 'elf', cleric: 'human' };
export const DEFAULT_NAMES: Record<ClassId, string[]> = {
  fighter: ['Brannoc', 'Hilde', 'Torvald', 'Maren'],
  rogue: ['Wren', 'Pip', 'Sable', 'Lark'],
  wizard: ['Isolde', 'Caddoc', 'Yrsa', 'Fen'],
  cleric: ['Aurel', 'Bryn', 'Oswin', 'Sela'],
};

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

/** Full-caster slots by character level: [1st, 2nd]. */
export const CASTER_SLOTS: Record<number, number[]> = { 1: [2, 0], 2: [3, 0], 3: [4, 2] };

export function profBonus(level: number): number {
  return 2 + Math.floor((level - 1) / 4);
}
export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}
