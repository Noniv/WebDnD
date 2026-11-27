// The Emberdeep: five rooms carved into a 21×38 grid, plus a secret nook.
// Built from code (rects + props) rather than ASCII so coordinates stay explicit.
import type { Pos } from '../rules/types';

export type TileKind = 'wall' | 'floor' | 'crypt' | 'rubble';

export type ObjKind = 'door' | 'secret' | 'chest' | 'cache' | 'trap' | 'shrine' | 'campfire' | 'stairs' | 'bones';

export interface MapObject {
  id: string;
  kind: ObjKind;
  name: string;
  pos: Pos;
  tiles?: Pos[];
  hidden?: boolean;
  /** DC for passive Perception to notice while walking. */
  passiveDC?: number;
  /** DC for an active Search (Perception or Investigation). */
  searchDC?: number;
  open?: boolean;
  locked?: boolean;
  lockDC?: number;
  forceDC?: number;
  keyId?: string;
  loot?: string[];
  looted?: boolean;
  armed?: boolean;
  /** Free-text shown when inspected. */
  text?: string;
}

export interface Room {
  id: string;
  name: string;
  rect: { x: number; y: number; w: number; h: number };
  intro: string;
  safe?: boolean;
}

export interface Spawn { monsterId: string; pos: Pos; group: 'den' | 'crypt' }

export interface Light { pos: Pos; r: number; color: number }

export interface DungeonDef {
  w: number;
  h: number;
  tiles: TileKind[][];
  rooms: Room[];
  objects: MapObject[];
  spawns: Spawn[];
  lights: Light[];
  start: Pos;
}

export const W = 21;
export const H = 38;

export function buildDungeon(): DungeonDef {
  const tiles: TileKind[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => 'wall' as TileKind));
  const carve = (x: number, y: number, w: number, h: number, k: TileKind = 'floor') => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) tiles[j][i] = k;
  };

  // Rooms
  carve(3, 1, 13, 8, 'crypt'); // 5 Warden's Crypt
  carve(6, 10, 7, 5); // 4 Shrine of the Last Candle
  carve(15, 10, 1, 7); // hidden tunnel nook -> crypt
  carve(12, 17, 4, 3); // secret reliquary nook
  carve(8, 16, 3, 7); // 3 Hall of Needles
  carve(3, 24, 13, 7); // 2 Goblin Den
  carve(6, 32, 7, 5); // 1 Collapsed Stair
  // Openings (archways) and door tiles (doors are objects on floor tiles)
  carve(9, 15, 1, 1); // shrine <- hall arch
  carve(9, 23, 1, 1); // hall <- den arch
  carve(9, 31, 1, 1); // den door
  carve(9, 9, 1, 1); // crypt door
  carve(11, 18, 1, 1); // secret door 1 (hall -> nook)
  carve(15, 9, 1, 1); // secret door 2 (tunnel -> crypt)
  // Pillars and debris
  tiles[6][6] = 'wall';
  tiles[6][12] = 'wall';
  tiles[27][5] = 'wall';
  tiles[27][13] = 'wall';
  for (const [x, y] of [[6, 35], [7, 35], [7, 34], [12, 32], [11, 32], [14, 30], [3, 24], [4, 30]]) tiles[y][x] = 'rubble';
  for (const [x, y] of [[3, 7], [4, 8], [15, 1], [14, 8]]) tiles[y][x] = 'rubble';

  const rooms: Room[] = [
    { id: 'stair', name: 'The Collapsed Stair', rect: { x: 6, y: 32, w: 7, h: 5 },
      intro: 'Broken steps spill into a cold antechamber. Somewhere north, goblin voices bicker over a fire.' },
    { id: 'den', name: 'The Goblin Den', rect: { x: 3, y: 24, w: 13, h: 7 },
      intro: 'Smoke, stolen sacks and a crackling fire. Goblins.' },
    { id: 'hall', name: 'The Hall of Needles', rect: { x: 8, y: 16, w: 3, h: 7 },
      intro: 'A narrow hall of fitted stone. The floor is suspiciously clean.' },
    { id: 'nook', name: 'The Reliquary Nook', rect: { x: 12, y: 17, w: 4, h: 3 },
      intro: 'A forgotten reliquary. Dust lies thick on a small iron-bound chest.' },
    { id: 'tunnel', name: 'The Sister Passage', rect: { x: 15, y: 10, w: 1, h: 7 },
      intro: 'A crawlway the builders used to reach the crypt unseen.' },
    { id: 'shrine', name: 'Shrine of the Last Candle', rect: { x: 6, y: 10, w: 7, h: 5 }, safe: true,
      intro: 'A single candle burns without wax. The dead cannot cross its light: no undead may enter this room. Here you could rest.' },
    { id: 'crypt', name: "The Warden's Crypt", rect: { x: 3, y: 1, w: 13, h: 8 },
      intro: 'Violet fire coils in an iron brazier. Before it, something in soot-black armour turns its head.' },
  ];

  const objects: MapObject[] = [
    { id: 'stairs', kind: 'stairs', name: 'Stairs up', pos: { x: 9, y: 36 }, text: 'The way back to daylight. Not yet.' },
    { id: 'cache', kind: 'cache', name: 'Loose flagstone', pos: { x: 11, y: 33 }, hidden: true, passiveDC: 12, searchDC: 10,
      loot: ['potion'], text: 'A flagstone that rocks underfoot. Someone hid something here.' },
    { id: 'door-den', kind: 'door', name: 'Heavy door', pos: { x: 9, y: 31 }, open: false,
      text: 'A warped oak door. Firelight flickers under it.' },
    { id: 'campfire', kind: 'campfire', name: 'Goblin fire', pos: { x: 9, y: 27 } },
    { id: 'stash', kind: 'chest', name: "Snikk's stash", pos: { x: 4, y: 25 }, locked: true, lockDC: 12, forceDC: 14,
      loot: ['potion', 'potion', 'gold:35'], text: 'A battered strongbox the goblins keep close.' },
    { id: 'trap', kind: 'trap', name: 'Needle plates', pos: { x: 9, y: 20 }, tiles: [{ x: 8, y: 20 }, { x: 9, y: 20 }, { x: 10, y: 20 }],
      hidden: true, passiveDC: 14, searchDC: 12, armed: true,
      text: 'Three pressure plates span the hall. Tiny holes pock the walls at ankle height.' },
    { id: 'secret-1', kind: 'secret', name: 'Hairline seam', pos: { x: 11, y: 18 }, hidden: true, passiveDC: 15, searchDC: 13, open: false,
      text: 'A door-shaped seam in the east wall, mortared to look like stone.' },
    { id: 'relic', kind: 'chest', name: 'Reliquary chest', pos: { x: 14, y: 18 }, locked: false,
      loot: ['phial', 'potion'], text: 'An iron-bound reliquary, sealed with old wax.' },
    { id: 'secret-2', kind: 'secret', name: 'Crypt seam', pos: { x: 15, y: 9 }, hidden: true, passiveDC: 15, searchDC: 13, open: false,
      text: 'A narrow stone panel that pivots into the crypt.' },
    { id: 'shrine', kind: 'shrine', name: 'Last Candle', pos: { x: 9, y: 11 } },
    { id: 'door-crypt', kind: 'door', name: 'Crypt door', pos: { x: 9, y: 9 }, open: false, locked: true, lockDC: 15, forceDC: 16, keyId: 'crypt-key',
      text: 'Black iron, cold to the touch, sealed with a heavy lock.' },
    { id: 'bones-1', kind: 'bones', name: 'Bones', pos: { x: 14, y: 29 } },
    { id: 'bones-2', kind: 'bones', name: 'Bones', pos: { x: 4, y: 3 } },
    { id: 'bones-3', kind: 'bones', name: 'Bones', pos: { x: 13, y: 7 } },
    { id: 'bones-4', kind: 'bones', name: 'Bones', pos: { x: 10, y: 17 } },
  ];

  const spawns: Spawn[] = [
    { monsterId: 'goblin-boss', pos: { x: 9, y: 26 }, group: 'den' },
    { monsterId: 'goblin', pos: { x: 7, y: 26 }, group: 'den' },
    { monsterId: 'goblin', pos: { x: 11, y: 26 }, group: 'den' },
    { monsterId: 'goblin-archer', pos: { x: 12, y: 29 }, group: 'den' },
    { monsterId: 'ash-warden', pos: { x: 9, y: 5 }, group: 'crypt' },
    { monsterId: 'skeleton', pos: { x: 5, y: 3 }, group: 'crypt' },
    { monsterId: 'skeleton', pos: { x: 13, y: 3 }, group: 'crypt' },
    { monsterId: 'brazier', pos: { x: 9, y: 3 }, group: 'crypt' },
  ];

  const lights: Light[] = [
    { pos: { x: 9, y: 27 }, r: 5, color: 0xe0782f },
    { pos: { x: 9, y: 3 }, r: 6, color: 0x8a6bd1 },
    { pos: { x: 9, y: 11 }, r: 4, color: 0xf2a65a },
  ];

  return { w: W, h: H, tiles, rooms, objects, spawns, lights, start: { x: 9, y: 34 } };
}

export function inRect(p: Pos, r: Room['rect']): boolean {
  return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
}
