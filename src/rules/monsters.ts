// Monsters. Goblins and skeletons follow SRD 5.2.1 stat blocks (CC-BY-4.0), lightly simplified.
// The Ash Warden is an original creature built with the SRD's stat-block conventions.
import type { Ability, ConditionId, DamageType, Weapon } from './types';

export type AiKind = 'melee' | 'archer' | 'boss' | 'object';

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
  traits: { name: string; text: string }[];
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
