const { C, r1, svg, write, rng, P, F, S, circ, ell, radial } = require('./common.cjs');
const FIG = require('./figures.cjs');

function tornOval(seed) {
  const R = rng(seed);
  const n = 72, pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    let j = 1 + (R() - 0.5) * 0.035;
    if (R() < 0.08) j -= 0.04 + R() * 0.03;
    pts.push(`${r1(100 + 92 * j * Math.cos(a))} ${r1(120 + 114 * j * Math.sin(a))}`);
  }
  return 'M' + pts.join(' L') + ' Z';
}
const XF = { ash_warden: [1.7, 12], wizard: [1.75, 4], goblin_boss: [1.8, 0] };
const GLOW = { wizard: C.arc, ash_warden: C.e1, cleric: C.gold };
function portrait(name, seed) {
  const id = `${name}-portrait`;
  const oval = tornOval(seed);
  const [sc, ty] = XF[name] || [1.9, -9.4];
  const f = FIG[name](id, 4.2 / sc, true);
  const R = rng(seed + 100);
  let stains = '';
  for (let i = 0; i < 4; i++) stains += circ(r1(30 + R() * 140), r1(30 + R() * 180), r1(10 + R() * 18), '#b39f78', 0, `opacity="${r1(0.12 + R() * 0.1)}"`);
  let hatch = '';
  for (let k = 0; k < 22; k++) hatch += `M${130 + k * 4} 20 l-40 60 `;
  let defs = `<clipPath id="${id}-clip"><path d="${oval}"/></clipPath>` +
    radial(`${id}-paper`, [[0, '#f1e4c6'], [0.65, C.p1], [1, C.p2]], 'cx="0.42" cy="0.38" r="0.62"') + f.defs;
  let glow = '';
  if (GLOW[name]) {
    defs += radial(`${id}-bgglow`, [[0, GLOW[name], 0.45], [1, GLOW[name], 0]]);
    glow = ell(100, 95, 80, 85, `url(#${id}-bgglow)`, 0);
  }
  const body =
    F(oval, C.ink, 'opacity="0.35" transform="translate(3 4)"') +
    P(oval, `url(#${id}-paper)`, 0) +
    `<g clip-path="url(#${id}-clip)">` + stains + glow + S(hatch, C.ink, 1, 'opacity="0.16"') +
    `<g transform="translate(${r1(100 - 64 * sc)} ${ty}) scale(${sc})">${f.clip}${f.over}</g></g>` +
    P(oval, 'none', 3.2) + S(oval, '#8a7550', 1, 'opacity="0.6" transform="translate(100 120) scale(0.965) translate(-100 -120)"');
  return svg(200, 240, `<defs>${defs}</defs>${body}`);
}
['fighter', 'rogue', 'wizard', 'cleric', 'goblin_boss', 'ash_warden'].forEach((n, i) => write(`portraits/${n}.svg`, portrait(n, 31 + i * 7)));
