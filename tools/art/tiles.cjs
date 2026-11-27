const { C, r1, svg, write, rng, P, F, S, L, circ, ell, rect, radial, linear, blur, star } = require('./common.cjs');

const LAYOUTS = {
  a: [[1, 1, 36, 29], [39, 1, 24, 29], [1, 32, 22, 31], [25, 32, 38, 31]],
  b: [[1, 1, 26, 22], [29, 1, 34, 22], [1, 25, 40, 38], [43, 25, 20, 38]],
  c: [[1, 1, 30, 36], [33, 1, 30, 20], [33, 23, 30, 40], [1, 39, 30, 24]],
};
function stone(x, y, w, h, fill, R) {
  let o = rect(x, y, w, h, fill, 0, 2.5);
  o += S(`M${x + 1.2} ${y + h - 3} V${y + 1.2} H${x + w - 3}`, C.s2, 1.4, 'opacity="0.85"');
  o += S(`M${x + 3} ${y + h - 0.8} H${x + w - 0.8} V${y + 3}`, '#2f2a25', 1.4);
  let hd = '';
  for (let k = 0; k < 3; k++) hd += `M${r1(x + w - 7 - k * 3.2)} ${y + h - 3.5} l3 -4 `;
  o += S(hd, C.ink, 0.8, 'opacity="0.35"');
  let sd = '';
  for (let k = 0; k < 4; k++) sd += `M${r1(x + 4 + R() * (w - 8))} ${r1(y + 4 + R() * (h - 8))} h0.01 `;
  o += S(sd, '#2c2722', 1.8);
  return o;
}
function floorBase(layout = 'a', seed = 1) {
  const R = rng(seed);
  const fills = ['#3a342e', '#3d3731', '#37312c', '#3b352f'];
  return rect(0, 0, 64, 64, C.s0) + LAYOUTS[layout].map(([x, y, w, h], i) => stone(x, y, w, h, fills[(i + seed) % 4], R)).join('');
}
function wallBase() {
  let o = rect(0, 0, 64, 64, C.ink);
  const blocks = [[-16, 0], [16, 0], [48, 0], [0, 32], [32, 32]];
  let faces = '', bev = '';
  for (const [x, y] of blocks) {
    faces += rect(x + 1, y + 1, 30, 30, '#2c2722');
  }
  let hatch = '';
  for (let k = 0; k <= 128; k += 8) hatch += `M${k} 0 L${k - 64} 64 `;
  for (const [x, y] of blocks) {
    bev += rect(x + 1, y + 1, 30, 4, '#4a433b') + rect(x + 1, y + 5, 2, 26, '#3a342e') + rect(x + 1, y + 27, 30, 4, '#1f1b18');
    bev += S(`M${x + 2} ${y + 1.6} H${x + 30}`, '#5f564c', 1);
  }
  o += faces + S(hatch, C.ink, 1, 'opacity="0.35"') + bev;
  // block outlines (ink joints)
  o += blocks.map(([x, y]) => rect(x + 1, y + 1, 30, 30, 'none', 1.5)).join('');
  return o;
}
function rock(cx, cy, r, R, fill) {
  const n = 6 + Math.floor(R() * 2);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R() * 0.5;
    const rr = r * (0.7 + R() * 0.4);
    pts.push([cx + rr * Math.cos(a), cy + rr * 0.85 * Math.sin(a)]);
  }
  const d = 'M' + pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(' L') + ' Z';
  const hl = `M${r1(cx - r * 0.55)} ${r1(cy + r * 0.1)} Q${r1(cx - r * 0.5)} ${r1(cy - r * 0.55)} ${r1(cx + r * 0.1)} ${r1(cy - r * 0.6)}`;
  return F(d, C.ink, `opacity="0.55" transform="translate(1.5 2)"`) + P(d, fill, 2) + S(hl, '#7a7064', 1.2);
}
function bone(x1, y1, x2, y2, col = C.bone) {
  const ends = (x, y) => circ(x, y, 2.3, col, 1.5);
  return S(`M${x1} ${y1} L${x2} ${y2}`, C.ink, 5) + ends(x1, y1) + ends(x2, y2) + S(`M${x1} ${y1} L${x2} ${y2}`, col, 2.4);
}

const T = {};
T.floor_1 = () => floorBase('a', 1) +
  S('M30 35 L34 41 L32 46 L38 52 L37 58', C.ink, 1.3, 'opacity="0.75"') + S('M31 34.5 L35 40.5 L33 45.5 L39 51.5', C.s2, 0.8, 'opacity="0.7"') +
  S('M34 41 L40 42', C.ink, 1, 'opacity="0.6"');
T.floor_2 = () => {
  let m = '';
  const R = rng(22);
  for (const [cx, cy, n] of [[28, 24, 7], [42, 24, 5], [2, 60, 4], [62, 4, 4], [41, 46, 3]]) {
    for (let i = 0; i < n; i++) m += circ(r1(cx + (R() - 0.5) * 8), r1(cy + (R() - 0.5) * 5), r1(1 + R() * 1.8), i % 2 ? '#4f6544' : '#5e7a4c', 0, 'opacity="0.8"');
  }
  return floorBase('b', 2) + m;
};
T.floor_3 = () => floorBase('c', 3) + F('M47 49 C47 45 51 43 54 44 C57 45 58 48 56 51 C54 53 49 53 47 49 Z', C.ink, 'opacity="0.5" transform="translate(1 1.5)"') +
  P('M47 49 C47 45 51 43 54 44 C57 45 58 48 56 51 C54 53 49 53 47 49 Z', '#5a524a', 1.5) + S('M49 47 C50 45.5 52 45 53.5 45.3', '#7d7468', 1) +
  circ(14, 14, 1.3, '#5a524a', 1) + S('M6 22 L10 19 L13 21', C.ink, 1, 'opacity="0.6"');
T.wall = () => wallBase();

function doorFrame(id) {
  return rect(4, 2, 56, 60, '#4a433b', 2.5, 2) + S('M6 59 V4.5 H57', '#6a6056', 1.5) + S('M7 60 H58 V5', '#2c2722', 1.5) +
    S('M8 10 l3 -4 M53 60 l3 -4 M5 40 l3 -3', C.ink, 0.9, 'opacity="0.5"') + rect(10, 7, 44, 50, C.ink);
}
function planks(bands = 1) {
  let o = '';
  const xs = [11, 22, 33, 44];
  xs.forEach((x, i) => {
    o += rect(x, 8, 10, 48, i % 2 ? '#6e4226' : C.wood, 1.5, 1);
    o += S(`M${x + 3} 12 C${x + 4} 24 ${x + 2} 34 ${x + 4} 50`, C.woodD, 0.9);
    o += S(`M${x + 1.5} 54 V10`, '#94603a', 1, 'opacity="0.8"');
  });
  const bh = bands > 1 ? 8 : 5;
  for (const y of [14, 42]) {
    o += rect(10, y, 44, bh, bands > 1 ? '#4a4540' : C.iron, 1.5);
    o += S(`M11 ${y + 1.2} H53`, '#8a857e', 1);
    let rv = '';
    for (const x of [14, 24, 32, 40, 50]) rv += circ(x, y + bh / 2, bands > 1 ? 1.6 : 1.2, '#9a948b', 0.8);
    o += rv;
  }
  if (bands > 1) o += rect(29, 8, 6, 48, '#4a4540', 1.5) + S('M30 9 V55', '#8a857e', 1);
  o += F('M10 40 L54 30 L54 57 L10 57 Z', C.ink, 'opacity="0.22"');
  return o;
}
T.door_closed = () => doorFrame() + planks(1) + circ(46, 32, 4, 'none', 0, `stroke="${C.ink}" stroke-width="4"`) + circ(46, 32, 4, 'none', 0, `stroke="#8a857e" stroke-width="1.8"`) + rect(44, 27, 4, 3, C.iron, 1);
T.door_open = () => {
  const id = 'door_open';
  return `<defs><clipPath id="${id}-clip"><rect x="10" y="7" width="44" height="50"/></clipPath></defs>` + doorFrame() +
    `<g clip-path="url(#${id}-clip)">${floorBase('a', 4)}${F('M10 7 H54 V12 H24 L18 57 H10 Z', C.ink, 'opacity="0.45"')}</g>` +
    P('M10 7 L20 10 L20 55 L10 57 Z', C.wood, 2) + S('M13 9 V56 M16.5 10 V55.5', C.woodD, 1) +
    rect(10, 15, 10, 4, C.iron, 1.2) + rect(10, 43, 10, 4, C.iron, 1.2) + S('M11 9 V55', '#94603a', 1);
};
T.door_locked = () => doorFrame() + planks(2) +
  S('M25 33 V25 C25 17 39 17 39 25 V33', C.ink, 8) + S('M25 33 V25 C25 17 39 17 39 25 V33', '#9a948b', 3.5) +
  rect(19, 30, 26, 21, C.gold, 2.5, 3) + S('M21 32.5 H42', '#f3dc8a', 1.5) + F('M43 33 V48 H22', 'none', `stroke="#9a7a26" stroke-width="2"`) +
  circ(32, 38.5, 3, C.ink, 0) + F('M30.5 39 L29.5 46 H34.5 L33.5 39 Z', C.ink);
T.door_secret = () => {
  const id = 'door_secret';
  const d = 'M15 63 L14 52 L16 44 L14 34 L15 24 C16 14 23 8 32 7 C41 8 47 13 49 22 L48 30 L50 38 L48 48 L50 56 L49 63';
  return `<defs>${blur(id + '-glow', 2.2)}</defs>` + wallBase() +
    S(d, C.e1, 4, `opacity="0.55" filter="url(#${id}-glow)"`) + S(d, C.e1, 1.6, 'opacity="0.9"') + S(d, '#ffd9a8', 0.6) +
    S('M16 44 L22 42 L24 46 M48 30 L43 28 M32 7 L31 3 M14 34 L9 36', C.e1, 0.9, 'opacity="0.75"');
};
T.rubble = () => {
  const R = rng(77);
  let o = floorBase('a', 5);
  let g = '';
  for (let i = 0; i < 40; i++) g += `M${r1(R() * 64)} ${r1(R() * 64)} h0.01 `;
  o += S(g, '#5a524a', 1.8) + F('M0 0 H64 V64 H0 Z', '#5a524a', 'opacity="0.12"');
  const fills = ['#5a524a', '#4f4840', '#625a50', '#554d45'];
  const spots = [[10, 12, 7], [30, 8, 5], [50, 13, 8], [20, 30, 6], [42, 32, 7], [58, 36, 4], [8, 44, 6], [28, 50, 8], [50, 52, 6], [36, 20, 3.5], [16, 58, 3.5], [60, 60, 3], [4, 26, 3], [40, 60, 3]];
  spots.forEach(([x, y, r], i) => { o += rock(x + (R() - 0.5) * 3, y + (R() - 0.5) * 3, r, R, fills[i % 4]); });
  return o;
};
function plate(chev) {
  let o = floorBase('a', 6);
  let holes = '';
  for (const [x, y] of [[8, 24], [8, 40], [56, 24], [56, 40], [24, 8], [40, 8], [24, 56], [40, 56]]) holes += circ(x, y, 1.8, C.ink, 0) + S(`M${x - 1.6} ${y + 1.2} A2 2 0 0 0 ${x + 1.6} ${y + 1.2}`, '#5f564c', 0.8);
  o += holes + rect(18, 18, 32, 32, C.ink, 0, 2, 'opacity="0.5"') + rect(16, 16, 32, 32, '#4f4840', 2, 2) +
    S('M17.5 46 V17.5 H46', '#6d6459', 1.4) + rect(21, 21, 22, 22, '#453e37', 1.2, 1) +
    S('M26 32 H38 M32 26 V38', C.ink, 1.2, 'opacity="0.7"') + circ(32, 32, 3, 'none', 1.2);
  if (chev) {
    let c = '';
    for (const x of [12, 22, 32, 42, 52]) c += `M${x - 3} 3 L${x} 6 L${x + 3} 3 `;
    const side = S(c, C.blood, 1.7);
    o += [0, 90, 180, 270].map((a) => `<g transform="rotate(${a} 32 32)">${side}</g>`).join('');
  }
  return o;
}
T.trap_plate = () => plate(true);
T.trap_disarmed = () => {
  const id = 'trap_disarmed';
  return `<defs><filter id="${id}-desat"><feColorMatrix type="saturate" values="0.15"/></filter></defs><g filter="url(#${id}-desat)">${plate(false)}` +
    F('M47 27 L61 23 L61 35 L47 31 Z', C.ink, 'opacity="0.5" transform="translate(1 2)"') + P('M46 27.5 L61 23 L61 35 L46 31 Z', '#6b6157', 2) +
    S('M50 28 L59 26 M50 30 L59 31', '#4f473f', 0.9) + S('M47 27.5 L60 23.8', '#8c8277', 1) + `</g>` +
    S('M20 58 L24 54 M24 58 L20 54', C.p2, 1.2, 'opacity="0.5"');
};
function chestBase() {
  return floorBase('a', 7) + ell(33, 52, 24, 6, C.ink, 0, 'opacity="0.5"');
}
T.chest_closed = () => chestBase() +
  rect(12, 30, 40, 21, C.woodD, 2.5, 2) + S('M14 36 H50 M14 43 H50', '#3f2614', 1) +
  P('M12 31 L14 16 C14 13 16 12 19 12 L45 12 C48 12 50 13 50 16 L52 31 Z', '#8d5a33', 2.5) +
  S('M15 19 H49 M14.5 25 H49.5', C.woodD, 1) + S('M16 29 L17 16 C17 15 18 14.5 20 14.5 H36', '#b07a4a', 1.4) +
  rect(19, 12, 5, 39, C.iron, 1.5) + rect(40, 12, 5, 39, C.iron, 1.5) + S('M20.5 13 V50 M41.5 13 V50', '#8a857e', 0.9) +
  rect(27.5, 26, 9, 11, C.gold, 2, 1.5) + circ(32, 30.5, 1.6, C.ink, 0) + F('M31.2 31 L30.6 35 H33.4 L32.8 31 Z', C.ink) +
  F('M12 44 L52 36 V51 H12 Z', C.ink, 'opacity="0.18"');
T.chest_open = () => {
  const id = 'chest_open';
  return `<defs>${radial(id + '-glint', [[0, '#fff3c4', 0.9], [0.4, C.gold, 0.45], [1, C.gold, 0]])}</defs>` + chestBase() +
    P('M15 21 L17 5 C17 4 18 3.5 19 3.5 H45 C46 3.5 47 4 47 5 L49 21 Z', C.woodD, 2.5) + S('M17 10 H47 M16 15.5 H48', '#3f2614', 1) +
    rect(21, 4, 4.5, 17, C.iron, 1.3) + rect(38.5, 4, 4.5, 17, C.iron, 1.3) +
    rect(12, 30, 40, 21, C.woodD, 2.5, 2) + S('M14 36 H50 M14 43 H50', '#3f2614', 1) +
    P('M12 31 L14 21 H50 L52 31 Z', '#1d1410', 2.5) +
    F('M15 30 C17 25 22 23 27 24 C31 21 37 22 40 24 C45 23 49 26 49 30 Z', C.gold) + S('M15 30 C17 25 22 23 27 24 C31 21 37 22 40 24 C45 23 49 26 49 30', C.ink, 1.5) +
    circ(22, 27, 2.6, '#e8c65e', 1) + circ(29, 25, 2.6, '#e8c65e', 1) + circ(36, 26.5, 2.6, '#e8c65e', 1) + circ(43, 27.5, 2.4, '#e8c65e', 1) +
    rect(19, 30, 5, 21, C.iron, 1.5) + rect(40, 30, 5, 21, C.iron, 1.5) + rect(27.5, 30, 9, 8, C.gold, 2, 1.5) +
    circ(38, 22, 10, `url(#${id}-glint)`, 0) + P(star(38, 22, 4, 7, 1.4), '#fff3c4', 0.8) + P(star(26, 24, 4, 3.5, 0.8), '#fff3c4', 0.5);
};
const FLAME = 'M32 12 C38 20 45 25 43 34 C42 40 37 44 32 44 C26 44 21 40 21 34 C21 28 25 26 27 19 C29 23 31 24 32 24 C31 20 31 16 32 12 Z';
T.campfire = () => {
  const id = 'campfire';
  const R = rng(9);
  let o = `<defs>${radial(id + '-glow', [[0, C.e2, 0.55], [0.5, C.e1, 0.25], [1, C.e1, 0]])}</defs>` + floorBase('b', 8);
  o += circ(32, 34, 32, `url(#${id}-glow)`, 0) + circ(32, 37, 13, '#1d1916', 1.5);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; o += rock(32 + 15 * Math.cos(a), 37 + 13 * Math.sin(a), 3.6, R, i % 2 ? '#5a524a' : '#4f4840'); }
  o += `<g transform="rotate(25 32 38)">${rect(19, 35, 26, 6, '#5a3520', 2, 3)}</g><g transform="rotate(-30 32 38)">${rect(19, 35, 26, 6, C.wood, 2, 3)}</g>`;
  o += S('M24 38 h0.01 M38 40 h0.01 M31 43 h0.01', C.e2, 2.2);
  o += P(FLAME, C.e1, 2.2) + F('M32 20 C36 26 40 29 39 35 C38 39 35 41 32 41 C28 41 25 39 25 35 C25 31 28 29 29 25 C30 28 31 28 32 28 Z', C.e2) +
    F('M32 30 C34 33 36 35 35 37.5 C34.5 39 33 40 32 40 C30.5 40 29 39 29 37.5 C29 35 31 33 32 30 Z', '#ffe2a8');
  o += bone(46, 56, 58, 50) + bone(6, 50, 14, 58) + S('M50 8 L60 14 M4 10 L14 6', C.ink, 4) + S('M50 8 L60 14 M4 10 L14 6', '#6b4a2e', 2);
  o += S('M22 8 h0.01 M44 4 h0.01 M40 12 h0.01', C.e2, 1.6);
  return o;
};
T.shrine = () => {
  const id = 'shrine';
  return `<defs>${radial(id + '-halo', [[0, '#ffe2a8', 0.75], [0.35, C.e2, 0.4], [1, C.gold, 0]])}</defs>` + floorBase('c', 9) +
    ell(32, 56, 22, 5, C.ink, 0, 'opacity="0.5"') +
    circ(32, 12, 30, `url(#${id}-halo)`, 0) +
    rect(12, 40, 40, 15, '#423b34', 2.5, 1.5) + rect(10, 26, 44, 15, '#5a534a', 2.5, 2) + S('M12 39 V28 H52', '#7a7064', 1.4) +
    P('M26 26 H38 V48 L35 46 L32 49 L29 46 L26 48 Z', C.verd, 2) + S('M28 28 V44 M36 28 V44', '#7cc2ae', 1) +
    S('M16 47 h4 M44 47 h4', C.verd, 1.6) +
    rect(28.5, 10, 7, 22, C.p1, 2, 1.5) + S('M30 12 V30', '#fff6dc', 1.2) + S('M35 12 V18 C35 20 34 21 34 23', C.p2, 1.4) +
    S('M32 10 V8', C.ink, 1.5) +
    P('M32 0.5 C35.5 4 36.5 6.5 34.5 9 C33.5 10 30.5 10 29.5 9 C27.5 6.5 28.5 4 32 0.5 Z', C.e1, 1.2) + F('M32 3.5 C33.6 5.5 34 7 33 8.4 C32.4 9 31.6 9 31 8.4 C30 7 30.4 5.5 32 3.5 Z', '#ffe2a8') +
    circ(32, 9, 12, 'none', 0, `stroke="${C.gold}" stroke-width="1" opacity="0.35"`);
};
function brazierBody(lit) {
  let o = ell(32, 58, 20, 4.5, C.ink, 0, 'opacity="0.5"');
  o += L('M21 42 L14 57', 2.6, C.iron, 1.5) + L('M43 42 L50 57', 2.6, C.iron, 1.5) + L('M32 46 L32 59', 2.6, C.iron, 1.5);
  o += P('M13 30 C13 41 21 47 32 47 C43 47 51 41 51 30 Z', '#4f4a45', 2.5) + S('M16 34 C22 41 42 41 48 34', '#2f2b28', 1.4) + S('M15 32 C16 38 20 42 25 44', '#7a746c', 1.2);
  o += ell(32, 30, 19, 7.5, '#2f2b28', 2.5) + ell(32, 30.5, 15, 5, lit ? '#3a1f14' : '#56514b', 1.2);
  if (lit) o += S('M22 31 h0.01 M28 32 h0.01 M38 31 h0.01 M43 30 h0.01', C.e1, 2.4);
  else o += S('M22 31 h0.01 M37 32 h0.01 M43 30 h0.01', '#3a3530', 2.6) + S('M30 31 h0.01', C.e1, 1.4, 'opacity="0.6"');
  return o;
}
T.brazier = () => {
  const id = 'brazier';
  return `<defs>${radial(id + '-glow', [[0, C.arc, 0.6], [0.55, C.arc, 0.22], [1, C.arc, 0]])}</defs>` + floorBase('a', 10) +
    circ(32, 24, 32, `url(#${id}-glow)`, 0) + brazierBody(true) +
    P('M32 2 C37 9 46 14 44 24 C43 29 38 32 32 32 C25 32 20 29 20 24 C19 18 24 16 26 10 C28 14 30 15 31 15 C30 10 30 6 32 2 Z', C.arc, 2.2) +
    F('M32 10 C36 15 41 19 40 25 C39 28 36 30 32 30 C28 30 24 28 24 25 C24 21 27 19 28 15 C29 18 31 19 32 19 Z', '#b59cf0') +
    F('M32 17 C35 21 37 24 36.5 27 C36 29 34 30 32 30 C30 30 27.5 29 27.5 27 C27.5 24 30 21 32 17 Z', C.e1) +
    F('M32 22 C33.5 24 34.5 26 34 27.5 C33.6 28.6 32.8 29 32 29 C31 29 30.2 28.6 30 27.5 C29.6 26 30.6 24 32 22 Z', C.e2) +
    S('M14 14 h0.01 M50 8 h0.01 M46 18 h0.01 M18 6 h0.01', '#b59cf0', 1.8);
};
T.brazier_out = () => floorBase('a', 10) + brazierBody(false) +
  S('M31 28 C26 22 36 18 31 12 C27 7 34 4 33 0', '#8a847c', 3.2, 'opacity="0.45"') + S('M31 28 C26 22 36 18 31 12 C27 7 34 4 33 0', '#b8b0a4', 1.2, 'opacity="0.5"') +
  S('M35 26 C39 22 35 19 39 15', '#8a847c', 1.6, 'opacity="0.35"');
T.stairs_up = () => {
  const id = 'stairs_up';
  let o = `<defs>${linear(id + '-day', [[0, C.p1, 0.42], [0.55, C.p1, 0]], 'x1="0" y1="0" x2="0" y2="1"')}</defs>` + rect(0, 0, 64, 64, C.ink);
  const cols = ['#6e6459', '#61584e', '#544c43', '#474038', '#3a342e', '#2e2924'];
  for (let i = 0; i < 6; i++) {
    const y = 1 + i * 10.5;
    o += rect(9, y, 46, 9.5, cols[i]) + S(`M10 ${r1(y + 1)} H54`, '#8a7f71', 1, `opacity="${r1(0.9 - i * 0.12)}"`) +
      rect(9, r1(y + 7.5), 46, 2, C.ink, 0, 0, 'opacity="0.55"') + S(`M${14 + (i * 7) % 20} ${r1(y + 4)} l3 2 M${36 + (i * 5) % 12} ${r1(y + 5)} l4 -1`, C.ink, 0.8, 'opacity="0.4"');
  }
  o += rect(0, 0, 9, 64, '#2c2722') + rect(55, 0, 9, 64, '#2c2722') + rect(6, 0, 3, 64, '#4a433b') + rect(55, 0, 2, 64, '#1f1b18') +
    S('M1 0 V64 M63 0 V64', '#3a342e', 1.5) + S('M8.5 0 V64 M55.5 0 V64', C.ink, 1.5);
  o += rect(0, 0, 64, 64, `url(#${id}-day)`);
  return o;
};
T.loose_stone = () => {
  const id = 'loose_stone';
  return `<defs>${radial(id + '-glint', [[0, '#fff3c4', 0.8], [0.5, C.gold, 0.35], [1, C.gold, 0]])}</defs>` + floorBase('a', 11) +
    rect(1, 32, 22, 31, C.s0) + rect(3, 34, 18, 27, C.ink, 1.5, 1.5) +
    ell(11, 50, 6, 4, C.gold, 1.5) + circ(8, 47, 2.4, '#e8c65e', 1) + circ(13, 46, 2.4, '#e8c65e', 1) + circ(10, 52, 2.2, '#e8c65e', 1) +
    circ(12, 45, 9, `url(#${id}-glint)`, 0) + P(star(12, 45, 4, 5.5, 1.1), '#fff3c4', 0.6) +
    F('M17 40 L36 33 L42 58 L23 64 Z', C.ink, 'opacity="0.5" transform="translate(2 2)"') +
    P('M15 41 L19 37 L39 30 L36 34 Z', '#2a2520', 1.8) + P('M15 41 L36 34 L42 58 L21 64 Z', '#4a433b', 2.2) +
    S('M17 41.5 L35 35.5', '#6d6459', 1.4) + S('M27 50 l3 -4 M31 52 l3 -4', C.ink, 0.8, 'opacity="0.4"') +
    L('M44 50 L54 61', 1.6, '#7a746c', 1.2);
};
T.bones = () => floorBase('b', 12) +
  ell(26, 30, 9, 8, C.ink, 0, 'opacity="0.45" transform="translate(1.5 2)"') +
  P('M18 30 C18 24 22 21 26 21 C31 21 35 24 35 30 C35 34 33 36 31 37 L30 40 H22 L21 37 C19 36 18 34 18 30 Z', C.bone, 2) +
  ell(22.5, 30, 2.6, 3, C.ink, 0) + ell(29.5, 30, 2.6, 3, C.ink, 0) + F('M26 33 L24.8 35.5 H27.2 Z', C.ink) +
  S('M23 39 V37.5 M26 39.5 V37.5 M29 39 V37.5', C.ink, 0.9) + S('M21 25 C22 23 24 22.5 26 22.5', '#f3ecd8', 1.2) +
  bone(42, 18, 56, 28) + bone(40, 44, 50, 56) + bone(8, 50, 20, 46) + bone(46, 40, 58, 38) +
  S('M10 10 C14 8 18 9 20 12 M11 14 C15 12 18 13 20 16', C.ink, 3.4) + S('M10 10 C14 8 18 9 20 12 M11 14 C15 12 18 13 20 16', C.boneD, 1.6);
T.crypt_floor = () => {
  const id = 'crypt_floor';
  let o = `<defs>${blur(id + '-glow', 1.2)}</defs>` + rect(0, 0, 64, 64, '#16120f');
  for (const [x, y] of [[1, 1], [33, 1], [1, 33], [33, 33]]) {
    o += rect(x, y, 30, 30, '#26211d', 0, 1.5) + S(`M${x + 1} ${y + 28} V${y + 1} H${x + 28}`, '#3a342e', 1.2) + S(`M${x + 2.5} ${y + 29.4} H${x + 29.4} V${y + 2.5}`, '#1a1613', 1.2);
    o += S(`M${x + 6} ${y + 6} L${x + 10} ${y + 6} M${x + 24} ${y + 24} L${x + 20} ${y + 24}`, '#3a342e', 1, 'opacity="0.8"');
  }
  let runes = '';
  const rune = (cx, cy) => {
    let d = '';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.26;
      const x = cx + 8 * Math.cos(a), y = cy + 8 * Math.sin(a);
      const k = i % 3;
      if (k === 0) d += `M${r1(x)} ${r1(y - 2)} V${r1(y + 2)} M${r1(x)} ${r1(y - 1)} l1.6 1 `;
      else if (k === 1) d += `M${r1(x - 1.5)} ${r1(y + 1.8)} L${r1(x)} ${r1(y - 1.8)} L${r1(x + 1.5)} ${r1(y + 1.8)} `;
      else d += `M${r1(x - 1.5)} ${r1(y - 1.5)} L${r1(x + 1.5)} ${r1(y + 1.5)} M${r1(x + 1.5)} ${r1(y - 1.5)} L${r1(x - 1.5)} ${r1(y + 1.5)} `;
    }
    return d;
  };
  let rings = '';
  for (const [cx, cy] of [[32, 32], [0, 0], [64, 0], [0, 64], [64, 64]]) {
    rings += circ(cx, cy, 12.5, 'none', 0, `stroke="${C.ink}" stroke-width="4"`) + circ(cx, cy, 12.5, 'none', 0, `stroke="#3e3730" stroke-width="2"`) + circ(cx, cy, 4, '#1d1915', 1.5);
    runes += rune(cx, cy);
  }
  o += rings + S(runes, C.arc, 2.2, `opacity="0.5" filter="url(#${id}-glow)"`) + S(runes, '#a58be0', 0.9, 'opacity="0.55"');
  return o;
};

// village, forest road and lower-dungeon tiles
Object.assign(T, require('./town.cjs')({ floorBase }));

for (const [name, fn] of Object.entries(T)) write(`tiles/${name}.svg`, svg(64, 64, fn()));
module.exports = { floorBase };
