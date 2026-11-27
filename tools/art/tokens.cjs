const { C, r1, svg, write, rng, P, F, S, L, circ, ell, radial } = require('./common.cjs');
const FIG = require('./figures.cjs');

const RING = { fighter: C.steel, rogue: C.verd, wizard: C.arc, cleric: C.gold, goblin: C.blood, goblin_boss: C.blood, skeleton: C.blood, ash_warden: C.blood };
// village NPCs: a parchment ring reads as friendly/neutral; new monsters keep the red ring
const FRIEND = C.p1;
for (const n of ['innkeeper', 'priest', 'smith', 'elder', 'child', 'guard', 'stranger', 'miner', 'hermit']) RING[n] = FRIEND;
for (const n of ['wolf', 'giant_rat', 'zombie', 'giant_spider']) RING[n] = C.blood;
function arc(r, a0, a1) {
  const p = (a) => `${r1(64 + r * Math.cos((a * Math.PI) / 180))} ${r1(64 + r * Math.sin((a * Math.PI) / 180))}`;
  return `M${p(a0)} A${r} ${r} 0 0 1 ${p(a1)}`;
}
function token(name) {
  const id = name;
  const boss = name === 'ash_warden';
  const ring = RING[name];
  const inner = boss ? 48 : 53;
  const f = FIG[name](id, 4, false);
  let defs = `<clipPath id="${id}-clip"><circle cx="64" cy="64" r="${inner}"/></clipPath>` +
    radial(`${id}-bg`, [[0, '#4a433b'], [0.6, '#2f2a25'], [1, '#1c1815']], 'cx="0.4" cy="0.35" r="0.7"') + f.defs;
  let base = '';
  if (boss) {
    defs += radial(`${id}-aura`, [[0.8, C.e2, 0.95], [0.88, C.e1, 0.55], [1, C.e1, 0]]);
    base += circ(64, 64, 64, `url(#${id}-aura)`, 0);
  }
  const outer = boss ? 59.5 : 61;
  const band = boss ? 57.5 : 58.5;
  base += circ(64, 64, outer, C.ink, 0) + circ(64, 64, band, ring, 0) +
    S(arc((band + inner) / 2, 195, 285), '#ffffff', boss ? 2.4 : 1.8, 'opacity="0.28"') +
    S(arc((band + inner) / 2, 20, 120), C.ink, boss ? 3 : 2, 'opacity="0.3"');
  if (boss) {
    let studs = '', embers = '';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      studs += circ(r1(64 + 53 * Math.cos(a)), r1(64 + 53 * Math.sin(a)), 1.8, '#3a1210', 0);
    }
    const R = rng(5);
    for (let i = 0; i < 9; i++) { const a = R() * Math.PI * 2; embers += `M${r1(64 + (49 + R() * 7) * Math.cos(a))} ${r1(64 + (49 + R() * 7) * Math.sin(a))} h0.01 `; }
    base += studs + S(embers, C.e2, 1.8);
  }
  base += circ(64, 64, inner, `url(#${id}-bg)`, 3);
  // soft drop shadow of the figure on the base
  base += ell(70, 104, 40, 14, C.ink, 0, `opacity="0.35" clip-path="url(#${id}-clip)"`);
  const body = `<g clip-path="url(#${id}-clip)">${f.clip}</g>${f.over}`;
  const rim = circ(64, 64, inner, 'none', boss ? 3.5 : 2.5) ;
  return svg(128, 128, `<defs>${defs}</defs>${base}${body}`);
}
for (const n of Object.keys(RING)) write(`tokens/${n}.svg`, token(n));
