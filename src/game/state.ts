// Game state: plain JSON-able data so it can be saved and replayed headless.
import { CONFIG } from '../config';
import { buildMonster, type Creature } from '../rules/creature';
import type { Pos } from '../rules/types';
import { buildArea, MINER_IN_TOWN } from './areas';
import { type AreaId, type DungeonDef, type MapObject, type TileKind, inRect } from './dungeon';

export interface OmenData { date: string; seed: number; omen: { id: string; name: string; text: string; mods: Record<string, number> } }

export type DenState = 'unaware' | 'hostile' | 'ally' | 'toll' | 'fled' | 'defeated' | 'sneaked';

export interface Inventory {
  potions: number;
  gold: number;
  keys: string[];
  phial: number;
  /** Quest items, e.g. 'ore'. */
  items: string[];
}

export const ITEMS: Record<string, { name: string; text: string; icon: string }> = {
  ore: { name: 'Ember-ore', text: 'A fist-sized lump of glowing ore from the Lost Lode. Old Torvin would love this.', icon: 'gold' },
};

/** One line for menus: "2 potions · crypt key · 15 gp". */
export function invSummary(inv: Inventory): string {
  const parts: string[] = [];
  if (inv.potions) parts.push(`${inv.potions} potion${inv.potions > 1 ? 's' : ''}`);
  if (inv.keys.length) parts.push('crypt key');
  if (inv.phial) parts.push('Ember Phial');
  for (const i of inv.items ?? []) parts.push(ITEMS[i]?.name ?? i);
  if (inv.gold) parts.push(`${inv.gold} gp`);
  return parts.length ? parts.join(' · ') : 'Empty';
}

export type QuestId = 'warden' | 'miner' | 'wolves' | 'drowned' | 'lode';
/** active: taken on; ready: the job is done, report back; done: rewarded. */
export type QuestState = 'active' | 'ready' | 'done';

/** What an area looked like when the party left it. */
export interface AreaStore { objects: MapObject[]; monsters: Creature[]; seen: number[] }

export interface GameState {
  version: number;
  omen: OmenData;
  /** The area on screen. `monsters`, `objects` and `seen` below belong to it. */
  area: AreaId;
  /** Areas visited and left, as they were left. */
  areas: Partial<Record<AreaId, AreaStore>>;
  quests: Partial<Record<QuestId, QuestState>>;
  /** Story switches: 'minerFreed', 'wolvesWarned', 'blessing'... */
  flags: Record<string, boolean>;
  /** NPC id -> short lines from earlier conversations, so people remember the party. */
  memory: Record<string, string[]>;
  party: Creature[];
  monsters: Creature[];
  objects: MapObject[];
  seen: number[]; // explored tiles (0/1), row-major
  inv: Inventory;
  den: DenState;
  denNoticed: boolean;
  tip: boolean;
  shortRests: number;
  leader: number;
  sneaking: boolean;
  visited: string[];
  awards: string[];
  bossDone: boolean;
  bossSurprised: boolean;
  log: string[];
}

export interface World {
  def: DungeonDef;
  state: GameState;
}

/** A fresh area: omen tweaks applied, monsters and people spawned. */
function freshArea(def: DungeonDef, omen: OmenData): AreaStore {
  const mods = omen.omen.mods;
  for (const o of def.objects) {
    if (o.kind === 'trap' && mods.trapDC) { o.passiveDC! += mods.trapDC; o.searchDC! += mods.trapDC; }
  }
  const monsters = def.spawns.map((s) => {
    const m = buildMonster(s.monsterId, s.pos, s.monsterId === 'ash-warden' ? mods.bossHP ?? 0 : 0);
    m.group = s.group;
    return m;
  });
  return { objects: def.objects, monsters, seen: new Array(def.w * def.h).fill(def.known ? 1 : 0) };
}

const FORMATION = [[0, 0], [-1, 0], [1, 0], [0, 1], [-1, 1], [1, 1], [0, -1]];

/** Stand the party around `at` on free, walkable squares. */
function placeParty(w: World, at: Pos): void {
  const taken: Pos[] = [];
  for (const c of w.state.party) {
    const spot = FORMATION.map(([dx, dy]) => ({ x: at.x + dx, y: at.y + dy }))
      .find((p) => !blocksMove(w, p) && !taken.some((t) => t.x === p.x && t.y === p.y) && !w.state.monsters.some((m) => m.hp > 0 && m.pos.x === p.x && m.pos.y === p.y))
      ?? at;
    taken.push(spot);
    c.pos = { ...spot };
  }
}

export function newGame(party: Creature[], omen: OmenData, start: AreaId = 'town'): World {
  const def = buildArea(start);
  const fresh = freshArea(def, omen);
  const state: GameState = {
    version: CONFIG.SAVE_VERSION,
    omen,
    area: start,
    areas: {},
    quests: {},
    flags: {},
    memory: {},
    party,
    monsters: fresh.monsters,
    objects: fresh.objects,
    seen: fresh.seen,
    inv: { potions: 1, gold: 30, keys: [], phial: 0, items: [] },
    den: 'unaware',
    denNoticed: false,
    tip: false,
    shortRests: 0,
    leader: 0,
    sneaking: false,
    visited: [],
    awards: [],
    bossDone: false,
    bossSurprised: false,
    log: [],
  };
  const w = { def, state };
  placeParty(w, def.start);
  return w;
}

export function loadWorld(state: GameState): World {
  const def = buildArea(state.area ?? 'deep1');
  def.objects = state.objects;
  return { def, state };
}

/**
 * Move the whole party to another area. The area being left is stored as it is,
 * and the one entered is restored (or built fresh). Returns the new world.
 */
export function enterArea(w: World, to: AreaId, at: Pos): World {
  const s = w.state;
  s.areas[s.area] = { objects: s.objects, monsters: s.monsters, seen: s.seen };
  const def = buildArea(to);
  const store = s.areas[to] ?? freshArea(def, s.omen);
  delete s.areas[to];
  def.objects = store.objects;
  s.area = to;
  s.objects = store.objects;
  s.monsters = store.monsters;
  s.seen = store.seen;
  // A rescued miner goes home to his daughter.
  if (to === 'town' && s.flags.minerFreed && !s.monsters.some((m) => m.monsterId === 'npc-miner')) {
    const m = buildMonster('npc-miner', MINER_IN_TOWN);
    m.group = 'npc';
    s.monsters.push(m);
  }
  const nw = { def, state: s };
  placeParty(nw, at);
  return nw;
}

// ---------- Grid queries ----------

export function tileAt(w: World, p: Pos): TileKind {
  if (p.x < 0 || p.y < 0 || p.x >= w.def.w || p.y >= w.def.h) return 'wall';
  return w.def.tiles[p.y][p.x];
}

export function objectsAt(w: World, p: Pos): MapObject[] {
  return w.state.objects.filter((o) => (o.tiles ?? [o.pos]).some((t) => t.x === p.x && t.y === p.y));
}

/** Tiles you cannot see through: walls, buildings and trees. */
const OPAQUE: ReadonlySet<TileKind> = new Set<TileKind>(['housewall', 'roof', 'tree', 'pine']);

export function blocksSight(w: World, p: Pos): boolean {
  if (OPAQUE.has(tileAt(w, p))) return true;
  if (tileAt(w, p) === 'wall') {
    // An opened secret door is a passage
    const o = objectsAt(w, p).find((x) => x.kind === 'secret');
    return !(o && !o.hidden && o.open);
  }
  return objectsAt(w, p).some((o) => (o.kind === 'door' || o.kind === 'secret') && !o.open);
}

export function blocksMove(w: World, p: Pos): boolean {
  if (blocksSight(w, p)) return true;
  const t = tileAt(w, p);
  if (t === 'wall' || t === 'water') return true;
  return objectsAt(w, p).some((o) => o.kind === 'chest' || o.kind === 'campfire' || o.kind === 'shrine' || o.kind === 'cage' || o.kind === 'inn' || (o.kind === 'decor' && o.blocks));
}

export function moveCost(w: World, p: Pos): number {
  const t = tileAt(w, p);
  return t === 'rubble' || t === 'bush' || t === 'flooded' ? 2 : 1;
}

export function knownArmedTrapAt(w: World, p: Pos): MapObject | undefined {
  return objectsAt(w, p).find((o) => o.kind === 'trap' && o.armed && !o.hidden);
}
export function armedTrapAt(w: World, p: Pos): MapObject | undefined {
  return objectsAt(w, p).find((o) => o.kind === 'trap' && o.armed);
}

export function roomAt(w: World, p: Pos) {
  return w.def.rooms.find((r) => inRect(p, r.rect));
}

export function livingParty(w: World): Creature[] {
  return w.state.party.filter((c) => !c.death.dead);
}

export function creatureAt(w: World, p: Pos, list?: Creature[]): Creature | undefined {
  const all = list ?? [...w.state.party, ...w.state.monsters];
  return all.find((c) => c.pos.x === p.x && c.pos.y === p.y && (c.kind === 'pc' ? !c.death.dead : c.hp > 0));
}

export function dist(a: Pos, b: Pos): number {
  // 5e simple diagonal rule: every square counts as 5 ft.
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function addLog(w: World, msg: string): void {
  w.state.log.push(msg);
  if (w.state.log.length > 120) w.state.log.shift();
}
