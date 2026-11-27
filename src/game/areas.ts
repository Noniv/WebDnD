// Every place the party can be: Emberford village, the Old Mine Road, the Emberdeep
// (dungeon.ts) and the Drowned Workings below it. Built from rects in code, like the dungeon.
import type { Pos } from '../rules/types';
import { buildDungeon, type AreaId, type DungeonDef, type Light, type MapObject, type Room, type Spawn, type TileKind } from './dungeon';

export const AREA_NAMES: Record<AreaId, string> = {
  town: 'Emberford', road: 'The Old Mine Road', deep1: 'The Emberdeep', deep2: 'The Drowned Workings',
};

export function buildArea(id: AreaId): DungeonDef {
  switch (id) {
    case 'town': return buildTown();
    case 'road': return buildRoad();
    case 'deep2': return buildDeep2();
    default: return buildDungeon();
  }
}

function grid(w: number, h: number, fill: TileKind) {
  const tiles: TileKind[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => fill));
  const rect = (x: number, y: number, rw: number, rh: number, k: TileKind) => {
    for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) if (j >= 0 && i >= 0 && j < h && i < w) tiles[j][i] = k;
  };
  const at = (pts: [number, number][], k: TileKind) => { for (const [x, y] of pts) tiles[y][x] = k; };
  return { tiles, rect, at };
}

const decor = (id: string, prop: string, x: number, y: number, name: string, text: string, blocks = true): MapObject =>
  ({ id, kind: 'decor', prop, pos: { x, y }, name, text, blocks });

// ---------------------------------------------------------------------------
// Emberford: a mining village at the foot of the hills. Start of the adventure.

function buildTown(): DungeonDef {
  const W = 24, H = 28;
  const { tiles, rect, at } = grid(W, H, 'grass');
  // Forest edge all round.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x < 1 || x > W - 2 || y < 1 || y > H - 2) tiles[y][x] = (x * 7 + y * 3) % 5 < 3 ? 'pine' : 'tree';
  }
  rect(11, 0, 2, H, 'road');
  rect(11, 0, 2, 3, 'dirt'); // north gate track
  rect(8, 12, 10, 5, 'road'); // market square
  // The Last Ember inn (west)
  rect(2, 8, 7, 4, 'roof'); rect(2, 12, 7, 1, 'housewall'); rect(5, 13, 3, 1, 'dirt');
  // Elder Wenna's house (north-west)
  rect(3, 3, 5, 3, 'roof'); rect(3, 6, 5, 1, 'housewall'); rect(5, 7, 6, 1, 'dirt');
  // Chapel of the Last Candle (east)
  rect(15, 4, 6, 4, 'roof'); rect(15, 8, 6, 1, 'housewall'); rect(17, 9, 1, 3, 'dirt');
  // Torvin's smithy (south-east)
  rect(15, 17, 5, 3, 'roof'); rect(15, 20, 5, 1, 'housewall'); rect(13, 21, 8, 2, 'dirt');
  // A cottage (south-west)
  rect(2, 18, 5, 3, 'roof'); rect(2, 21, 5, 1, 'housewall'); rect(4, 22, 7, 1, 'dirt');
  // Pond
  rect(1, 23, 4, 3, 'water');
  // Trees and shrubs inside the village
  at([[9, 4], [14, 2], [20, 11], [2, 15], [21, 21], [8, 20], [21, 2], [9, 9]], 'tree');
  at([[8, 22], [20, 14], [6, 16], [14, 9], [3, 14], [19, 24], [7, 25]], 'bush');

  const rooms: Room[] = [
    { id: 'town', name: 'Emberford', rect: { x: 0, y: 0, w: W, h: H },
      intro: 'A soot-stained mining village. Since the miners went missing, nobody laughs at the inn. North, the road climbs to the Emberdeep.' },
  ];
  const objects: MapObject[] = [
    { id: 'exit-north', kind: 'exit', prop: 'signpost', name: 'North road', pos: { x: 12, y: 1 }, to: { area: 'road', at: { x: 8, y: 27 } },
      text: 'A weathered signpost: "Old Mine Road". The track climbs into the pines.' },
    { id: 'inn', kind: 'inn', prop: 'door_house', name: 'The Last Ember', pos: { x: 5, y: 12 },
      text: 'The inn\'s door, warm light behind it. A bed and a hot meal cost 5 gold.' },
    decor('door-elder', 'door_house', 5, 6, 'Elder\'s house', 'Elder Wenna\'s door. She is out in the square, worrying.'),
    decor('door-chapel', 'door_house', 17, 8, 'Chapel door', 'The Chapel of the Last Candle. Brother Aldric keeps it.'),
    decor('door-smithy', 'door_house', 17, 20, 'Smithy door', 'Heat pours out. Old Torvin works outside when he can.'),
    decor('door-cottage', 'door_house', 4, 21, 'Cottage door', 'Pell and her father\'s home. Empty since he vanished.'),
    decor('well', 'well', 14, 14, 'Village well', 'Cold, clean water. Someone has scratched a candle into the stone.'),
    decor('stall-1', 'stall', 9, 16, 'Market stall', 'Turnips, candles and rumours. Mostly rumours.'),
    decor('stall-2', 'stall', 16, 16, 'Market stall', 'An empty stall. Its owner went up to the mine and did not come back.'),
    decor('anvil', 'anvil', 15, 22, 'Anvil', 'Torvin\'s anvil, still warm.'),
    decor('barrels', 'barrels', 20, 22, 'Barrels', 'Lamp oil and pickled fish, by the smell.'),
    decor('altar', 'altar', 19, 10, 'Candle altar', 'A small outdoor altar. A candle burns here, never shorter.'),
    decor('fence-1', 'fence', 14, 25, 'Fence', 'A garden fence.'),
    decor('fence-2', 'fence', 15, 25, 'Fence', 'A garden fence.'),
    decor('fence-3', 'fence', 16, 25, 'Fence', 'A garden fence.'),
    decor('sign-south', 'signpost', 11, 26, 'South road', 'Back to the lowlands. Your business is north, in the Emberdeep.'),
  ];
  const spawns: Spawn[] = [
    { monsterId: 'npc-innkeeper', pos: { x: 6, y: 13 }, group: 'npc' },
    { monsterId: 'npc-elder', pos: { x: 10, y: 14 }, group: 'npc' },
    { monsterId: 'npc-child', pos: { x: 13, y: 15 }, group: 'npc' },
    { monsterId: 'npc-priest', pos: { x: 18, y: 10 }, group: 'npc' },
    { monsterId: 'npc-smith', pos: { x: 16, y: 21 }, group: 'npc' },
    { monsterId: 'npc-guard', pos: { x: 13, y: 3 }, group: 'npc' },
    { monsterId: 'npc-stranger', pos: { x: 21, y: 16 }, group: 'npc' },
  ];
  const lights: Light[] = [];
  return { id: 'town', name: AREA_NAMES.town, daylight: 10, known: true, w: W, h: H, tiles, rooms, objects, spawns, lights, start: { x: 12, y: 24 } };
}

/** Where a freed miner waits in the village (added when he is rescued). */
export const MINER_IN_TOWN: Pos = { x: 14, y: 16 };

// ---------------------------------------------------------------------------
// The Old Mine Road: pines, a hermit, a wolf clearing, and the mine mouth.

function buildRoad(): DungeonDef {
  const W = 16, H = 30;
  const { tiles, rect, at } = grid(W, H, 'pine');
  rect(4, 23, 9, 7, 'grass'); rect(7, 23, 2, 7, 'dirt'); // south end, from the village
  rect(1, 18, 11, 5, 'grass'); rect(6, 18, 2, 6, 'dirt'); // the hermit's corner
  rect(3, 10, 11, 8, 'grass'); rect(7, 10, 2, 8, 'dirt'); // wolf clearing
  rect(5, 2, 7, 8, 'grass'); rect(8, 2, 2, 8, 'dirt'); // below the mine mouth
  rect(4, 0, 9, 2, 'wall'); tiles[1][8] = 'dirt'; // rock face with the mine mouth
  // Old Moss's hut
  rect(1, 18, 3, 2, 'roof'); rect(1, 20, 3, 1, 'housewall');
  at([[4, 12], [11, 14], [12, 11], [5, 16], [10, 4], [6, 6], [11, 25], [5, 27]], 'tree');
  at([[10, 16], [4, 14], [12, 20], [10, 7], [9, 26], [3, 22]], 'bush');

  const rooms: Room[] = [
    { id: 'road-south', name: 'The Old Mine Road', rect: { x: 0, y: 23, w: W, h: 7 },
      intro: 'The road climbs north through dark pines. Fresh claw marks score the bark.' },
    { id: 'hermit', name: 'Old Moss\'s Clearing', rect: { x: 0, y: 18, w: W, h: 5 },
      intro: 'Smoke curls from a mossy hut. Herbs hang drying from every branch.' },
    { id: 'clearing', name: 'The Wolf Clearing', rect: { x: 3, y: 10, w: 11, h: 8 }, encounter: 'wolves',
      intro: 'A trampled clearing strewn with gnawed bones. Yellow eyes in the shadows.' },
    { id: 'minemouth', name: 'The Mine Mouth', rect: { x: 4, y: 0, w: 9, h: 10 },
      intro: 'The Emberdeep gapes in the hillside. Warm air breathes out of it, smelling of ash.' },
  ];
  const objects: MapObject[] = [
    { id: 'exit-town', kind: 'exit', prop: 'signpost', name: 'Road to Emberford', pos: { x: 8, y: 29 }, to: { area: 'town', at: { x: 11, y: 3 } },
      text: 'Back down the hill to the village.' },
    { id: 'exit-mine', kind: 'exit', prop: 'mine_entrance', name: 'The Emberdeep', pos: { x: 8, y: 1 }, to: { area: 'deep1', at: { x: 9, y: 34 } },
      text: 'Timbered beams hold up the mine mouth. Broken steps lead down into the dark.' },
    { id: 'cart', kind: 'chest', name: 'Overturned cart', pos: { x: 11, y: 8 }, locked: false, loot: ['potion', 'gold:15'],
      text: 'A miners\' supply cart lies on its side. The wolves were not interested in the crates.' },
    decor('door-hut', 'door_house', 2, 20, 'Moss\'s door', 'A low door woven with dried herbs.'),
    { id: 'moss-fire', kind: 'campfire', name: 'Cook fire', pos: { x: 4, y: 21 } },
    { id: 'bones-road', kind: 'bones', name: 'Bones', pos: { x: 5, y: 11 } },
  ];
  const spawns: Spawn[] = [
    { monsterId: 'npc-hermit', pos: { x: 3, y: 21 }, group: 'npc' },
    { monsterId: 'wolf', pos: { x: 5, y: 12 }, group: 'wolves' },
    { monsterId: 'wolf', pos: { x: 10, y: 11 }, group: 'wolves' },
    { monsterId: 'wolf', pos: { x: 9, y: 13 }, group: 'wolves' },
    { monsterId: 'wolf', pos: { x: 11, y: 15 }, group: 'wolves' },
  ];
  const lights: Light[] = [{ pos: { x: 4, y: 21 }, r: 3, color: 0xe0782f }];
  return { id: 'road', name: AREA_NAMES.road, daylight: 6, w: W, h: H, tiles, rooms, objects, spawns, lights, start: { x: 8, y: 27 } };
}

// ---------------------------------------------------------------------------
// The Drowned Workings: the old mine below the Emberdeep, flooded and haunted.

function buildDeep2(): DungeonDef {
  const W = 18, H = 22;
  const { tiles, rect, at } = grid(W, H, 'wall');
  rect(1, 16, 5, 5, 'cave'); // shaft landing
  rect(6, 15, 7, 4, 'flooded'); // flooded gallery
  rect(9, 9, 2, 6, 'cave'); // dripping passage
  rect(8, 7, 2, 2, 'cave');
  rect(1, 3, 7, 7, 'cave'); // spider cavern
  rect(10, 7, 1, 2, 'cave');
  rect(11, 2, 6, 6, 'cave'); // the foreman's vault
  at([[7, 16], [12, 15], [6, 18]], 'cave');
  at([[2, 6], [6, 3], [9, 12], [3, 17]], 'rubble');
  at([[13, 6], [16, 3], [9, 17]], 'flooded');

  const rooms: Room[] = [
    { id: 'landing', name: 'The Shaft Landing', rect: { x: 1, y: 16, w: 5, h: 5 },
      intro: 'Black water drips from the shaft above. Old mine tools rust in heaps.' },
    { id: 'gallery', name: 'The Flooded Gallery', rect: { x: 6, y: 15, w: 7, h: 4 }, encounter: 'rats',
      intro: 'Knee-deep water, and something swimming in it. Many somethings. Wading is slow.' },
    { id: 'passage', name: 'The Dripping Passage', rect: { x: 8, y: 7, w: 3, h: 8 },
      intro: 'A narrow passage. The walls glitter with the ember-ore this mine was dug for.' },
    { id: 'webs', name: 'The Webbed Cavern', rect: { x: 1, y: 3, w: 7, h: 7 }, encounter: 'spider',
      intro: 'Thick webs hang like curtains. A wrapped shape dangles from the ceiling. Two large shapes shift above.' },
    { id: 'vault', name: 'The Foreman\'s Vault', rect: { x: 11, y: 2, w: 6, h: 6 }, encounter: 'drowned',
      intro: 'The foreman\'s strongroom. Four drowned miners stand guard over it still, water running from their mouths.' },
  ];
  const objects: MapObject[] = [
    { id: 'exit-up', kind: 'exit', prop: 'stairs_up', name: 'Shaft up', pos: { x: 3, y: 20 }, to: { area: 'deep1', at: { x: 11, y: 34 } },
      text: 'The shaft back up to the Emberdeep.' },
    { id: 'pack', kind: 'chest', name: 'Adventurer\'s pack', pos: { x: 2, y: 8 }, locked: false, loot: ['potion', 'gold:20'],
      text: 'A rotting pack beside a web-wrapped skeleton. Someone came here before you.' },
    { id: 'lode', kind: 'chest', name: 'The Lost Lode', pos: { x: 16, y: 2 }, locked: true, lockDC: 14, forceDC: 15, loot: ['ore', 'gold:45', 'potion'],
      text: 'The foreman\'s iron strongbox. Through the lid seams, something glows ember-red.' },
    { id: 'bones-d2', kind: 'bones', name: 'Bones', pos: { x: 5, y: 4 } },
    { id: 'bones-d3', kind: 'bones', name: 'Bones', pos: { x: 12, y: 7 } },
  ];
  const spawns: Spawn[] = [
    { monsterId: 'giant-rat', pos: { x: 9, y: 16 }, group: 'rats' },
    { monsterId: 'giant-rat', pos: { x: 11, y: 17 }, group: 'rats' },
    { monsterId: 'giant-rat', pos: { x: 10, y: 15 }, group: 'rats' },
    { monsterId: 'giant-rat', pos: { x: 12, y: 16 }, group: 'rats' },
    { monsterId: 'giant-rat', pos: { x: 8, y: 18 }, group: 'rats' },
    { monsterId: 'giant-spider', pos: { x: 3, y: 5 }, group: 'spider' },
    { monsterId: 'giant-spider', pos: { x: 5, y: 7 }, group: 'spider' },
    { monsterId: 'zombie', pos: { x: 13, y: 4 }, group: 'drowned' },
    { monsterId: 'zombie', pos: { x: 15, y: 5 }, group: 'drowned' },
    { monsterId: 'zombie', pos: { x: 14, y: 3 }, group: 'drowned' },
    { monsterId: 'zombie', pos: { x: 12, y: 5 }, group: 'drowned' },
  ];
  const lights: Light[] = [
    { pos: { x: 14, y: 4 }, r: 3, color: 0x4f9d8a },
    { pos: { x: 9, y: 11 }, r: 2, color: 0xe0782f },
  ];
  return { id: 'deep2', name: AREA_NAMES.deep2, w: W, h: H, tiles, rooms, objects, spawns, lights, start: { x: 3, y: 18 } };
}
