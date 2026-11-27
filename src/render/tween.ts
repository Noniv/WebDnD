// Minimal promise-based tweens driven by one Pixi ticker.
import type { Ticker } from 'pixi.js';

type Ease = (t: number) => number;
export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
};

interface Job { t: number; ms: number; step: (k: number) => void; done: () => void }
const jobs = new Set<Job>();
let reduced = false;
/** Game speed: every animation and pause is multiplied by this (Relaxed > 1, Fast < 1). */
let timeScale = 1;
export function setTimeScale(v: number): void { timeScale = v; document.documentElement.style.setProperty('--pace', String(v)); }
export function getTimeScale(): number { return timeScale; }

export function setReducedMotion(v: boolean): void { reduced = v; }
export function isReducedMotion(): boolean { return reduced; }

export function installTweens(ticker: Ticker): void {
  ticker.add((tk) => {
    for (const j of [...jobs]) {
      j.t += tk.deltaMS;
      const k = Math.min(1, j.t / j.ms);
      j.step(k);
      if (k >= 1) { jobs.delete(j); j.done(); }
    }
  });
}

/** Animate numeric props of `obj` from their current values to `to`. */
export function tween(obj: object, to: Record<string, number>, ms: number, e: Ease = ease.outCubic): Promise<void> {
  const from: Record<string, number> = {};
  for (const k of Object.keys(to)) from[k] = (obj as Record<string, number>)[k];
  return animate(ms, (k) => {
    const v = e(k);
    for (const key of Object.keys(to)) (obj as Record<string, number>)[key] = from[key] + (to[key] - from[key]) * v;
  });
}

export function animate(ms: number, step: (k: number) => void): Promise<void> {
  ms *= timeScale;
  return new Promise((done) => {
    if (ms <= 0) { step(1); done(); return; }
    jobs.add({ t: 0, ms, step, done });
  });
}

export function wait(ms: number): Promise<void> {
  return animate(ms, () => {});
}
