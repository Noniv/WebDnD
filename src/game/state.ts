// Game state: plain JSON-able data so it can be saved and replayed headless.
import { CONFIG } from '../config';
import { buildMonster, type Creature } from '../rules/creature';
import type { Pos } from '../rules/types';
import { buildDungeon, type DungeonDef, type MapObject, type TileKind, inRect } from './dungeon';

export interface OmenData { date: string; seed: number; omen: { id: string; name: string; text: string; mods: Record<string, number> } }

export type DenState = 'unaware' | 'hostile' | 'ally' | 'toll' | 'fled' | 'defeated' | 'sneaked';

export interface Inventory {
  potions: number;
  gold: number;
  keys: string[];
  phial: number;
}

export interface GameState {
  version: number;
  omen: OmenData;
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

export function newGame(party: Creature[], omen: OmenData): World {
  const def = buildDungeon();
  const mods = omen.omen.mods;
  // Omen tweaks
  for (const o of def.objects) {
    if (o.kind === 'trap' && mods.trapDC) { o.passiveDC! += mods.trapDC; o.searchDC! += mods.trapDC; }
  }
  const monsters = def.spawns.map((s) => buildMonster(s.monsterId, s.pos, s.monsterId === 'ash-warden' ? mods.bossHP ?? 0 : 0));
  const formation = [[0, 0], [-1, 0], [1, 0], [0, 1]];
  party.forEach((c, i) => { c.pos = { x: def.start.x + formation[i][0], y: def.start.y + formation[i][1] }; });
  const state: GameState = {
    version: CONFIG.SAVE_VERSION,
    omen,
    party,
    monsters,
    objects: def.objects,
    seen: new Array(def.w * def.h).fill(0),
    inv: { potions: 1, gold: 0, keys: [], phial: 0 },
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
  return { def, state };
}

export function loadWorld(state: GameState): World {
  const def = buildDungeon();
  def.objects = state.objects;
  return { def, state };
}

// ---------- Grid queries ----------

export function tileAt(w: World, p: Pos): TileKind {
  if (p.x < 0 || p.y < 0 || p.x >= w.def.w || p.y >= w.def.h) return 'wall';
  return w.def.tiles[p.y][p.x];
}

export function objectsAt(w: World, p: Pos): MapObject[] {
  return w.state.objects.filter((o) => (o.tiles ?? [o.pos]).some((t) => t.x === p.x && t.y === p.y));
}

export function blocksSight(w: World, p: Pos): boolean {
  if (tileAt(w, p) === 'wall') {
    // An opened secret door is a passage
    const o = objectsAt(w, p).find((x) => x.kind === 'secret');
    return !(o && !o.hidden && o.open);
  }
  return objectsAt(w, p).some((o) => (o.kind === 'door' || o.kind === 'secret') && !o.open);
}

export function blocksMove(w: World, p: Pos): boolean {
  if (blocksSight(w, p)) return true;
  if (tileAt(w, p) === 'wall') return true;
  return objectsAt(w, p).some((o) => o.kind === 'chest' || o.kind === 'campfire' || o.kind === 'shrine');
}

export function moveCost(w: World, p: Pos): number {
  return tileAt(w, p) === 'rubble' ? 2 : 1;
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
