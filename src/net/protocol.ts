// Co-op protocol. The host's browser runs the game; guests mirror it and send intents.
import type { TestResult } from '../rules/checks';
import type { CharacterBuild } from '../rules/creature';
import type { CheckKind, Pos } from '../rules/types';
import type { GameState } from '../game/state';

export interface RoomMeta {
  status: 'lobby' | 'playing' | 'ended';
  hostId: string;
  builds: CharacterBuild[] | null;
  created: number;
}

export interface PlayerInfo { id: string; name: string; host: boolean; online: boolean }

export type Intent =
  | { type: 'tap'; x: number; y: number }
  | { type: 'dock'; id: string }
  | { type: 'answer'; pid: string; index: number | null; actorId: string | null }
  | { type: 'leader'; idx: number }
  | { type: 'build'; idx: number; build: CharacterBuild };
export type IncomingIntent = Intent & { from: string; t: number };

export type FxKind = 'slash' | 'arrow' | 'bolt' | 'fire' | 'frost' | 'radiant' | 'heal' | 'force' | 'sleep' | 'darts' | 'turn' | 'douse';

export type NetEvent =
  | { k: 'roll'; r: TestResult; note?: string }
  | { k: 'rolls'; rs: TestResult[]; title: string }
  | { k: 'damage'; id: string; amount: number; crit: boolean; note?: string }
  | { k: 'heal'; id: string; amount: number }
  | { k: 'float'; at: Pos; text: string; color: number }
  | { k: 'log'; msg: string; tone: string }
  | { k: 'move'; id: string; path: Pos[]; ms: number }
  | { k: 'group'; steps: { id: string; to: Pos }[]; ms: number }
  | { k: 'fx'; kind: FxKind; from: Pos; to: Pos | Pos[] }
  | { k: 'shake'; n: number }
  | { k: 'banner'; title: string; text: string; ms: number }
  | { k: 'toast'; text: string }
  | { k: 'panel'; title: string; lines: string[] }
  | { k: 'levelup'; reports: { name: string; from: number; to: number; hpGain: number; gains: string[] }[] }
  | { k: 'show'; to: string; what: 'creature' | 'character'; id: string; extra?: string[] };

export interface ChipSpec { text: string; icon?: string; cls?: string; toast?: string }
export interface DockSpec { id: string; label: string; icon: string; on?: boolean; off?: boolean; ready?: boolean; cost?: 'action' | 'bonus'; count?: number | string; cls?: string }
export interface OrderItem { id: string; name: string; token: string; init: number; current: boolean; foe: boolean; down: boolean }

export interface Marks {
  reach?: number[];
  /** Squares an attack or spell can reach right now (range + line of sight). */
  range?: { cells: number[]; color: number } | null;
  targets?: { pos: Pos; ok: boolean; label?: string }[];
  path?: { from: Pos; steps: Pos[]; label?: string } | null;
  area?: { squares: Pos[]; color: number } | null;
}

export interface OptSpec {
  label: string; sub?: string; icon?: string; primary?: boolean; disabled?: string; odds?: string; tag?: string;
  check?: { kind: CheckKind; dc: number; adv?: string[] };
}
export interface PromptSpec {
  id: string;
  to: string;
  kind: 'sheet' | 'dialogue';
  title: string;
  lead?: string;
  cancel?: string | false;
  actorId?: string;
  partyIds: string[];
  options: OptSpec[];
  speaker?: { name: string; portrait?: string; narrator: boolean };
}

export interface EndSpec { title: string; text: string; lines: string[]; emblem: boolean }

export interface ViewModel {
  mode: 'explore' | 'combat' | 'end';
  leader: number;
  turnId: string | null;
  chips: ChipSpec[];
  turnbar: { name: string; move: number; actions: number; bonus: boolean; reaction: boolean; round: number } | null;
  /** Initiative order, current first (combat only). */
  order: OrderItem[] | null;
  dock: { for: string | null; buttons: DockSpec[] };
  marks: Marks;
  prompt: PromptSpec | null;
  end: EndSpec | null;
  /** Hero id -> player id. */
  owners: Record<string, string>;
  /** Player id -> name. */
  names: Record<string, string>;
}

export interface Snapshot { state: GameState; vm: ViewModel }
