// The signature moment: a d20 tumbles, settles, and the DC is stamped like a wax seal.
import { Application, BitmapFont, BitmapText, Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import { CONFIG } from '../config';
import type { TestResult } from '../rules/checks';
import { fmtMod, rand } from '../rules/dice';
import { sfx } from '../ui/sfx';
import { PAL, tex } from './textures';
import { animate, ease, isReducedMotion, tween, wait } from './tween';

let installed = false;
function installFont(): void {
  if (installed) return;
  installed = true;
  BitmapFont.install({
    name: 'DieFont',
    chars: '0123456789',
    resolution: Math.min(3, window.devicePixelRatio || 1),
    padding: 6,
    style: { fontFamily: 'Cinzel, Georgia, serif', fontWeight: '800', fontSize: 64, fill: 0xffffff },
  });
}

const display = (style: Partial<{ size: number; color: number; weight: string; family: string; wrap: number }> = {}) => ({
  fontFamily: style.family ?? 'Cinzel, Georgia, serif',
  fontWeight: (style.weight ?? '800') as '800',
  fontSize: style.size ?? 22,
  fill: style.color ?? PAL.ivory,
  stroke: { color: PAL.night, width: 4 },
  padding: 6,
  align: 'center' as const,
  wordWrap: !!style.wrap,
  wordWrapWidth: style.wrap ?? 300,
});

export class DiceOverlay {
  app: Application;
  root = new Container();
  private skip: (() => void) | null = null;
  fast = false;

  constructor(app: Application) {
    this.app = app;
    this.root.visible = false;
    this.root.eventMode = 'static';
    this.root.on('pointertap', () => this.skip?.());
    app.stage.addChild(this.root);
  }

  private dur(ms: number): number {
    return this.fast ? ms * 0.35 : ms;
  }

  private makeDie(size: number): { c: Container; num: BitmapText; face: Sprite } {
    installFont();
    const c = new Container();
    const ring = new Sprite(tex('ui/medallion'));
    ring.anchor.set(0.5);
    ring.setSize(size * 1.42, size * 1.42);
    ring.alpha = 0.95;
    c.addChild(ring);
    const face = new Sprite(tex('icons/d20'));
    face.anchor.set(0.5);
    face.setSize(size, size);
    const num = new BitmapText({ text: '20', style: { fontFamily: 'DieFont', fontSize: size * 0.34, fill: PAL.ink } });
    num.anchor.set(0.5);
    num.y = size * 0.04;
    c.addChild(face, num);
    return { c, num, face };
  }

  private open(): { panel: Container; cx: number; cy: number } {
    this.root.removeChildren().forEach((c) => c.destroy({ children: true }));
    const sw = this.app.screen.width, sh = this.app.screen.height;
    this.root.hitArea = new Rectangle(0, 0, sw, sh);
    const dim = new Graphics().rect(0, 0, sw, sh).fill({ color: PAL.night, alpha: 0.62 });
    this.root.addChild(dim);
    const panel = new Container();
    this.root.addChild(panel);
    this.root.visible = true;
    this.root.alpha = 0;
    void tween(this.root, { alpha: 1 }, 120);
    return { panel, cx: sw / 2, cy: sh * 0.42 };
  }

  private async close(): Promise<void> {
    await tween(this.root, { alpha: 0 }, 140);
    this.root.visible = false;
    this.root.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.skip = null;
  }

  /** Waits for `ms` or a tap, whichever comes first. */
  private hold(ms: number): Promise<void> {
    return new Promise((res) => {
      let done = false;
      const fin = () => { if (!done) { done = true; this.skip = null; res(); } };
      this.skip = fin;
      void wait(ms).then(fin);
    });
  }

  async show(r: TestResult, note?: string): Promise<void> {
    const { panel, cx, cy } = this.open();
    const size = Math.min(150, this.app.screen.width * 0.32);
    const two = r.d20.rolls.length === 2;
    const dice = r.d20.rolls.map(() => this.makeDie(two ? size * 0.82 : size));
    dice.forEach((d, i) => {
      d.c.position.set(cx + (two ? (i === 0 ? -1 : 1) * size * 0.5 : 0), cy);
      panel.addChild(d.c);
    });
    const title = new Text({ text: `${r.who} · ${r.label}${note ? ` ${note}` : ''}`, style: display({ size: 20, color: PAL.goldHi, wrap: this.app.screen.width - 40 }), anchor: 0.5 });
    title.position.set(cx, cy - size * 0.98);
    panel.addChild(title);
    sfx.dice();
    // Tumble
    const tumble = this.dur(CONFIG.DICE_TUMBLE_MS);
    let lastSwap = 0;
    await Promise.race([
      animate(tumble, (k) => {
        const now = performance.now();
        dice.forEach((d, i) => {
          d.c.rotation = (1 - ease.outCubic(k)) * (i ? -9 : 9);
          const s = 1 + Math.sin(k * Math.PI) * 0.25;
          d.c.scale.set(s);
          if (!isReducedMotion()) d.c.y = cy - Math.abs(Math.sin(k * Math.PI * 3)) * 26 * (1 - k);
        });
        if (now - lastSwap > 55 && k < 0.9) {
          lastSwap = now;
          dice.forEach((d) => (d.num.text = String(1 + Math.floor(rand() * 20))));
        }
      }),
      new Promise<void>((res) => (this.skip = res)),
    ]);
    // Settle
    dice.forEach((d, i) => {
      d.c.rotation = 0;
      d.c.scale.set(1);
      d.c.y = cy;
      d.num.text = String(r.d20.rolls[i]);
      const keptIdx = r.d20.rolls.indexOf(r.d20.kept);
      if (two && i !== keptIdx) { d.c.alpha = 0.35; d.c.scale.set(0.8); }
      if (r.d20.kept === 20 && (i === keptIdx || !two)) d.face.tint = 0xffe08a;
      if (r.d20.kept === 1 && (i === keptIdx || !two)) d.face.tint = 0xff9a8a;
    });
    sfx.thunk();
    // Formula
    const parts = [`${r.d20.kept}`, r.bonus !== 0 ? fmtMod(r.bonus).replace('+', '+ ').replace('-', '− ') : '', ...r.extras.map((e) => `+ ${e.value} ${e.label}`)].filter(Boolean);
    const formula = new Text({ text: `${parts.join(' ')} = ${r.total}`, style: display({ size: 26, color: PAL.goldHi }), anchor: 0.5 });
    formula.position.set(cx, cy + size * 0.8);
    panel.addChild(formula);
    const reasons = [
      r.d20.adv === 'advantage' ? `Advantage: ${r.advReasons.join(', ')}` : '',
      r.d20.adv === 'disadvantage' ? `Disadvantage: ${r.disReasons.join(', ')}` : '',
      r.d20.adv === 'normal' && r.advReasons.length && r.disReasons.length ? 'Advantage and disadvantage cancel' : '',
      r.d20.rerolledOne ? 'Halfling Luck rerolled a 1' : '',
    ].filter(Boolean).join('\n');
    if (reasons) {
      const rt = new Text({ text: reasons, style: display({ size: 15, weight: '700', family: 'Alegreya Sans, sans-serif', color: 0xa7a3c4, wrap: this.app.screen.width - 40 }), anchor: 0.5 });
      rt.position.set(cx, cy + size * 0.8 + 34);
      panel.addChild(rt);
    }
    // Seal
    const special = r.crit ? 'CRITICAL!' : r.fumble ? 'NATURAL 1' : r.success ? 'SUCCESS' : 'FAILURE';
    const col = r.crit ? PAL.gold : r.success ? PAL.verdigris : PAL.blood;
    const seal = new Container();
    const disc = new Graphics().circle(0, 0, 40).fill(col).stroke({ width: 3, color: PAL.goldHi });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      disc.circle(Math.cos(a) * 40, Math.sin(a) * 40, 6).fill(col);
    }
    const st = new Text({ text: `${r.targetKind}\n${r.target}`, style: { ...display({ size: 20, color: PAL.parchment }), lineHeight: 20 }, anchor: 0.5 });
    seal.addChild(disc, st);
    seal.position.set(cx + size * (two ? 1.1 : 0.86), cy - size * 0.48);
    panel.addChild(seal);
    const verdict = new Text({ text: special, style: display({ size: 34, color: col }), anchor: 0.5 });
    verdict.position.set(cx, cy + size * 0.8 + (reasons ? 70 : 44));
    panel.addChild(verdict);
    seal.scale.set(2.4);
    seal.alpha = 0;
    void tween(seal, { alpha: 1 }, 90);
    await tween(seal.scale, { x: 1, y: 1 }, this.dur(220), ease.outBack);
    if (r.success) sfx.success(); else sfx.fail();
    if (r.crit) sfx.crit();
    verdict.scale.set(0.6);
    void tween(verdict.scale, { x: 1, y: 1 }, 200, ease.outBack);
    await this.hold(this.dur(CONFIG.DICE_HOLD_MS) + (reasons ? 250 : 0));
    await this.close();
  }

  async showMany(rs: TestResult[], titleText: string): Promise<void> {
    if (!rs.length) return;
    const { panel, cx, cy } = this.open();
    const sw = this.app.screen.width;
    const title = new Text({ text: titleText, style: display({ size: 20, wrap: sw - 40 }), anchor: 0.5 });
    title.position.set(cx, cy - 120);
    panel.addChild(title);
    const cols = Math.min(rs.length, sw < 420 ? 3 : 4);
    const cell = Math.min(110, (sw - 30) / cols);
    const rows = Math.ceil(rs.length / cols);
    const items = rs.map((r, i) => {
      const d = this.makeDie(cell * 0.62);
      const col = i % cols, row = Math.floor(i / cols);
      const n = Math.min(cols, rs.length - row * cols);
      const x = cx + (col - (n - 1) / 2) * cell;
      const y = cy - 40 + row * (cell + 40) - (rows - 1) * 30;
      d.c.position.set(x, y);
      const name = new Text({ text: r.who.split(',')[0], style: display({ size: 13, weight: '700', family: 'Alegreya Sans, sans-serif', wrap: cell - 4 }), anchor: 0.5 });
      name.position.set(x, y - cell * 0.42);
      panel.addChild(d.c, name);
      return { r, d, x, y };
    });
    sfx.dice();
    let last = 0;
    await Promise.race([
      animate(this.dur(CONFIG.DICE_TUMBLE_MS), (k) => {
        items.forEach(({ d }, i) => { d.c.rotation = (1 - ease.outCubic(k)) * (i % 2 ? -8 : 8); });
        const now = performance.now();
        if (now - last > 60 && k < 0.9) { last = now; items.forEach(({ d }) => (d.num.text = String(1 + Math.floor(rand() * 20)))); }
      }),
      new Promise<void>((res) => (this.skip = res)),
    ]);
    sfx.thunk();
    for (const { r, d, x, y } of items) {
      d.c.rotation = 0;
      d.num.text = String(r.d20.kept);
      const col = r.success ? PAL.verdigris : PAL.blood;
      const t = new Text({ text: `${r.total} vs ${r.target}\n${r.success ? '✓' : '✗'}`, style: { ...display({ size: 16, color: col }), lineHeight: 18 }, anchor: 0.5 });
      t.position.set(x, y + cell * 0.48);
      panel.addChild(t);
    }
    const ok = rs.filter((r) => r.success).length;
    if (ok >= rs.length / 2) sfx.success(); else sfx.fail();
    await this.hold(this.dur(CONFIG.DICE_HOLD_MS + 500));
    await this.close();
  }
}
