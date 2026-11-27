// The rules talk to the screen only through this interface, so they also run headless.
import type { Creature } from '../rules/creature';
import type { TestResult } from '../rules/checks';
import type { Pos } from '../rules/types';

export interface ChoiceOption<T> { label: string; value: T; detail?: string; primary?: boolean }

export interface Presenter {
  /** Show a d20 test and wait for the die to settle. */
  roll(r: TestResult, note?: string): Promise<void>;
  /** Several rolls at once (group checks, area saves). */
  rolls(rs: TestResult[], title: string): Promise<void>;
  damage(target: Creature, amount: number, crit: boolean, note?: string): void;
  heal(target: Creature, amount: number): void;
  float(at: Pos, text: string, color: number): void;
  log(msg: string, tone?: 'info' | 'good' | 'bad' | 'roll'): void;
  move(c: Creature, path: Pos[], msPerStep?: number): Promise<void>;
  effect(kind: 'slash' | 'arrow' | 'bolt' | 'fire' | 'frost' | 'radiant' | 'heal' | 'force' | 'sleep' | 'darts' | 'turn' | 'douse',
    from: Pos, to: Pos | Pos[]): Promise<void>;
  shake(power: number): void;
  refresh(): void;
  /** `who` is the hero the choice is about (co-op routes it to that hero's player). */
  choose<T>(title: string, text: string, options: ChoiceOption<T>[], who?: Creature): Promise<T>;
  pause(ms: number): Promise<void>;
}

/** No-op presenter for the headless simulator. */
export const headless: Presenter = {
  roll: async () => {},
  rolls: async () => {},
  damage: () => {},
  heal: () => {},
  float: () => {},
  log: () => {},
  move: async (c, path) => { if (path.length) c.pos = { ...path[path.length - 1] }; },
  effect: async () => {},
  shake: () => {},
  refresh: () => {},
  choose: async (_t, _x, options) => (options.find((o) => o.primary) ?? options[0]).value,
  pause: async () => {},
};
