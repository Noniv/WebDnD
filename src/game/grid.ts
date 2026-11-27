// Line of sight, fog of war and pathfinding on the square grid.
import type { Creature } from '../rules/creature';
import { visionRadius } from '../rules/creature';
import type { Pos } from '../rules/types';
import { blocksMove, blocksSight, creatureAt, knownArmedTrapAt, moveCost, type World } from './state';

/** Bresenham line between tile centres; true if no opaque tile lies strictly between. */
export function lineOfSight(w: World, a: Pos, b: Pos): boolean {
  let x0 = a.x, y0 = a.y;
  const x1 = b.x, y1 = b.y;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (!(x0 === x1 && y0 === y1)) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
    if (x0 === x1 && y0 === y1) break;
    if (blocksSight(w, { x: x0, y: y0 })) return false;
  }
  return true;
}

/** Symmetric-ish LOS: accept if either direction is clear (reduces corner artefacts). */
export function canSee(w: World, a: Pos, b: Pos): boolean {
  return lineOfSight(w, a, b) || lineOfSight(w, b, a);
}

/**
 * Line of effect for attacks and spells, closer to the tabletop rule ("pick a corner of your
 * square; if a line to the target isn't blocked, you can target it"). Samples rays from the
 * centre and four inner corners of the attacker's square to the target's centre.
 */
export function clearShot(w: World, a: Pos, b: Pos): boolean {
  if (Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1) return true;
  if (canSee(w, a, b)) return true;
  const tx = b.x + 0.5, ty = b.y + 0.5;
  for (const [ox, oy] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]) {
    const sx = a.x + ox, sy = a.y + oy;
    const len = Math.hypot(tx - sx, ty - sy);
    const steps = Math.ceil(len / 0.2);
    let blocked = false;
    for (let i = 1; i < steps; i++) {
      const x = Math.floor(sx + ((tx - sx) * i) / steps), y = Math.floor(sy + ((ty - sy) * i) / steps);
      if ((x === a.x && y === a.y) || (x === b.x && y === b.y)) continue;
      if (blocksSight(w, { x, y })) { blocked = true; break; }
    }
    if (!blocked) return true;
  }
  return false;
}

/** Tiles visible to the party right now. */
export function computeVisible(w: World): Uint8Array {
  const { w: W, h: H } = w.def;
  const vis = new Uint8Array(W * H);
  const viewers = w.state.party.filter((c) => !c.death.dead);
  const omenV = w.state.omen.omen.mods.vision ?? 0;
  for (const c of viewers) {
    const r = visionRadius(c, omenV);
    for (let y = Math.max(0, c.pos.y - r); y <= Math.min(H - 1, c.pos.y + r); y++) {
      for (let x = Math.max(0, c.pos.x - r); x <= Math.min(W - 1, c.pos.x + r); x++) {
        const d = Math.hypot(x - c.pos.x, y - c.pos.y);
        if (d > r + 0.5) continue;
        if (canSee(w, c.pos, { x, y })) vis[y * W + x] = 1;
      }
    }
  }
  // Light sources reveal their surroundings to anyone with line of sight to them.
  for (const L of w.def.lights) {
    if (L.pos.x === 9 && L.pos.y === 3 && w.state.monsters.some((m) => m.monsterId === 'brazier' && m.hp <= 0)) continue;
    const seenBy = viewers.some((c) => Math.hypot(c.pos.x - L.pos.x, c.pos.y - L.pos.y) <= 14 && canSee(w, c.pos, L.pos));
    if (!seenBy) continue;
    for (let y = L.pos.y - L.r; y <= L.pos.y + L.r; y++) {
      for (let x = L.pos.x - L.r; x <= L.pos.x + L.r; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (Math.hypot(x - L.pos.x, y - L.pos.y) > L.r + 0.5) continue;
        if (!canSee(w, L.pos, { x, y })) continue;
        if (viewers.some((c) => canSee(w, c.pos, { x, y }))) vis[y * W + x] = 1;
      }
    }
  }
  return vis;
}

export interface PathOpts {
  /** Creatures whose squares block (combat). */
  blockers?: Creature[];
  /** Avoid known armed traps (exploration). */
  avoidTraps?: boolean;
  maxCost?: number;
  /** Allow ending on the goal even if it blocks (to path next to an object). */
  allowGoalBlocked?: boolean;
  /** Can pass through (but not end on) these creatures' squares. */
  passThrough?: Creature[];
  /** Squares this mover may never enter (e.g. undead and the Last Candle). */
  forbid?: (p: Pos) => boolean;
}

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** Dijkstra over the grid; returns cost map and parent links from `start`. */
export function floodCosts(w: World, start: Pos, opts: PathOpts = {}): { cost: Float32Array; parent: Int32Array } {
  const { w: W, h: H } = w.def;
  const cost = new Float32Array(W * H).fill(Infinity);
  const parent = new Int32Array(W * H).fill(-1);
  const idx = (p: Pos) => p.y * W + p.x;
  cost[idx(start)] = 0;
  const open: number[] = [idx(start)];
  const max = opts.maxCost ?? Infinity;
  const blockSet = new Set((opts.blockers ?? []).filter((c) => c.hp > 0 || (c.kind === 'pc' && !c.death.dead)).map((c) => c.pos.y * W + c.pos.x));
  const passSet = new Set((opts.passThrough ?? []).map((c) => c.pos.y * W + c.pos.x));
  while (open.length) {
    // small grid: linear min extraction is fine
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (cost[open[i]] < cost[open[bi]]) bi = i;
    const cur = open.splice(bi, 1)[0];
    const cx = cur % W, cy = (cur / W) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const np = { x: nx, y: ny };
      if (blocksMove(w, np)) continue;
      if (dx && dy && (blocksMove(w, { x: cx + dx, y: cy }) || blocksMove(w, { x: cx, y: cy + dy }))) continue;
      const ni = ny * W + nx;
      if (blockSet.has(ni) && !passSet.has(ni)) continue;
      if (opts.avoidTraps && knownArmedTrapAt(w, np)) continue;
      if (opts.forbid?.(np)) continue;
      const c = cost[cur] + moveCost(w, np);
      if (c > max) continue;
      if (c < cost[ni]) {
        cost[ni] = c;
        parent[ni] = cur;
        open.push(ni);
      }
    }
  }
  // Squares occupied by pass-through allies can't be end points.
  for (const i of passSet) cost[i] = Infinity;
  return { cost, parent };
}

export function pathTo(w: World, start: Pos, goal: Pos, opts: PathOpts = {}): Pos[] | null {
  const { cost, parent } = floodCosts(w, start, opts);
  const W = w.def.w;
  const gi = goal.y * W + goal.x;
  if (!isFinite(cost[gi])) return null;
  const path: Pos[] = [];
  let cur = gi;
  while (cur !== -1 && cur !== start.y * W + start.x) {
    path.push({ x: cur % W, y: (cur / W) | 0 });
    cur = parent[cur];
  }
  return path.reverse();
}

/** Nearest reachable square adjacent to `target` (for walking up to objects). */
export function pathAdjacent(w: World, start: Pos, target: Pos, opts: PathOpts = {}): Pos[] | null {
  if (Math.max(Math.abs(start.x - target.x), Math.abs(start.y - target.y)) <= 1) return [];
  const { cost } = floodCosts(w, start, opts);
  const W = w.def.w;
  let best: Pos | null = null;
  let bc = Infinity;
  for (const [dx, dy] of DIRS) {
    const p = { x: target.x + dx, y: target.y + dy };
    if (p.x < 0 || p.y < 0 || p.x >= W || p.y >= w.def.h) continue;
    const c = cost[p.y * W + p.x];
    if (c < bc) { bc = c; best = p; }
  }
  return best ? pathTo(w, start, best, opts) : null;
}

export function occupied(w: World, p: Pos): boolean {
  return !!creatureAt(w, p);
}
