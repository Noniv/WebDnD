// Branching dialogue with skill checks. Pure data; the director runs it.
import type { CheckKind } from '../rules/types';

export type DialogueEnd = 'ally' | 'peace' | 'toll' | 'flee' | 'fight';

export interface DCtx {
  potions: number;
  fearKnown: boolean;
  insightTried: boolean;
  noticed: boolean;
  dcMod: number;
}

export interface DOption {
  id: string;
  text: string;
  /** Short tag shown on the button: what kind of approach this is. */
  tag: 'talk' | 'threat' | 'read' | 'pay' | 'fight';
  check?: { kind: CheckKind; dc: (c: DCtx) => number; adv?: (c: DCtx) => string | null };
  when?: (c: DCtx) => boolean;
  /** Node on success (or the only node, without a check). */
  next?: string;
  fail?: string;
  end?: DialogueEnd;
  failEnd?: DialogueEnd;
  pay?: 'potion';
  sets?: Partial<Pick<DCtx, 'fearKnown' | 'insightTried'>>;
}

export interface DNode {
  id: string;
  speaker: 'snikk' | 'narrator';
  text: (c: DCtx) => string;
  options?: DOption[];
  end?: DialogueEnd;
}

const persuadeDC = (c: DCtx) => 13 + (c.noticed ? 2 : 0) + c.dcMod;
const intimidateDC = (c: DCtx) => 14 + c.dcMod;

const CORE: DOption[] = [
  {
    id: 'offer', tag: 'talk',
    text: '"Something below frightens you. We\'ll end it, if you help us."',
    when: (c) => c.fearKnown,
    check: { kind: 'persuasion', dc: () => 10, adv: () => 'You know what he fears' },
    next: 'deal', fail: 'scoff',
  },
  {
    id: 'persuade', tag: 'talk',
    text: '"We\'re not here for you or your fire. We\'re only passing deeper."',
    when: (c) => !c.fearKnown,
    check: { kind: 'persuasion', dc: persuadeDC },
    next: 'pass', fail: 'scoff',
  },
  {
    id: 'insight', tag: 'read', text: '(Watch his eyes. What is he really afraid of?)',
    when: (c) => !c.insightTried,
    check: { kind: 'insight', dc: () => 12 },
    sets: { insightTried: true },
    next: 'read', fail: 'unreadable',
  },
  {
    id: 'threat', tag: 'threat', text: '"Count your goblins. Now count us."',
    check: { kind: 'intimidation', dc: intimidateDC },
    next: 'flee', fail: 'enraged',
  },
  {
    id: 'toll', tag: 'pay', text: '"One healing draught. Then we pass." (Give a Potion of Healing)',
    when: (c) => c.potions > 0, pay: 'potion', next: 'toll',
  },
  { id: 'attack', tag: 'fight', text: '(Draw steel.)', end: 'fight' },
];

export const SNIKK: Record<string, DNode> = {
  start: {
    id: 'start', speaker: 'snikk',
    text: (c) => c.noticed
      ? 'Sneaky-sneak! Snikk smells you, tall-folk. Creeping on Snikk\'s stair costs double. Pay, or bleed!'
      : 'Oi! Tall-folk on Snikk\'s stair! Snikk\'s fire, Snikk\'s stair, Snikk\'s toll. Pay, or bleed!',
    options: CORE,
  },
  read: {
    id: 'read', speaker: 'narrator',
    text: () => 'Snikk\'s ears flatten every time the north passage creaks. His goblins have been sleeping in shifts. Whatever walks below scares him far more than you do.',
    options: CORE,
  },
  unreadable: {
    id: 'unreadable', speaker: 'narrator',
    text: () => 'Snikk\'s yellow grin gives nothing away.',
    options: CORE,
  },
  scoff: {
    id: 'scoff', speaker: 'snikk',
    text: () => 'Words! Snikk can\'t eat words. Snikk\'s boys can\'t eat words. Pay, or go back up!',
    options: CORE.filter((o) => o.id !== 'persuade' && o.id !== 'offer').concat([{
      id: 'offer2', tag: 'talk',
      text: '"Something below frightens you. We\'ll end it, if you help us."',
      when: (c) => c.fearKnown,
      check: { kind: 'persuasion', dc: () => 12, adv: () => 'You know what he fears' },
      next: 'deal', fail: 'enraged',
    }]),
  },
  pass: {
    id: 'pass', speaker: 'snikk',
    text: () => 'Hmph. Deeper, deeper. Go, then. Die quiet, and don\'t touch Snikk\'s things.',
    end: 'peace',
  },
  deal: {
    id: 'deal', speaker: 'snikk',
    text: () => 'Dead-knight! Comes up the hall at night, takes Snikk\'s boys! You kill it? Snikk gives you its key. And Snikk tells a secret: stone doors on the east side, where the knight walks. Press the seams!',
    end: 'ally',
  },
  flee: {
    id: 'flee', speaker: 'narrator',
    text: () => 'Snikk\'s bravado cracks. "Not worth it! Run, run!" The goblins scatter into a rat-hole, leaving their stash behind.',
    end: 'flee',
  },
  enraged: {
    id: 'enraged', speaker: 'snikk',
    text: () => 'Snikk counts. Snikk counts you DEAD! Get them!',
    end: 'fight',
  },
  toll: {
    id: 'toll', speaker: 'snikk',
    text: () => 'Hehe. Pretty bottle. Go, go, and mind the needles.',
    end: 'toll',
  },
};
