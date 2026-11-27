// Loads the SVG art set; anything missing falls back to a drawn placeholder in the same palette.
import { Assets, Graphics, Texture, type Renderer } from 'pixi.js';

export const TILE_KEYS = [
  'floor_1', 'floor_2', 'floor_3', 'wall', 'door_closed', 'door_open', 'door_locked', 'door_secret', 'rubble',
  'trap_plate', 'trap_disarmed', 'chest_closed', 'chest_open', 'campfire', 'shrine', 'brazier', 'brazier_out',
  'stairs_up', 'loose_stone', 'bones', 'crypt_floor',
  // village, road and the lower workings
  'grass_1', 'grass_2', 'grass_3', 'road_1', 'road_2', 'dirt', 'water', 'cave_floor', 'flooded_floor', 'house_wall', 'roof',
  'tree', 'pine', 'bush', 'fence', 'well', 'stall', 'anvil', 'barrels', 'signpost', 'mine_entrance', 'stairs_down',
  'cage', 'cage_open', 'door_house', 'altar',
];
export const TOKEN_KEYS = [
  'fighter', 'rogue', 'wizard', 'cleric', 'goblin', 'goblin_boss', 'skeleton', 'ash_warden',
  'wolf', 'giant_rat', 'zombie', 'giant_spider',
  'innkeeper', 'priest', 'smith', 'elder', 'child', 'guard', 'stranger', 'miner', 'hermit',
];
export const ICON_KEYS = ['d20', 'prone', 'poisoned', 'frightened', 'unconscious', 'blessed', 'hidden', 'concentration', 'dodging', 'sapped', 'shield_spell', 'steady_aim', 'turn_undead'];

const cache = new Map<string, Texture>();

export const PAL = {
  ink: 0x14110f,
  stone: 0x3a342e,
  stoneLight: 0x4a433b,
  stoneDark: 0x2a2520,
  parchment: 0xe9d8b4,
  parchmentDark: 0xcdb98f,
  ember: 0xe0782f,
  emberLight: 0xf2a65a,
  blood: 0xb3261e,
  verdigris: 0x4f9d8a,
  arcane: 0x8a6bd1,
  gold: 0xd8b24a,
  poison: 0x8fb339,
  night: 0x05070f,
  navy: 0x121a3f,
  ivory: 0xefe6d0,
  goldHi: 0xf6dfa2,
  goldUi: 0xd4af6a,
};

export async function loadArt(): Promise<void> {
  const entries: { alias: string; src: string; data: { resolution: number } }[] = [];
  for (const k of TILE_KEYS) entries.push({ alias: `tiles/${k}`, src: `/art/tiles/${k}.svg`, data: { resolution: 2 } });
  for (const k of TOKEN_KEYS) entries.push({ alias: `tokens/${k}`, src: `/art/tokens/${k}.svg`, data: { resolution: 2 } });
  for (const k of ICON_KEYS) entries.push({ alias: `icons/${k}`, src: `/art/icons/${k}.svg`, data: { resolution: 2 } });
  entries.push({ alias: 'ui/medallion', src: '/art/ui/gold/medallion.svg', data: { resolution: 3 } });
  for (const e of entries) Assets.add(e);
  const res = await Assets.load(entries.map((e) => e.alias), { strategy: 'skip', onError: () => {} });
  for (const e of entries) {
    const t = (res as Record<string, Texture | undefined>)[e.alias];
    if (t) cache.set(e.alias, t);
  }
}

/** Fallback drawings for anything the art set doesn't provide. */
function fallback(key: string, r: Renderer): Texture {
  const g = new Graphics();
  const [kind, name] = key.split('/');
  if (kind === 'tiles') {
    const ground: Record<string, number> = {
      grass_1: 0x3f5a2c, grass_2: 0x45612f, grass_3: 0x3b5529, road_1: 0x6b6259, road_2: 0x645b52, dirt: 0x6b5236,
      water: 0x1f4a5a, cave_floor: 0x2f2b2a, flooded_floor: 0x24474c, house_wall: 0x8a6a48, roof: 0x6e4b2a,
    };
    const props = ['tree', 'pine', 'bush', 'fence', 'well', 'stall', 'anvil', 'barrels', 'signpost', 'mine_entrance', 'stairs_down', 'cage', 'cage_open', 'altar'];
    if (props.includes(name)) {
      const pc: Record<string, number> = { tree: 0x2f6b2a, pine: 0x1f4a2a, bush: 0x3f7a35, mine_entrance: 0x14110f, stairs_down: 0x2a2520 };
      g.circle(32, 32, name === 'bush' ? 16 : 26).fill(pc[name] ?? 0x7a4a2a).stroke({ width: 2, color: PAL.ink });
      const t = r.generateTexture({ target: g, resolution: 2 });
      g.destroy();
      return t;
    }
    const col = ground[name] ?? (name === 'wall' ? PAL.stoneDark : name.includes('crypt') ? 0x2c2433 : PAL.stone);
    g.rect(0, 0, 64, 64).fill(col).stroke({ width: 2, color: PAL.ink, alignment: 1 });
    if (name.includes('door')) g.rect(8, 22, 48, 20).fill(name.includes('open') ? PAL.stone : 0x6b4a2b);
    if (name.includes('locked')) g.circle(32, 32, 7).fill(PAL.gold);
    if (name.includes('chest')) g.roundRect(14, 20, 36, 26, 4).fill(0x6b4a2b).stroke({ width: 2, color: PAL.gold });
    if (name === 'campfire' || name === 'brazier') g.circle(32, 32, 14).fill(name === 'brazier' ? PAL.arcane : PAL.ember);
    if (name === 'shrine') g.rect(20, 24, 24, 20).fill(PAL.parchmentDark).circle(32, 18, 5).fill(PAL.emberLight);
    if (name.includes('trap')) g.rect(10, 10, 44, 44).stroke({ width: 3, color: name.includes('disarmed') ? PAL.parchmentDark : PAL.blood });
    if (name === 'rubble') for (let i = 0; i < 6; i++) g.circle(10 + ((i * 23) % 44), 12 + ((i * 17) % 40), 5).fill(PAL.stoneLight);
  } else if (kind === 'tokens') {
    const col: Record<string, number> = { fighter: 0x4a7bb0, rogue: PAL.verdigris, wizard: PAL.arcane, cleric: PAL.gold };
    g.circle(64, 64, 58).fill(PAL.stoneDark).stroke({ width: 8, color: col[name] ?? PAL.blood });
    g.circle(64, 54, 22).fill(name === 'skeleton' || name === 'zombie' ? PAL.parchment : name.startsWith('goblin') ? PAL.poison : PAL.parchmentDark);
    g.roundRect(34, 74, 60, 30, 14).fill(col[name] ?? 0x5a2a22);
  } else {
    g.circle(32, 32, 26).fill(PAL.parchment).stroke({ width: 4, color: PAL.ink });
  }
  const t = r.generateTexture({ target: g, resolution: 2 });
  g.destroy();
  return t;
}

let renderer: Renderer | null = null;
export function setRenderer(r: Renderer): void {
  renderer = r;
}

export function tex(key: string): Texture {
  let t = cache.get(key);
  if (!t && renderer) {
    t = fallback(key, renderer);
    cache.set(key, t);
  }
  return t ?? Texture.WHITE;
}

/** Soft radial glow used for light sources. */
export function glowTexture(r: Renderer): Texture {
  const key = 'fx/glow';
  if (cache.has(key)) return cache.get(key)!;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 128, 128);
  const t = Texture.from(c);
  cache.set(key, t);
  void r;
  return t;
}
