// Core 5e-compatible types (SRD 5.2.1 terms).

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ABILITY_NAME: Record<Ability, string> = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
};

export type Skill =
  | 'athletics' | 'stealth' | 'arcana' | 'investigation'
  | 'insight' | 'perception' | 'persuasion' | 'intimidation';
/** "tools" is Thieves' Tools, a tool proficiency used with DEX. */
export type CheckKind = Skill | 'tools' | Ability;

export const SKILLS: Skill[] = ['athletics', 'stealth', 'arcana', 'investigation', 'insight', 'perception', 'persuasion', 'intimidation'];
export const SKILL_ABILITY: Record<Skill | 'tools', Ability> = {
  athletics: 'str', stealth: 'dex', arcana: 'int', investigation: 'int',
  insight: 'wis', perception: 'wis', persuasion: 'cha', intimidation: 'cha', tools: 'dex',
};
export const SKILL_NAME: Record<Skill | 'tools', string> = {
  athletics: 'Athletics', stealth: 'Stealth', arcana: 'Arcana', investigation: 'Investigation',
  insight: 'Insight', perception: 'Perception', persuasion: 'Persuasion', intimidation: 'Intimidation',
  tools: "Thieves' Tools",
};

export type DamageType =
  | 'slashing' | 'piercing' | 'bludgeoning' | 'fire' | 'cold' | 'radiant'
  | 'necrotic' | 'force' | 'poison' | 'healing';

export type ConditionId =
  | 'prone' | 'poisoned' | 'frightened' | 'unconscious' | 'asleep'
  // Effects (not SRD conditions, but tracked the same way):
  | 'blessed' | 'dodging' | 'hidden' | 'sapped' | 'guided' | 'shielded' | 'slowed' | 'turned' | 'vexed' | 'aimed';

export interface CondInfo {
  /** Creature that caused it (frightened source, vex owner...). */
  source?: string;
  /** Expires at the start or end of this creature's turn. */
  expires?: { who: string; when: 'start' | 'end' };
  /** Repeat-save at end of each of its turns. */
  saveEnds?: { ability: Ability; dc: number };
  /** Ends when the creature takes damage. */
  endsOnDamage?: boolean;
  /** Ends on any rest. */
  untilRest?: boolean;
}

export const CONDITION_INFO: Record<ConditionId, { name: string; icon: string; text: string }> = {
  prone: { name: 'Prone', icon: 'prone', text: 'Melee attacks against it have advantage, ranged ones disadvantage. Its own attacks have disadvantage. Standing up costs half its movement.' },
  poisoned: { name: 'Poisoned', icon: 'poisoned', text: 'Disadvantage on attack rolls and ability checks.' },
  frightened: { name: 'Frightened', icon: 'frightened', text: 'Disadvantage on ability checks and attacks while the source is in sight. Cannot willingly move closer to it.' },
  unconscious: { name: 'Unconscious', icon: 'unconscious', text: 'Incapacitated and prone. Attacks against it have advantage; hits from within 5 ft are critical. Fails STR and DEX saves.' },
  asleep: { name: 'Asleep', icon: 'unconscious', text: 'Magically asleep (Unconscious). Wakes when it takes damage.' },
  blessed: { name: 'Blessed', icon: 'blessed', text: '+1d4 to attack rolls and saving throws (Bless).' },
  dodging: { name: 'Dodging', icon: 'dodging', text: 'Attacks against it have disadvantage; advantage on DEX saves.' },
  hidden: { name: 'Hidden', icon: 'hidden', text: 'Unseen. Next attack has advantage, then you are revealed.' },
  sapped: { name: 'Sapped', icon: 'sapped', text: 'Disadvantage on its next attack roll (weapon mastery: Sap).' },
  guided: { name: 'Marked by light', icon: 'blessed', text: 'The next attack roll against it has advantage (Guiding Bolt).' },
  shielded: { name: 'Shield', icon: 'shield_spell', text: '+5 AC until the start of its next turn.' },
  slowed: { name: 'Chilled', icon: 'sapped', text: 'Speed reduced by 10 ft (Ray of Frost).' },
  turned: { name: 'Turned', icon: 'turn_undead', text: 'Frightened and incapacitated by divine power. Ends if it takes damage.' },
  vexed: { name: 'Vexed', icon: 'steady_aim', text: 'The attacker has advantage on its next attack against this creature (weapon mastery: Vex).' },
  aimed: { name: 'Steady Aim', icon: 'steady_aim', text: 'Advantage on your next attack this turn.' },
};

export type Faction = 'party' | 'goblins' | 'undead' | 'beasts' | 'object' | 'npc';

export interface Weapon {
  id: string;
  name: string;
  dmg: string; // e.g. "1d8"
  type: DamageType;
  /** Which ability: finesse uses the higher of STR/DEX. */
  ability: 'str' | 'dex' | 'finesse' | 'spell';
  /** Normal range in squares; 1 = melee reach 5 ft. */
  range: number;
  /** Long range in squares (attacks at disadvantage). */
  long?: number;
  melee: boolean;
  mastery?: 'sap' | 'vex' | 'slow';
  /** Extra flat damage (e.g. Dueling fighting style). */
  bonusDmg?: number;
  /** Fixed attack bonus (monsters). When set, dmg already includes the modifier. */
  toHit?: number;
  /** Thrown weapons are spent (javelin) - kept simple: unlimited here. */
  thrown?: boolean;
}

export interface Pos { x: number; y: number }
