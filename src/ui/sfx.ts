// Procedural sound: no audio files, everything synthesised with Web Audio.
// Family: wood, stone and bone. Dice clatter, thuds, a struck bell for successes.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 0.6;
let muted = false;

export function initAudio(): void {
  if (ctx) { void ctx.resume(); return; }
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

export function setVolume(v: number): void {
  volume = v;
  if (master) master.gain.value = muted ? 0 : v;
}
export function setMuted(m: boolean): void {
  muted = m;
  if (master) master.gain.value = m ? 0 : volume;
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.2, delay = 0, slideTo?: number): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain = 0.2, delay = 0, freq = 2000, q = 1, type: BiquadFilterType = 'bandpass'): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

export const sfx = {
  ui: () => tone(660, 0.05, 'triangle', 0.08),
  deny: () => { tone(180, 0.12, 'square', 0.06); tone(150, 0.12, 'square', 0.05, 0.06); },
  dice: () => { for (let i = 0; i < 7; i++) noise(0.03, 0.25, i * 0.07 + Math.random() * 0.03, 2500 + Math.random() * 2500, 4); },
  thunk: () => { noise(0.08, 0.35, 0, 600, 1.5); tone(120, 0.12, 'sine', 0.2); },
  success: () => { tone(523, 0.35, 'triangle', 0.12); tone(784, 0.5, 'triangle', 0.1, 0.08); },
  fail: () => { tone(220, 0.3, 'sawtooth', 0.05, 0, 160); },
  crit: () => { tone(1046, 0.6, 'sine', 0.12, 0.05); tone(1568, 0.7, 'sine', 0.08, 0.12); },
  hit: () => { noise(0.12, 0.45, 0, 400, 0.8, 'lowpass'); tone(90, 0.15, 'sine', 0.25); },
  miss: () => noise(0.18, 0.15, 0, 1800, 0.6, 'highpass'),
  spell: () => { for (let i = 0; i < 5; i++) tone(700 + i * 180, 0.25, 'sine', 0.05, i * 0.04); },
  fire: () => noise(0.4, 0.35, 0, 700, 0.5, 'lowpass'),
  heal: () => { [392, 494, 587, 784].forEach((f, i) => tone(f, 0.3, 'sine', 0.07, i * 0.07)); },
  door: () => { tone(110, 0.5, 'sawtooth', 0.05, 0, 80); noise(0.3, 0.1, 0.1, 300, 1); },
  step: () => noise(0.03, 0.06, 0, 900, 2),
  trap: () => { noise(0.05, 0.3, 0, 3000, 3); noise(0.05, 0.3, 0.05, 3500, 3); noise(0.05, 0.3, 0.1, 3200, 3); },
  level: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.6, 'triangle', 0.09, i * 0.12)); },
  death: () => { tone(196, 1.2, 'sine', 0.12, 0, 98); },
  coin: () => { tone(1318, 0.12, 'square', 0.04); tone(1760, 0.18, 'square', 0.03, 0.06); },
};
