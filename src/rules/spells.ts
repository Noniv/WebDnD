// A small spell list adapted from SRD 5.2.1 (CC-BY-4.0).
import type { Ability, ConditionId, DamageType } from './types';

export type SpellTarget = 'enemy' | 'ally' | 'self' | 'allies3' | 'sphere' | 'cone' | 'any';

export interface SpellDef {
  id: string;
  name: string;
  level: 0 | 1 | 2;
  cast: 'action' | 'bonus' | 'reaction';
  /** Range in squares (1 = touch / adjacent). */
  range: number;
  target: SpellTarget;
  attack?: boolean;
  save?: Ability;
  halfOnSave?: boolean;
  dmg?: string;
  dmgType?: DamageType;
  /** Extra dice per slot level above the spell's level. */
  upcast?: string;
  heal?: string;
  /** Number of separate attacks or darts. */
  count?: number;
  effect?: ConditionId;
  concentration?: boolean;
  /** Sphere radius or cone length, in squares. */
  size?: number;
  icon: string;
  text: string;
}

export const SPELLS: Record<string, SpellDef> = {
  'fire-bolt': {
    id: 'fire-bolt', name: 'Fire Bolt', level: 0, cast: 'action', range: 24, target: 'any', attack: true,
    dmg: '1d10', dmgType: 'fire', icon: 'spell',
    text: 'Ranged spell attack, 120 ft. 1d10 fire damage. Ignites flammable objects.',
  },
  'ray-of-frost': {
    id: 'ray-of-frost', name: 'Ray of Frost', level: 0, cast: 'action', range: 12, target: 'any', attack: true,
    dmg: '1d8', dmgType: 'cold', effect: 'slowed', icon: 'spell',
    text: 'Ranged spell attack, 60 ft. 1d8 cold damage and speed −10 ft until your next turn.',
  },
  'sacred-flame': {
    id: 'sacred-flame', name: 'Sacred Flame', level: 0, cast: 'action', range: 12, target: 'enemy', save: 'dex',
    dmg: '1d8', dmgType: 'radiant', icon: 'turn_undead',
    text: 'DEX save, 60 ft. 1d8 radiant damage on a failed save.',
  },
  'magic-missile': {
    id: 'magic-missile', name: 'Magic Missile', level: 1, cast: 'action', range: 24, target: 'enemy',
    dmg: '1d4+1', dmgType: 'force', count: 3, icon: 'spell',
    text: 'Three darts that always hit, each 1d4 + 1 force damage. One more dart per slot level above 1st.',
  },
  'burning-hands': {
    id: 'burning-hands', name: 'Burning Hands', level: 1, cast: 'action', range: 3, target: 'cone', size: 3,
    save: 'dex', halfOnSave: true, dmg: '3d6', dmgType: 'fire', upcast: '1d6', icon: 'spell',
    text: '15-ft cone. DEX save: 3d6 fire damage, half on a success.',
  },
  sleep: {
    id: 'sleep', name: 'Sleep', level: 1, cast: 'action', range: 12, target: 'sphere', size: 1, save: 'wis',
    effect: 'asleep', concentration: true, icon: 'unconscious',
    text: '5-ft-radius sphere within 60 ft. WIS save or fall Asleep until damaged. Undead and elves are unaffected. Concentration.',
  },
  shield: {
    id: 'shield', name: 'Shield', level: 1, cast: 'reaction', range: 0, target: 'self', effect: 'shielded', icon: 'shield_spell',
    text: 'Reaction when you are hit: +5 AC until the start of your next turn, including against the triggering attack.',
  },
  'scorching-ray': {
    id: 'scorching-ray', name: 'Scorching Ray', level: 2, cast: 'action', range: 24, target: 'enemy', attack: true,
    dmg: '2d6', dmgType: 'fire', count: 3, icon: 'spell',
    text: 'Three rays, each a ranged spell attack for 2d6 fire damage.',
  },
  'cure-wounds': {
    id: 'cure-wounds', name: 'Cure Wounds', level: 1, cast: 'action', range: 1, target: 'ally', heal: '2d8', upcast: '2d8', icon: 'heal',
    text: 'Touch. A creature regains 2d8 + WIS modifier HP.',
  },
  'healing-word': {
    id: 'healing-word', name: 'Healing Word', level: 1, cast: 'bonus', range: 12, target: 'ally', heal: '2d4', upcast: '2d4', icon: 'heal',
    text: 'Bonus action, 60 ft. A creature regains 2d4 + WIS modifier HP. Gets the fallen back up.',
  },
  bless: {
    id: 'bless', name: 'Bless', level: 1, cast: 'action', range: 6, target: 'allies3', effect: 'blessed', concentration: true, icon: 'blessed',
    text: 'Up to three allies within 30 ft add 1d4 to attack rolls and saving throws. Concentration.',
  },
  'guiding-bolt': {
    id: 'guiding-bolt', name: 'Guiding Bolt', level: 1, cast: 'action', range: 24, target: 'enemy', attack: true,
    dmg: '4d6', dmgType: 'radiant', effect: 'guided', upcast: '1d6', icon: 'turn_undead',
    text: 'Ranged spell attack, 120 ft. 4d6 radiant damage; the next attack against the target has advantage.',
  },
  aid: {
    id: 'aid', name: 'Aid', level: 2, cast: 'action', range: 6, target: 'allies3', icon: 'heal',
    text: 'Up to three allies gain +5 maximum and current HP until a long rest.',
  },
};
