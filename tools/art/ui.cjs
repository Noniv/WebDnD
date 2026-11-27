const { C, r1, svg, write, rng, P, F, S, L, circ, ell, rect, radial, linear, blur, star } = require('./common.cjs');

function emblem() {
  const id = 'emblem';
  const cx = 128, cy = 102, ro = 76, ri = 50;
  const pt = (r, a) => `${r1(cx + r * Math.cos(a))} ${r1(cy + r * Math.sin(a))}`;
  const ringD = `M${cx - ro} ${cy} A${ro} ${ro} 0 1 0 ${cx + ro} ${cy} A${ro} ${ro} 0 1 0 ${cx - ro} ${cy} Z M${cx - ri} ${cy} A${ri} ${ri} 0 1 1 ${cx + ri} ${cy} A${ri} ${ri} 0 1 1 ${cx - ri} ${cy} Z`;
  let defs = radial(`${id}-glow`, [[0, C.e2, 0.75], [0.45, C.e1, 0.35], [1, C.e1, 0]]) +
    linear(`${id}-stone`, [[0, '#6a6056'], [0.5, '#4a433b'], [1, '#2a2520']], 'x1="0.2" y1="0" x2="0.8" y2="1"') +
    blur(`${id}-blur`, 4) + blur(`${id}-blur2`, 1.6);
  // d20 silhouette behind
  const R = 64, dx = 128, dy = 190;
  const V = {
    T: [dx, dy - R], UR: [dx + R * 0.866, dy - R / 2], LR: [dx + R * 0.866, dy + R / 2], B: [dx, dy + R], LL: [dx - R * 0.866, dy + R / 2], UL: [dx - R * 0.866, dy - R / 2],
    A: [dx, dy - R * 0.5], X: [dx - R * 0.45, dy + R * 0.3], Y: [dx + R * 0.45, dy + R * 0.3],
  };
  const v = (k) => V[k].map(r1).join(' ');
  const hex = `M${v('T')} L${v('UR')} L${v('LR')} L${v('B')} L${v('LL')} L${v('UL')} Z`;
  const edges = [['T', 'A'], ['UL', 'A'], ['UR', 'A'], ['A', 'X'], ['A', 'Y'], ['X', 'Y'], ['UL', 'X'], ['LL', 'X'], ['B', 'X'], ['UR', 'Y'], ['LR', 'Y'], ['B', 'Y']].map(([a, b]) => `M${v(a)} L${v(b)}`).join(' ');
  let o = `<defs>${defs}</defs>`;
  o += `<clipPath id="${id}-cut"><rect x="0" y="0" width="256" height="252"/></clipPath>`;
  o += `<g clip-path="url(#${id}-cut)">` + P(hex, '#1f1a17', 6) + F(`M${v('A')} L${v('X')} L${v('Y')} Z`, '#2c2622') + S(edges, C.gold, 2.2, 'opacity="0.9"') + S(hex, C.gold, 2.6) + `</g>`;
  o += circ(cx, cy, 120, `url(#${id}-glow)`, 0);
  // ember flame
  const flame = (s, col, extra = '') => F(`M128 ${cy - 46 * s} C${128 + 14 * s} ${cy - 24 * s} ${128 + 30 * s} ${cy - 14 * s} ${128 + 26 * s} ${cy + 10 * s} C${128 + 23 * s} ${cy + 26 * s} ${128 + 12 * s} ${cy + 34 * s} 128 ${cy + 34 * s} C${128 - 12 * s} ${cy + 34 * s} ${128 - 25 * s} ${cy + 26 * s} ${128 - 26 * s} ${cy + 8 * s} C${128 - 27 * s} ${cy - 6 * s} ${128 - 16 * s} ${cy - 10 * s} ${128 - 12 * s} ${cy - 24 * s} C${128 - 8 * s} ${cy - 14 * s} ${128 - 3 * s} ${cy - 12 * s} ${128 - 1 * s} ${cy - 16 * s} C${128 - 5 * s} ${cy - 26 * s} ${128 - 4 * s} ${cy - 36 * s} 128 ${cy - 46 * s} Z`.replace(/(\d+\.\d{2,})/g, (m) => r1(+m)), col, extra);
  o += flame(1.05, C.e1, `filter="url(#${id}-blur)" opacity="0.8"`) + flame(1, C.e1) + S(flame(1, 'none').match(/d="([^"]+)"/)[1], C.ink, 4) +
    flame(0.72, C.e2) + flame(0.42, '#ffe2a8');
  o += ell(128, cy + 34, 22, 6, '#3a1f14', 3) + S('M114 135 h0.01 M126 137 h0.01 M138 135 h0.01', C.e1, 3);
  // stone ring
  o += F(ringD, C.ink, 'fill-rule="evenodd" opacity="0.5" transform="translate(4 6)"') + P(ringD, `url(#${id}-stone)`, 5, 'fill-rule="evenodd"');
  let joints = '';
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + 0.2; joints += `M${pt(ri + 1, a)} L${pt(ro - 1, a)} `; }
  o += S(joints, C.ink, 3);
  o += S(`M${pt(ro - 6, Math.PI * 1.08)} A${ro - 6} ${ro - 6} 0 0 1 ${pt(ro - 6, Math.PI * 1.45)}`, '#8a7f71', 3, 'opacity="0.8"');
  o += S(`M${pt(ri + 5, Math.PI * 0.1)} A${ri + 5} ${ri + 5} 0 0 1 ${pt(ri + 5, Math.PI * 0.6)}`, C.ink, 3, 'opacity="0.4"');
  const crack = `M${pt(ro, -1.05)} L${pt(ro - 8, -1.0)} L${pt(ro - 13, -1.12)} L${pt(ri + 6, -1.02)} L${pt(ri, -1.1)} M${pt(ro, 2.35)} L${pt(ro - 10, 2.42)} L${pt(ro - 16, 2.3)} L${pt(ri, 2.4)} M${pt(ro, 0.55)} L${pt(ro - 9, 0.6)} L${pt(ro - 14, 0.5)}`;
  o += S(crack, C.ink, 4.5) + S(crack, C.e1, 2.4, `filter="url(#${id}-blur2)"`) + S(crack, C.e2, 1.2);
  o += circ(cx, cy, ri + 0.5, 'none', 0, `stroke="${C.gold}" stroke-width="2" opacity="0.9"`) + circ(cx, cy, ro - 2.5, 'none', 0, `stroke="${C.gold}" stroke-width="1.4" opacity="0.6"`);
  let studs = '';
  for (const a of [-Math.PI / 2, 0, Math.PI, Math.PI / 2]) studs += P(star(r1(cx + (ri + ro) / 2 * Math.cos(a)), r1(cy + (ri + ro) / 2 * Math.sin(a)), 4, 6, 2.2), C.gold, 2);
  o += studs + S('M100 30 h0.01 M162 22 h0.01 M178 46 h0.01 M84 50 h0.01 M150 8 h0.01', C.e2, 3.4);
  return svg(256, 256, o);
}

function parchment() {
  const id = 'parchment';
  const R = rng(4);
  let stains = '';
  const blob = (x, y, r, a) => {
    let s = '';
    for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) {
      if (x + ox + r < 0 || x + ox - r > 512 || y + oy + r < 0 || y + oy - r > 512) continue;
      s += circ(r1(x + ox), r1(y + oy), r, '#9c7f4e', 0, `opacity="${a}"`);
      s += circ(r1(x + ox), r1(y + oy), r, 'none', 0, `stroke="#8a6a3a" stroke-width="1.2" opacity="${r1(a * 1.6)}"`);
    }
    return s;
  };
  for (let i = 0; i < 7; i++) stains += blob(R() * 512, R() * 512, Math.round(18 + R() * 46), r1(0.04 + R() * 0.05));
  const defs = `<filter id="${id}-mottle" filterUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.0078125" numOctaves="4" seed="7" stitchTiles="stitch"/>` +
    `<feColorMatrix type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.33  0 0 0 0 0.17  1.3 0 0 0 -0.5"/></filter>` +
    `<filter id="${id}-fiber" filterUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">` +
    `<feTurbulence type="turbulence" baseFrequency="0.015625 0.25" numOctaves="2" seed="3" stitchTiles="stitch"/>` +
    `<feColorMatrix type="matrix" values="0 0 0 0 0.38  0 0 0 0 0.28  0 0 0 0 0.15  0 0 0 -2.2 0.62"/></filter>` +
    `<filter id="${id}-grain" filterUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="1" seed="11" stitchTiles="stitch"/>` +
    `<feColorMatrix type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 0 0.12  0 0 0 0.9 -0.42"/></filter>`;
  const o = `<defs>${defs}</defs>` + rect(0, 0, 512, 512, C.p1) +
    rect(0, 0, 512, 512, '#000', 0, 0, `filter="url(#${id}-mottle)"`) +
    rect(0, 0, 512, 512, '#000', 0, 0, `filter="url(#${id}-fiber)" opacity="0.55"`) +
    rect(0, 0, 512, 512, '#000', 0, 0, `filter="url(#${id}-grain)" opacity="0.6"`) + stains;
  return svg(512, 512, o);
}

function frameCorner() {
  const main = 'M46 4 H16 C9 4 4 9 4 16 V46';
  const inner = 'M42 10 H22 C15 10 10 15 10 22 V42';
  const curl = 'M16 4 C16 12 12 16 4 16 M22 10 C22 18 28 22 32 18 C35 15 32 11 29 13';
  const curl2 = 'M10 22 C18 22 22 28 18 32 C15 35 11 32 13 29';
  const ink = (d, w) => S(d, C.ink, w + 3) + S(d, C.gold, w);
  return svg(48, 48,
    ink(main, 2) + ink(inner, 1.2) + ink(curl, 1.4) + ink(curl2, 1.4) +
    P('M1.5 6 L6 1.5 L10.5 6 L6 10.5 Z', C.gold, 1.8) + circ(46, 4, 2, C.gold, 1.6) + circ(4, 46, 2, C.gold, 1.6) +
    circ(42, 10, 1.4, C.e2, 1.2) + circ(10, 42, 1.4, C.e2, 1.2));
}

write('ui/emblem.svg', emblem());
write('ui/parchment.svg', parchment());
write('ui/frame_corner.svg', frameCorner());
