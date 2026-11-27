// The playfield: tiles, props, tokens, fog of war, highlights and effects.
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { CONFIG } from '../config';
import type { Creature } from '../rules/creature';
import type { ConditionId, Pos } from '../rules/types';
import type { MapObject } from '../game/dungeon';
import type { World } from '../game/state';
import type { Marks } from '../net/protocol';
import { PAL, glowTexture, tex } from './textures';
import { animate, ease, isReducedMotion, tween, wait } from './tween';

const T = CONFIG.TILE;

interface TokenView {
  root: Container;
  body: Container;
  sprite: Sprite;
  hp: Graphics;
  ring: Graphics;
  badges: Container;
  lastKey: string;
}

export class MapView {
  app: Application;
  root = new Container();
  world = new Container();
  floor = new Container();
  props = new Container();
  lights = new Container();
  hl = new Graphics();
  hlLabels = new Container();
  pathG = new Graphics();
  tokens = new Container();
  fog = new Sprite();
  fx = new Container();
  private fogCanvas = document.createElement('canvas');
  private fogTex: Texture | null = null;
  private tokenViews = new Map<string, TokenView>();
  private propSprites = new Map<string, Sprite[]>();
  w: World | null = null;
  zoom = 1.15;
  private cam = { x: 0, y: 0 };
  private camTarget = { x: 0, y: 0 };
  private follow = true;
  private shakeAmt = 0;
  private activeId: string | null = null;
  onTap: (p: Pos) => void = () => {};
  private visible: Uint8Array | null = null;
  /** Guests glide tokens to new squares instead of snapping (no path data). */
  smoothMoves = false;
  /** Ids currently being moved by an animation (sync must not snap them). */
  private moving = new Set<string>();

  constructor(app: Application) {
    this.app = app;
    this.root.addChild(this.world);
    this.world.addChild(this.floor, this.props, this.lights, this.hl, this.pathG, this.tokens, this.fog, this.hlLabels, this.fx);
    this.lights.blendMode = 'add';
    app.stage.addChild(this.root);
    app.ticker.add((tk) => this.tick(tk.deltaMS));
    this.bindInput();
  }

  // ---------- Build ----------

  build(w: World): void {
    this.w = w;
    this.floor.removeChildren().forEach((c) => c.destroy());
    this.props.removeChildren().forEach((c) => c.destroy());
    this.lights.removeChildren().forEach((c) => c.destroy());
    this.tokens.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.tokenViews.clear();
    this.propSprites.clear();
    const { def } = w;
    let n = 0;
    for (let y = 0; y < def.h; y++) {
      for (let x = 0; x < def.w; x++) {
        const k = def.tiles[y][x];
        const h = (x * 73856093) ^ (y * 19349663) ^ w.state.omen.seed;
        n = Math.abs(h) % 7;
        const key = k === 'wall' ? 'tiles/wall' : k === 'crypt' ? 'tiles/crypt_floor' : k === 'rubble' ? 'tiles/rubble' : `tiles/floor_${n < 4 ? 1 : n < 6 ? 2 : 3}`;
        if (k === 'wall' && !this.nearFloor(x, y)) continue;
        const s = new Sprite(tex(key));
        s.position.set(x * T, y * T);
        s.setSize(T + 0.5, T + 0.5);
        this.floor.addChild(s);
      }
    }
    // Glows for lights
    const g = glowTexture(this.app.renderer);
    for (const L of def.lights) {
      const s = new Sprite(g);
      s.anchor.set(0.5);
      s.position.set((L.pos.x + 0.5) * T, (L.pos.y + 0.5) * T);
      s.setSize(L.r * 2.4 * T, L.r * 2.4 * T);
      s.tint = L.color;
      s.alpha = 0.42;
      s.label = `light-${L.pos.x}-${L.pos.y}`;
      this.lights.addChild(s);
    }
    // Fog canvas: 2 px per tile so the linear filter gives a soft but tight edge.
    this.fogCanvas.width = def.w * 2;
    this.fogCanvas.height = def.h * 2;
    this.fogTex?.destroy(true);
    this.fogTex = Texture.from(this.fogCanvas);
    this.fogTex.source.scaleMode = 'linear';
    this.fog.texture = this.fogTex;
    this.fog.setSize(def.w * T, def.h * T);
    this.syncProps();
    this.syncTokens();
    const lead = w.state.party[w.state.leader] ?? w.state.party[0];
    this.focus(lead.pos, true);
  }

  private nearFloor(x: number, y: number): boolean {
    const d = this.w!.def;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const xx = x + i, yy = y + j;
      if (xx >= 0 && yy >= 0 && xx < d.w && yy < d.h && d.tiles[yy][xx] !== 'wall') return true;
    }
    return false;
  }

  private propKey(o: MapObject): string | null {
    switch (o.kind) {
      case 'door': return o.open ? 'tiles/door_open' : o.locked ? 'tiles/door_locked' : 'tiles/door_closed';
      case 'secret': return o.hidden ? null : o.open ? 'tiles/door_open' : 'tiles/door_secret';
      case 'chest': return o.looted ? 'tiles/chest_open' : 'tiles/chest_closed';
      case 'cache': return o.hidden ? null : o.looted ? null : 'tiles/loose_stone';
      case 'trap': return o.hidden ? null : o.armed ? 'tiles/trap_plate' : 'tiles/trap_disarmed';
      case 'shrine': return 'tiles/shrine';
      case 'campfire': return 'tiles/campfire';
      case 'stairs': return 'tiles/stairs_up';
      case 'bones': return 'tiles/bones';
    }
  }

  syncProps(): void {
    if (!this.w) return;
    for (const o of this.w.state.objects) {
      const key = this.propKey(o);
      const tiles = o.tiles ?? [o.pos];
      let list = this.propSprites.get(o.id);
      if (!key) {
        list?.forEach((s) => (s.visible = false));
        continue;
      }
      if (!list) {
        list = tiles.map((p) => {
          const s = new Sprite();
          s.position.set(p.x * T, p.y * T);
          this.props.addChild(s);
          return s;
        });
        this.propSprites.set(o.id, list);
      }
      for (const s of list) {
        const t = tex(key);
        if (s.texture !== t) { s.texture = t; s.setSize(T, T); }
        s.visible = true;
      }
    }
    // Brazier lives in the monsters list
    const br = this.w.state.monsters.find((m) => m.monsterId === 'brazier');
    if (br) {
      const lit = br.hp > 0;
      const light = this.lights.children.find((c) => c.label === `light-${br.pos.x}-${br.pos.y}`);
      if (light) light.visible = lit;
    }
  }

  // ---------- Tokens ----------

  private makeToken(c: Creature): TokenView {
    const root = new Container();
    const body = new Container();
    const shadow = new Graphics().ellipse(0, T * 0.32, T * 0.38, T * 0.12).fill({ color: 0x000000, alpha: 0.45 });
    const ring = new Graphics();
    const sprite = new Sprite(tex(c.monsterId === 'brazier' ? 'tiles/brazier' : `tokens/${c.token}`));
    sprite.anchor.set(0.5);
    const size = c.monsterId === 'ash-warden' ? T * 1.18 : c.monsterId === 'brazier' ? T : T * 0.92;
    sprite.setSize(size, size);
    const hp = new Graphics();
    const badges = new Container();
    badges.position.set(-T * 0.42, -T * 0.52);
    body.addChild(sprite);
    root.addChild(shadow, ring, body, hp, badges);
    this.tokens.addChild(root);
    const v: TokenView = { root, body, sprite, hp, ring, badges, lastKey: '' };
    this.tokenViews.set(c.id, v);
    root.position.set((c.pos.x + 0.5) * T, (c.pos.y + 0.5) * T);
    return v;
  }

  syncTokens(): void {
    if (!this.w) return;
    const all = [...this.w.state.party, ...this.w.state.monsters];
    for (const c of all) {
      let v = this.tokenViews.get(c.id);
      if (!v) v = this.makeToken(c);
      if (!this.moving.has(c.id)) {
        const tx = (c.pos.x + 0.5) * T, ty = (c.pos.y + 0.5) * T;
        const far = Math.hypot(tx - v.root.x, ty - v.root.y);
        if (this.smoothMoves && far > 1 && far < T * 4) {
          const vv = v;
          this.moving.add(c.id);
          void tween(vv.root, { x: tx, y: ty }, Math.min(400, far * 3)).then(() => this.moving.delete(c.id));
        } else v.root.position.set(tx, ty);
      }
      v.root.zIndex = c.pos.y * 10 + (c.kind === 'pc' ? 1 : 0);
      const down = c.kind === 'pc' ? c.hp <= 0 : c.hp <= 0;
      const dead = c.kind === 'pc' ? c.death.dead : c.hp <= 0;
      const isBrazier = c.monsterId === 'brazier';
      if (isBrazier) {
        v.sprite.texture = tex(c.hp > 0 ? 'tiles/brazier' : 'tiles/brazier_out');
        v.sprite.setSize(T, T);
      }
      // visibility (fog)
      const seen = c.kind === 'pc' || !this.visible || this.visible[c.pos.y * this.w.def.w + c.pos.x] === 1;
      v.root.visible = c.kind === 'pc' ? true : seen && (!dead || isBrazier);
      v.body.rotation = down && !isBrazier ? Math.PI / 2 : 0;
      v.sprite.tint = c.kind === 'pc' && c.death.dead ? 0x555555 : down && !isBrazier ? 0x9a8f80 : 0xffffff;
      v.root.alpha = c.conds.hidden ? 0.55 : 1;
      // HP bar
      const key = `${c.hp}/${c.maxHp}/${c.tempHp}/${Object.keys(c.conds).join(',')}/${this.activeId === c.id}`;
      if (key !== v.lastKey) {
        v.lastKey = key;
        v.hp.clear();
        if (!isBrazier || c.hp > 0) {
          const wdt = T * 0.8, y = T * 0.42;
          const frac = Math.max(0, c.hp / c.maxHp);
          const col = c.faction === 'party' ? (frac > 0.5 ? PAL.verdigris : frac > 0.25 ? PAL.gold : PAL.blood) : PAL.blood;
          v.hp.rect(-wdt / 2 - 1, y - 1, wdt + 2, 6).fill(PAL.ink);
          v.hp.rect(-wdt / 2, y, wdt * frac, 4).fill(col);
        }
        v.badges.removeChildren().forEach((b) => b.destroy());
        const conds = Object.keys(c.conds) as ConditionId[];
        conds.filter((k) => k !== 'unconscious' || c.kind === 'pc').slice(0, 4).forEach((k, i) => {
          const icon = new Sprite(tex(`icons/${condIcon(k)}`));
          icon.setSize(T * 0.3, T * 0.3);
          icon.position.set(i * T * 0.27, 0);
          v!.badges.addChild(icon);
        });
        v.ring.clear();
        if (this.activeId === c.id) v.ring.circle(0, 0, T * 0.52).stroke({ width: 2.5, color: PAL.goldHi });
      }
    }
    this.tokens.sortChildren();
  }

  setActive(id: string | null): void {
    this.activeId = id;
    this.syncTokens();
  }

  async moveToken(c: Creature, path: Pos[], ms: number): Promise<void> {
    const v = this.tokenViews.get(c.id) ?? this.makeToken(c);
    this.moving.add(c.id);
    for (const p of path) {
      const tx = (p.x + 0.5) * T, ty = (p.y + 0.5) * T;
      const sx = v.root.x, sy = v.root.y;
      await animate(ms, (k) => {
        const e = ease.inOutSine(k);
        v.root.x = sx + (tx - sx) * e;
        v.root.y = sy + (ty - sy) * e - Math.sin(k * Math.PI) * 4;
      });
      if (c.kind === 'pc' && c.id === this.w?.state.party[this.w.state.leader]?.id) this.focus(p);
    }
    this.moving.delete(c.id);
  }

  /** Animate several tokens in lock-step (party walking in a line). */
  async moveGroup(steps: { c: Creature; to: Pos }[], ms: number): Promise<void> {
    const anims = steps.map(({ c, to }) => {
      const v = this.tokenViews.get(c.id) ?? this.makeToken(c);
      this.moving.add(c.id);
      return { c, v, sx: v.root.x, sy: v.root.y, tx: (to.x + 0.5) * T, ty: (to.y + 0.5) * T };
    });
    await animate(ms, (k) => {
      const e = ease.linear(k);
      for (const a of anims) {
        a.v.root.x = a.sx + (a.tx - a.sx) * e;
        a.v.root.y = a.sy + (a.ty - a.sy) * e - Math.sin(k * Math.PI) * 3;
      }
    });
    anims.forEach((a) => this.moving.delete(a.c.id));
  }

  // ---------- Fog ----------

  updateFog(vis: Uint8Array, seen: number[]): void {
    if (!this.w) return;
    this.visible = vis;
    const { w: W, h: H } = this.w.def;
    const ctx = this.fogCanvas.getContext('2d')!;
    const img = ctx.createImageData(W * 2, H * 2);
    for (let y = 0; y < H * 2; y++) {
      for (let x = 0; x < W * 2; x++) {
        const i = ((y >> 1) * W + (x >> 1));
        const a = vis[i] ? 0 : seen[i] ? 150 : 255;
        const o = (y * W * 2 + x) * 4;
        img.data[o] = 4; img.data[o + 1] = 6; img.data[o + 2] = 14; img.data[o + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.fogTex?.source.update();
    this.syncTokens();
  }

  // ---------- Highlights ----------
  // Every mark is also recorded as plain data so a co-op host can mirror it to guests.

  marks: Marks = {};

  showReach(cost: Float32Array | null): void {
    const reach: number[] = [];
    if (cost) for (let i = 0; i < cost.length; i++) if (isFinite(cost[i]) && cost[i] > 0) reach.push(i);
    this.marks = { ...this.marks, reach, area: null };
    this.drawHl();
  }

  showRange(cells: number[], color: number): void {
    this.marks = { ...this.marks, reach: [], range: { cells, color } };
    this.drawHl();
  }

  showArea(squares: Pos[], color: number): void {
    this.marks = { ...this.marks, reach: [], targets: [], area: { squares, color } };
    this.drawHl();
  }

  showTargets(list: { pos: Pos; ok: boolean; label?: string }[]): void {
    this.marks = { ...this.marks, targets: list };
    this.drawHl();
  }

  showPath(path: Pos[] | null, from?: Pos, label?: string): void {
    this.marks = { ...this.marks, path: path && path.length && from ? { from, steps: path, label } : null };
    this.drawPath();
  }

  clearMarks(): void {
    this.marks = {};
    this.drawHl();
    this.drawPath();
  }

  /** Replace all marks at once (co-op guests). */
  applyMarks(m: Marks): void {
    this.marks = m ?? {};
    this.drawHl();
    this.drawPath();
  }

  private drawHl(): void {
    this.hl.clear();
    this.hlLabels.removeChildren().forEach((c) => c.destroy());
    if (!this.w) return;
    const m = this.marks;
    const W = this.w.def.w;
    if (m.range?.cells.length) {
      for (const i of m.range.cells) this.hl.rect((i % W) * T + 2, ((i / W) | 0) * T + 2, T - 4, T - 4);
      this.hl.fill({ color: m.range.color, alpha: 0.16 }).stroke({ width: 1, color: m.range.color, alpha: 0.5 });
    }
    if (m.reach?.length) {
      for (const i of m.reach) this.hl.rect((i % W) * T + 3, ((i / W) | 0) * T + 3, T - 6, T - 6);
      this.hl.fill({ color: PAL.goldUi, alpha: 0.1 }).stroke({ width: 1, color: PAL.goldHi, alpha: 0.38 });
    }
    if (m.area?.squares.length) {
      for (const p of m.area.squares) this.hl.rect(p.x * T + 2, p.y * T + 2, T - 4, T - 4);
      this.hl.fill({ color: m.area.color, alpha: 0.25 }).stroke({ width: 2, color: m.area.color, alpha: 0.7 });
    }
    for (const t of m.targets ?? []) {
      this.hl.circle((t.pos.x + 0.5) * T, (t.pos.y + 0.5) * T, T * 0.55).stroke({ width: 3, color: t.ok ? PAL.goldHi : 0x8a87a8, alpha: t.ok ? 0.95 : 0.4 });
      if (t.label && t.ok) {
        const txt = new Text({ text: t.label, style: { fontFamily: 'Cinzel, Georgia, serif', fontWeight: '700', fontSize: 15, fill: PAL.goldHi, stroke: { color: PAL.night, width: 4 }, padding: 4 }, anchor: 0.5 });
        txt.position.set((t.pos.x + 0.5) * T, t.pos.y * T - 8);
        this.hlLabels.addChild(txt);
      }
    }
  }

  private drawPath(): void {
    this.pathG.clear();
    this.pathG.removeChildren().forEach((c) => c.destroy());
    const p = this.marks.path;
    if (!p || !p.steps.length) return;
    this.pathG.moveTo((p.from.x + 0.5) * T, (p.from.y + 0.5) * T);
    for (const q of p.steps) this.pathG.lineTo((q.x + 0.5) * T, (q.y + 0.5) * T);
    this.pathG.stroke({ width: 3, color: PAL.goldHi, alpha: 0.8, cap: 'round', join: 'round' });
    const end = p.steps[p.steps.length - 1];
    this.pathG.circle((end.x + 0.5) * T, (end.y + 0.5) * T, 7).fill(PAL.goldHi).stroke({ width: 2, color: PAL.night });
    if (p.label) {
      const t = new Text({ text: p.label, style: { fontFamily: 'Alegreya Sans, sans-serif', fontWeight: '700', fontSize: 16, fill: PAL.parchment, stroke: { color: PAL.ink, width: 4 } }, anchor: 0.5 });
      t.position.set((end.x + 0.5) * T, (end.y + 0.5) * T - 20);
      this.pathG.addChild(t);
    }
  }

  // ---------- Effects ----------

  floatText(at: Pos, text: string, color: number, big = false): void {
    const t = new Text({
      text,
      style: {
        fontFamily: 'Cinzel, Georgia, serif', fontWeight: '800', fontSize: big ? 30 : 20, fill: color,
        stroke: { color: PAL.ink, width: 5 }, padding: 6,
      },
      anchor: 0.5,
    });
    t.position.set((at.x + 0.5) * T + (Math.random() - 0.5) * 10, (at.y + 0.2) * T);
    this.fx.addChild(t);
    t.scale.set(0.4);
    void tween(t.scale, { x: 1, y: 1 }, 180, ease.outBack);
    void tween(t, { y: t.y - 40 }, 900, ease.outCubic).then(() => wait(900)).then(() => tween(t, { alpha: 0 }, 400)).then(() => t.destroy());
  }

  shake(power: number): void {
    if (isReducedMotion()) return;
    this.shakeAmt = Math.max(this.shakeAmt, power);
  }

  flashToken(c: Creature, color: number): void {
    const v = this.tokenViews.get(c.id);
    if (!v) return;
    v.sprite.tint = color;
    void wait(140).then(() => this.syncTokens());
    if (!isReducedMotion()) {
      const ox = v.body.x;
      void animate(220, (k) => { v.body.x = ox + Math.sin(k * Math.PI * 6) * 4 * (1 - k); });
    }
  }

  async projectile(from: Pos, to: Pos, color: number, size = 6, ms = 260): Promise<void> {
    const g = new Graphics().circle(0, 0, size).fill(color).circle(0, 0, size * 2).fill({ color, alpha: 0.25 });
    g.blendMode = 'add';
    this.fx.addChild(g);
    const sx = (from.x + 0.5) * T, sy = (from.y + 0.5) * T, tx = (to.x + 0.5) * T, ty = (to.y + 0.5) * T;
    await animate(ms, (k) => { g.position.set(sx + (tx - sx) * k, sy + (ty - sy) * k - Math.sin(k * Math.PI) * 10); });
    this.burst(to, color, 10);
    g.destroy();
  }

  burst(at: Pos, color: number, n = 12, spread = 26): void {
    for (let i = 0; i < n; i++) {
      const g = new Graphics().circle(0, 0, 2 + Math.random() * 3).fill(color);
      g.blendMode = 'add';
      g.position.set((at.x + 0.5) * T, (at.y + 0.5) * T);
      this.fx.addChild(g);
      const a = Math.random() * Math.PI * 2, r = spread * (0.5 + Math.random());
      void tween(g, { x: g.x + Math.cos(a) * r, y: g.y + Math.sin(a) * r - 10, alpha: 0 }, 420 + Math.random() * 200).then(() => g.destroy());
    }
  }

  async slash(from: Pos, to: Pos): Promise<void> {
    const g = new Graphics();
    const cx = (to.x + 0.5) * T, cy = (to.y + 0.5) * T;
    const ang = Math.atan2(to.y - from.y, to.x - from.x);
    g.arc(0, 0, T * 0.45, -0.9, 0.9).stroke({ width: 5, color: PAL.parchment, cap: 'round' });
    g.position.set(cx, cy);
    g.rotation = ang + Math.PI;
    this.fx.addChild(g);
    await tween(g, { rotation: ang + Math.PI + 1.2, alpha: 0 }, 180, ease.outQuad);
    g.destroy();
  }

  async areaFx(squares: Pos[], color: number): Promise<void> {
    const g = new Graphics();
    for (const p of squares) g.rect(p.x * T, p.y * T, T, T);
    g.fill({ color, alpha: 0.5 });
    g.blendMode = 'add';
    this.fx.addChild(g);
    for (const p of squares) this.burst(p, color, 4, 16);
    await tween(g, { alpha: 0 }, 450);
    g.destroy();
  }

  async ring(at: Pos, color: number, radius: number): Promise<void> {
    const g = new Graphics().circle(0, 0, radius * T).stroke({ width: 6, color });
    g.position.set((at.x + 0.5) * T, (at.y + 0.5) * T);
    g.scale.set(0.1);
    g.blendMode = 'add';
    this.fx.addChild(g);
    await tween(g.scale, { x: 1, y: 1 }, 380, ease.outCubic);
    await tween(g, { alpha: 0 }, 200);
    g.destroy();
  }

  // ---------- Camera ----------

  focus(p: Pos, instant = false): void {
    this.follow = true;
    this.camTarget = { x: (p.x + 0.5) * T, y: (p.y + 0.5) * T };
    if (instant) this.cam = { ...this.camTarget };
  }

  /** Space reserved by the HUD (top, bottom) so the focus point sits in the open area. */
  insets = { top: 120, bottom: 170 };

  private tick(dms: number): void {
    const k = Math.min(1, dms / 140);
    this.cam.x += (this.camTarget.x - this.cam.x) * k;
    this.cam.y += (this.camTarget.y - this.cam.y) * k;
    const sw = this.app.screen.width, sh = this.app.screen.height;
    const cy = this.insets.top + (sh - this.insets.top - this.insets.bottom) / 2;
    let ox = 0, oy = 0;
    if (this.shakeAmt > 0.2) {
      ox = (Math.random() - 0.5) * this.shakeAmt * 2;
      oy = (Math.random() - 0.5) * this.shakeAmt * 2;
      this.shakeAmt *= 0.86;
    }
    this.world.scale.set(this.zoom);
    this.world.position.set(Math.round(sw / 2 - this.cam.x * this.zoom + ox), Math.round(cy - this.cam.y * this.zoom + oy));
    // flicker lights
    const t = performance.now() / 1000;
    this.lights.children.forEach((l, i) => { l.alpha = 0.36 + Math.sin(t * 3.1 + i * 1.7) * 0.04 + Math.sin(t * 7.3 + i) * 0.03; });
    const act = this.activeId ? this.tokenViews.get(this.activeId) : undefined;
    if (act) act.ring.alpha = 0.6 + Math.sin(t * 5) * 0.4;
  }

  screenToTile(sx: number, sy: number): Pos {
    const x = (sx - this.world.x) / this.zoom / T;
    const y = (sy - this.world.y) / this.zoom / T;
    return { x: Math.floor(x), y: Math.floor(y) };
  }

  private bindInput(): void {
    const el = this.app.canvas as HTMLCanvasElement;
    const pts = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
    let pinch: { d: number; zoom: number } | null = null;
    let dragged = false;
    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      const p = local(e);
      pts.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now() });
      dragged = pts.size > 1 ? true : false;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom };
      }
    });
    el.addEventListener('pointermove', (e) => {
      const q = pts.get(e.pointerId);
      if (!q) return;
      const p = local(e);
      const dx = p.x - q.x, dy = p.y - q.y;
      q.x = p.x; q.y = p.y;
      if (pts.size === 1) {
        if (Math.hypot(p.x - q.sx, p.y - q.sy) > 10) dragged = true;
        if (dragged) {
          this.follow = false;
          this.cam.x -= dx / this.zoom;
          this.cam.y -= dy / this.zoom;
          this.camTarget = { ...this.cam };
        }
      } else if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoom = clamp(pinch.zoom * (d / pinch.d), CONFIG.ZOOM_MIN, CONFIG.ZOOM_MAX);
      }
    });
    const up = (e: PointerEvent) => {
      const q = pts.get(e.pointerId);
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (!q || dragged) { if (pts.size === 0) dragged = false; return; }
      if (performance.now() - q.t < 600) this.onTap(this.screenToTile(q.x, q.y));
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); pinch = null; dragged = false; });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = clamp(this.zoom * (e.deltaY > 0 ? 0.9 : 1.1), CONFIG.ZOOM_MIN, CONFIG.ZOOM_MAX);
    }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get following(): boolean { return this.follow; }
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function condIcon(k: ConditionId): string {
  const m: Partial<Record<ConditionId, string>> = {
    asleep: 'unconscious', guided: 'blessed', shielded: 'shield_spell', slowed: 'sapped', turned: 'turn_undead', vexed: 'steady_aim', aimed: 'steady_aim',
  };
  return m[k] ?? k;
}
