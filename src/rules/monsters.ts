// Monsters. Goblins and skeletons follow SRD 5.2.1 stat blocks (CC-BY-4.0), lightly simplified.
// The Ash Warden is an original creature built with the SRD's stat-block conventions.
import type { Ability, ConditionId, DamageType, Faction, Weapon } from './types';

export type AiKind = 'melee' | 'archer' | 'boss' | 'object' | 'npc';

export interface MonsterDef {
  id: string;
  name: string;
  token: string;
  portrait?: string;
  ac: number;
  hp: number;
  speed: number;
  abilities: Record<Ability, number>;
  attacks: Weapon[];
  multiattack?: number;
  cr: string;
  xp: number;
  passive: number;
  saves?: Partial<Record<Ability, number>>;
  vuln?: DamageType[];
  resist?: DamageType[];
  immune?: DamageType[];
  condImmune?: ConditionId[];
  undead?: boolean;
  ai: AiKind;
  /** Overrides the faction worked out from ai/undead (beasts, villagers). */
  faction?: Faction;
  /** Advantage on attacks while an ally stands next to the target (SRD Pack Tactics). */
  pack?: boolean;
  traits: { name: string; text: string }[];
}

/** Villagers and other people you talk to. They never fight, so a commoner's numbers are enough. */
function villager(id: string, name: string, token: string): MonsterDef {
  return {
    id: `npc-${id}`, name, token, portrait: token, ac: 10, hp: 8, speed: 30,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    attacks: [], cr: '0', xp: 0, passive: 10, ai: 'npc', faction: 'npc', traits: [],
  };
}

const scimitar: Weapon = { id: 'scimitar', name: 'Scimitar', dmg: '1d6+2', type: 'slashing', ability: 'dex', range: 1, melee: true, toHit: 4 };
const gShortbow: Weapon = { id: 'shortbow', name: 'Shortbow', dmg: '1d6+2', type: 'piercing', ability: 'dex', range: 16, long: 64, melee: false, toHit: 4 };

export const MONSTERS: Record<string, MonsterDef> = {
  goblin: {
    id: 'goblin', name: 'Goblin Warrior', token: 'goblin', ac: 15, hp: 10, speed: 30,
    abilities: { str: 8, dex: 15, con: 10, int: 10, wis: 8, cha: 8 },
    attacks: [scimitar, gShortbow], cr: '1/4', xp: 50, passive: 9, ai: 'melee',
    traits: [{ name: 'Nimble Escape', text: 'Disengage or Hide as a bonus action.' }],
  },
  'goblin-archer': {
    id: 'goblin-archer', name: 'Goblin Archer', token: 'goblin', ac: 15, hp: 10, speed: 30,
    abilities: { str: 8, dex: 15, con: 10, int: 10, wis: 8, cha: 8 },
    attacks: [gShortbow, scimitar], cr: '1/4', xp: 50, passive: 9, ai: 'archer',
    traits: [{ name: 'Nimble Escape', text: 'Disengage or Hide as a bonus action.' }],
  },
  'goblin-boss': {
    id: 'goblin-boss', name: 'Snikk, Goblin Boss', token: 'goblin_boss', portrait: 'goblin_boss', ac: 17, hp: 21, speed: 30,
    abilities: { str: 10, dex: 15, con: 10, int: 10, wis: 8, cha: 10 },
    attacks: [scimitar, gShortbow], multiattack: 2, cr: '1', xp: 200, passive: 9, ai: 'melee',
    traits: [
      { name: 'Multiattack', text: 'Two scimitar attacks.' },
      { name: 'Nimble Escape', text: 'Disengage or Hide as a bonus action.' },
    ],
  },
  skeleton: {
    id: 'skeleton', name: 'Skeleton', token: 'skeleton', ac: 14, hp: 13, speed: 30,
    abilities: { str: 10, dex: 16, con: 15, int: 6, wis: 8, cha: 5 },
    attacks: [
      { id: 'shortsword', name: 'Shortsword', dmg: '1d6+3', type: 'piercing', ability: 'dex', range: 1, melee: true, toHit: 5 },
      { id: 'shortbow', name: 'Shortbow', dmg: '1d6+3', type: 'piercing', ability: 'dex', range: 16, long: 64, melee: false, toHit: 5 },
    ],
    cr: '1/4', xp: 50, passive: 9, ai: 'archer', undead: true,
    vuln: ['bludgeoning'], immune: ['poison'], condImmune: ['poisoned', 'asleep'],
    traits: [{ name: 'Brittle Bones', text: 'Vulnerable to bludgeoning damage. Immune to poison. Never sleeps.' }],
  },
  'ash-warden': {
    id: 'ash-warden', name: 'The Ash Warden', token: 'ash_warden', portrait: 'ash_warden', ac: 15, hp: 50, speed: 30,
    abilities: { str: 18, dex: 10, con: 16, int: 8, wis: 12, cha: 12 },
    attacks: [
      { id: 'ember-blade', name: 'Ember Blade', dmg: '1d8+3', type: 'slashing', ability: 'str', range: 1, melee: true, toHit: 5 },
      { id: 'cinder', name: 'Hurled Cinder', dmg: '2d6', type: 'fire', ability: 'str', range: 12, melee: false, toHit: 5 },
    ],
    multiattack: 2, cr: '3', xp: 700, passive: 11, ai: 'boss', undead: true,
    saves: { str: 6, con: 5, wis: 3 },
    vuln: ['bludgeoning'], resist: ['necrotic', 'piercing'], immune: ['poison'], condImmune: ['poisoned', 'asleep', 'frightened'],
    traits: [
      { name: 'Multiattack', text: 'Two Ember Blade attacks.' },
      { name: 'Bound Flame', text: 'Regains 6 HP at the start of its turn while the Binding Brazier burns.' },
      { name: 'Dread Gaze (Recharge 5–6)', text: 'One creature within 30 ft: DC 12 WIS save or Frightened until the end of its next turn.' },
      { name: 'Turn Resistance', text: 'Advantage on saves against Turn Undead.' },
      { name: 'Old Bones', text: 'Vulnerable to bludgeoning; resistant to piercing and necrotic.' },
      { name: 'Candle-shy', text: 'Undead cannot enter the light of the Last Candle.' },
    ],
  },
  // Beasts and the drowned dead below the Emberdeep (SRD 5.2.1 stat blocks, lightly simplified).
  wolf: {
    id: 'wolf', name: 'Wolf', token: 'wolf', ac: 12, hp: 11, speed: 40,
    abilities: { str: 14, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
    attacks: [{ id: 'bite', name: 'Bite', dmg: '1d6+2', type: 'piercing', ability: 'str', range: 1, melee: true, toHit: 4 }],
    cr: '1/4', xp: 50, passive: 15, ai: 'melee', faction: 'beasts', pack: true,
    traits: [{ name: 'Pack Tactics', text: 'Advantage on attacks when another wolf stands next to the target.' }],
  },
  'giant-rat': {
    id: 'giant-rat', name: 'Giant Rat', token: 'giant_rat', ac: 13, hp: 7, speed: 30,
    abilities: { str: 7, dex: 16, con: 11, int: 2, wis: 10, cha: 4 },
    attacks: [{ id: 'bite', name: 'Bite', dmg: '1d4+3', type: 'piercing', ability: 'dex', range: 1, melee: true, toHit: 5 }],
    cr: '1/8', xp: 25, passive: 10, ai: 'melee', faction: 'beasts', pack: true,
    traits: [{ name: 'Pack Tactics', text: 'Advantage on attacks when another rat stands next to the target.' }],
  },
  'giant-spider': {
    id: 'giant-spider', name: 'Giant Spider', token: 'giant_spider', ac: 14, hp: 26, speed: 30,
    abilities: { str: 14, dex: 16, con: 12, int: 2, wis: 11, cha: 4 },
    attacks: [{ id: 'bite', name: 'Venomous Bite', dmg: '2d8+3', type: 'piercing', ability: 'dex', range: 1, melee: true, toHit: 5 }],
    cr: '1', xp: 200, passive: 14, ai: 'melee', faction: 'beasts',
    traits: [{ name: 'Venomous Bite', text: 'Its bite carries venom: extra damage on every hit.' }],
  },
  zombie: {
    id: 'zombie', name: 'Drowned Miner', token: 'zombie', ac: 8, hp: 15, speed: 20,
    abilities: { str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5 },
    attacks: [{ id: 'slam', name: 'Slam', dmg: '1d8+1', type: 'bludgeoning', ability: 'str', range: 1, melee: true, toHit: 3 }],
    cr: '1/4', xp: 50, passive: 8, ai: 'melee', undead: true,
    immune: ['poison'], condImmune: ['poisoned'],
    traits: [{ name: 'Undead Fortitude', text: 'The first time a non-radiant, non-critical blow would drop it, it may keep standing at 1 HP (CON save).' }],
  },
  // People
  'npc-innkeeper': villager('innkeeper', 'Marta Holloway', 'innkeeper'),
  'npc-priest': villager('priest', 'Brother Aldric', 'priest'),
  'npc-smith': villager('smith', 'Old Torvin', 'smith'),
  'npc-elder': villager('elder', 'Elder Wenna', 'elder'),
  'npc-child': villager('child', 'Pell', 'child'),
  'npc-guard': villager('guard', 'Captain Rusk', 'guard'),
  'npc-stranger': villager('stranger', 'Ysolde', 'stranger'),
  'npc-miner': villager('miner', 'Dagan', 'miner'),
  'npc-hermit': villager('hermit', 'Old Moss', 'hermit'),
  brazier: {
    id: 'brazier', name: 'Binding Brazier', token: 'brazier', ac: 12, hp: 10, speed: 0,
    abilities: { str: 10, dex: 1, con: 10, int: 1, wis: 1, cha: 1 },
    attacks: [], cr: '0', xp: 0, passive: 0, ai: 'object',
    vuln: ['cold'], immune: ['fire', 'poison', 'necrotic', 'radiant'], condImmune: ['poisoned', 'asleep', 'frightened', 'prone', 'turned'],
    traits: [
      { name: 'Object', text: 'Cold damage douses it twice as fast. Fire only feeds it.' },
      { name: 'Unbinding', text: 'Adjacent: Douse it with Arcana (DC 13) or topple it with Athletics (DC 15) as an action.' },
    ],
  },
};
