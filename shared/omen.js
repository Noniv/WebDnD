// Daily omen: a small, deterministic twist on the delve, shared by the
// Vercel function (api/daily.js) and the client (offline fallback).
// Pure ESM with no dependencies so it bundles cleanly on both sides.

/** @typedef {{ id: string, name: string, text: string, mods: Record<string, number> }} Omen */

/** @type {Omen[]} */
export const OMENS = [
  { id: 'still-air', name: 'Still Air', text: 'Dust hangs unmoving. Hidden mechanisms are easier to read.', mods: { trapDC: -2 } },
  { id: 'restless-dead', name: 'Restless Dead', text: 'The crypt hums. The Warden walks with more bone than usual.', mods: { bossHP: 8 } },
  { id: 'drunk-camp', name: 'Drunken Camp', text: 'Goblin songs echo up the stair. Their guard is sloppy tonight.', mods: { goblinDC: -2 } },
  { id: 'ember-tide', name: 'Ember Tide', text: 'The binding fire roars higher, yet its weave is easier to see.', mods: { regen: 3, brazierDC: -2 } },
  { id: 'clear-sight', name: 'Clear Sight', text: 'A cold draught clears the smoke. Eyes see further.', mods: { vision: 1 } },
  { id: 'gloom', name: 'Gloom', text: 'Torches gutter and smoke. The dark presses close.', mods: { vision: -1 } },
  { id: 'quiet', name: 'Quiet Night', text: 'Nothing stirs but the drip of water. The delve is as it always was.', mods: {} },
];

/** FNV-1a 32-bit hash of a string. */
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** UTC date key, e.g. "2026-11-26". */
export function dateKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

/** The omen and map seed for a given UTC date key. */
export function omenFor(key) {
  const seed = hash('emberdeep:' + key);
  const omen = OMENS[seed % OMENS.length];
  return { date: key, seed, omen };
}
