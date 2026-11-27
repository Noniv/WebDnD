// Generator for Emberdeep "midnight & gold filigree" UI kit. Outputs static SVG.
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', '..', 'public', 'art', 'ui', 'gold');
fs.mkdirSync(OUT, { recursive: true });

const n = (v, d = 2) => { const s = (+v.toFixed(d)).toString(); return s === '-0' ? '0' : s; };
const P = (x, y, d) => n(x, d) + ',' + n(y, d);

function write(name, w, h, body) {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
  fs.writeFileSync(path.join(OUT, name + '.svg'), s);
  console.log(name.padEnd(14), (s.length / 1024).toFixed(1) + ' KB');
}

// metallic gold, light from top-left
function gold(id, x1, y1, x2, y2) {
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}">` +
    `<stop offset="0" stop-color="#f6dfa2"/><stop offset="0.28" stop-color="#e2c07c"/><stop offset="0.55" stop-color="#c49a4c"/>` +
    `<stop offset="0.8" stop-color="#d9b56e"/><stop offset="1" stop-color="#8a6a30"/></linearGradient>`;
}
function glowFilter(id, sd = 1.4, a = 0.45) {
  return `<filter id="${id}" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur in="SourceGraphic" stdDeviation="${sd}" result="b"/>` +
    `<feColorMatrix in="b" type="matrix" values="0 0 0 0 0.95 0 0 0 0 0.78 0 0 0 0 0.47 0 0 0 ${a} 0" result="g"/>` +
    `<feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
}

// ---- geometry helpers ----
// Catmull-Rom sampling of a list of points -> dense list
function sampleCR(pts, k = 8) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(c => 0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
// smooth path through points (cubic beziers from catmull-rom)
function crPath(pts, closed = false, d = 2) {
  let s = 'M' + P(pts[0][0], pts[0][1], d);
  const N = pts.length;
  const g = i => closed ? pts[(i + N) % N] : pts[Math.max(0, Math.min(N - 1, i))];
  const last = closed ? N : N - 1;
  for (let i = 0; i < last; i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    s += 'C' + P(c1[0], c1[1], d) + ' ' + P(c2[0], c2[1], d) + ' ' + P(p2[0], p2[1], d);
  }
  return s + (closed ? 'Z' : '');
}
// tapered stroke along a curve through control points; wf(t) gives width
function taper(ctrl, wf, d = 1, k = 5) {
  const pts = sampleCR(ctrl, k);
  const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const tot = L[L.length - 1];
  const left = [], right = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
    const w = wf(L[i] / tot) / 2;
    left.push([p[0] - dy * w, p[1] + dx * w]); right.push([p[0] + dy * w, p[1] - dx * w]);
  });
  // thin the sample set for output
  const step = Math.max(2, Math.ceil(left.length / 13)), sel = a => a.filter((_, i) => i % step === 0 || i === a.length - 1);
  const l = sel(left), r = sel(right).reverse();
  let s = crPath(l, false, d);
  s += 'L' + crPath(r, false, d).slice(1) + 'Z';
  return s;
}
const lin = (a, b) => t => a + (b - a) * t;
const swell = (a, m, b) => t => t < 0.35 ? a + (m - a) * (t / 0.35) : m + (b - m) * ((t - 0.35) / 0.65);
const diamond = (cx, cy, w, h) => `M${P(cx, cy - h)}L${P(cx + w, cy)}L${P(cx, cy + h)}L${P(cx - w, cy)}Z`;
// 4-point star with concave sides
function star4(cx, cy, R, r, Rx = R) {
  return `M${P(cx, cy - R)}Q${P(cx + r, cy - r)} ${P(cx + Rx, cy)}Q${P(cx + r, cy + r)} ${P(cx, cy + R)}Q${P(cx - r, cy + r)} ${P(cx - Rx, cy)}Q${P(cx - r, cy - r)} ${P(cx, cy - R)}Z`;
}
const circ = (cx, cy, r, extra) => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" ${extra}/>`;
const swapXY = 'matrix(0 1 1 0 0 0)';
// spiral control points: start at (sx,sy), heading, then curl around a centre
function curl(cx, cy, r0, a0, turns, dir, steps = 9, shrink = 0.62) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, a = a0 + dir * t * turns * 2 * Math.PI, r = r0 * (1 - shrink * t);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

// ======================================================================
// 1. frame.svg 192, slice 48
// ======================================================================
{
  const id = 'frame';
  const O = 10, I = 16;
  // one half of TL corner (region y <= x), mirrored over diagonal
  const half =
    // scroll hanging under the inner line, curling back
    `<path d="${taper([[42, 16.4], [37, 17.2], [33, 19.6], [31.6, 23.4], [33.4, 26.6], [37, 27], [39.2, 24.4], [38.2, 21.6], [35.6, 21.6]], swell(1.6, 2.6, 0.5))}"/>` +
    // tiny leaf off the outer line toward the corner
    `<path d="${taper([[30, 10.2], [25.5, 11.4], [22.6, 13.4]], swell(0.6, 1.8, 0.2))}"/>` +
    // junction diamond bridging the two lines
    `<path d="${diamond(44, 13, 2.2, 3.6)}"/>`;
  const corner =
    `<g fill="url(#${id}-g)">${half}<g transform="${swapXY}">${half}</g>` +
    // inner arc (scooped corner) around the rivet
    `<path d="M30,${I}A14,14 0 0 1 ${I},30" fill="none" stroke="url(#${id}-g)" stroke-width="1.7"/>` +
    // rivet on the outer crossing
    `<path d="${diamond(O, O, 5.6, 5.6)}"/><path d="${diamond(O, O, 2.2, 2.2)}" fill="#3a2a10" fill-opacity="0.55"/>` +
    // star in the pocket
    `<path d="${star4(20.6, 20.6, 3.6, 0.7)}"/>` +
    // diagonal lance and bead
    `<path d="${taper([[26.4, 26.4], [29, 29], [32.2, 32.2]], swell(1.4, 2.4, 0))}"/>` +
    `<path d="${diamond(34.4, 34.4, 1.9, 3.8)}" transform="rotate(-45 34.4 34.4)"/>` +
    circ(39.6, 39.6, 1.2, '') + `</g>`;
  const T = ['', 'matrix(-1 0 0 1 192 0)', 'matrix(1 0 0 -1 0 192)', 'matrix(-1 0 0 -1 192 192)'];
  const body = `<defs>${gold(id + '-g', 0, 0, 44, 44)}</defs>` +
    // edge lines: perfectly straight, solid colour so stretched edges are seamless
    `<g fill="none" stroke-linecap="butt">` +
    `<path d="M14,${O}H178M14,${192 - O}H178M${O},14V178M${192 - O},14V178" stroke="#dcb872" stroke-width="2.2"/>` +
    `<path d="M30,${I}H162M30,${192 - I}H162M${I},30V162M${192 - I},30V162" stroke="#b48d48" stroke-width="1.7"/></g>` +
    T.map(t => t ? `<g transform="${t}">${corner}</g>` : corner).join('');
  write(id, 192, 192, body);
}

// ======================================================================
// 2. frame_slim.svg 96, slice 24
// ======================================================================
{
  const id = 'frame_slim';
  const corner = `<g fill="url(#${id}-g)"><path d="${diamond(6, 6, 4.4, 4.4)}"/>` +
    `<path d="M21,11.5H11.5V21" fill="none" stroke="url(#${id}-g)" stroke-width="1.3"/>` + circ(15, 15, 1.3, '') + `</g>`;
  const T = ['', 'matrix(-1 0 0 1 96 0)', 'matrix(1 0 0 -1 0 96)', 'matrix(-1 0 0 -1 96 96)'];
  const body = `<defs>${gold(id + '-g', 0, 0, 22, 22)}</defs>` +
    `<path d="M9,6H87M9,90H87M6,9V87M90,9V87" fill="none" stroke="#d4af6a" stroke-width="1.9"/>` +
    T.map(t => t ? `<g transform="${t}">${corner}</g>` : corner).join('');
  write(id, 96, 96, body);
}

// ======================================================================
// 3. frame_arch.svg 192x256
// ======================================================================
{
  const id = 'frame_arch';
  const W = 192, H = 256, cx = 96;
  const arch = (off, bottom) => {
    const r = 96 - off, s = 117.48, ay = s - Math.sqrt(r * r - 100);
    return `M${10 + off},${bottom}V${s}A${r},${r} 0 0 1 ${cx},${n(ay)}A${r},${r} 0 0 1 ${W - 10 - off},${s}V${bottom}Z`;
  };
  const s = 117.48;
  const cornerB = // bottom-left corner flourish (local), mirrored for right
    `<path d="${diamond(10, 246, 5.2, 5.2)}"/>` +
    `<path d="${taper([[16, 226], [20, 230.5], [26, 233], [30, 231], [29.4, 228], [26.6, 228]], swell(1.6, 2.2, 0.4))}"/>` +
    `<path d="${taper([[36, 240], [40.5, 236], [43, 230], [41, 226], [38, 226.6], [38, 229.4]], swell(1.6, 2.2, 0.4))}"/>` +
    `<path d="${star4(22.6, 234, 2.6, 0.5)}"/>` +
    `<path d="${diamond(10, s, 3.2, 5)}"/>` + `<path d="M17,${s}H24" stroke="url(#${id}-g)" stroke-width="1"/>` + circ(26.5, s, 1, '');
  const body = `<defs>${gold(id + '-g', 0, 0, 192, 256)}` +
    `<linearGradient id="${id}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#141c44"/><stop offset="1" stop-color="#0a0f26"/></linearGradient>` +
    `<radialGradient id="${id}-vg" cx="0.5" cy="0.42" r="0.6"><stop offset="0" stop-color="#2a3a86" stop-opacity="0.22"/><stop offset="1" stop-color="#2a3a86" stop-opacity="0"/></radialGradient></defs>` +
    `<path d="${arch(0, 246)}" fill="url(#${id}-bg)"/><path d="${arch(0, 246)}" fill="url(#${id}-vg)"/>` +
    `<g fill="none" stroke="url(#${id}-g)"><path d="${arch(0, 246)}" stroke-width="2"/><path d="${arch(6, 240)}" stroke-width="1.2"/>` +
    `<path d="${arch(12, 234)}" stroke-width="0.7" stroke-opacity="0.45"/></g>` +
    `<g fill="url(#${id}-g)">` +
    // finial: star + bead above apex
    `<path d="${star4(cx, 11, 10.5, 1.1, 6.5)}"/>` + circ(cx, 26.6, 1.2, '') +
    `<path d="${taper([[cx - 14, 30.5], [cx - 8, 31.6], [cx - 3, 33.4]], swell(0.4, 1.4, 0.3))}"/>` +
    `<path d="${taper([[cx + 14, 30.5], [cx + 8, 31.6], [cx + 3, 33.4]], swell(0.4, 1.4, 0.3))}"/>` +
    // bottom centre ornament
    `<path d="${diamond(cx, 246, 5, 4.2)}"/>` +
    `<path d="${taper([[cx - 8, 240], [cx - 20, 239.2], [cx - 34, 240]], lin(1.3, 0))}"/><path d="${taper([[cx + 8, 240], [cx + 20, 239.2], [cx + 34, 240]], lin(1.3, 0))}"/>` +
    cornerB + `<g transform="matrix(-1 0 0 1 192 0)">${cornerB}</g></g>`;
  write(id, W, H, body);
}

// ======================================================================
// 4/5. dividers
// ======================================================================
function divider(id, W, H, k) {
  const cx = W / 2, cy = H / 2;
  const sideL = // left half (mirrored for right)
    `<path d="M${P(4 * k, cy)}L${P(cx - 34 * k, cy - 0.95 * k)}L${P(cx - 34 * k, cy + 0.95 * k)}Z"/>` +
    // beads along line
    [0.22, 0.4, 0.58].map((f, i) => circ(4 * k + (cx - 38 * k) * f, cy, (0.75 + i * 0.25) * k, '')).join('') +
    // wings: upper and lower hooks
    `<path d="${taper([[cx - 13 * k, cy - 1.6 * k], [cx - 20 * k, cy - 5.6 * k], [cx - 28 * k, cy - 6.6 * k], [cx - 33 * k, cy - 4.4 * k], [cx - 32.4 * k, cy - 1.8 * k], [cx - 29.8 * k, cy - 2.2 * k]], swell(1.4 * k, 1.9 * k, 0.3 * k))}"/>` +
    `<path d="${taper([[cx - 13 * k, cy + 1.6 * k], [cx - 20 * k, cy + 5.6 * k], [cx - 28 * k, cy + 6.6 * k], [cx - 33 * k, cy + 4.4 * k], [cx - 32.4 * k, cy + 1.8 * k], [cx - 29.8 * k, cy + 2.2 * k]], swell(1.4 * k, 1.9 * k, 0.3 * k))}"/>` +
    `<path d="${diamond(cx - 37.5 * k, cy, 2.6 * k, 2.2 * k)}"/>`;
  const body = `<defs>${gold(id + '-g', 0, 0, W, H * 2)}${glowFilter(id + '-f', 1.1 * k, 0.4)}</defs>` +
    `<g fill="url(#${id}-g)" filter="url(#${id}-f)">${sideL}<g transform="matrix(-1 0 0 1 ${W} 0)">${sideL}</g>` +
    `<path d="${diamond(cx, cy, 9.5 * k, 9.5 * k)}" fill="none" stroke="url(#${id}-g)" stroke-width="${n(1.3 * k)}"/>` +
    `<path d="${star4(cx, cy, 6.4 * k, 0.8 * k)}"/>` +
    `</g>`;
  write(id, W, H, body);
}
divider('divider', 360, 28, 1);
divider('divider_small', 160, 16, 0.55);

// ======================================================================
// 6. corner.svg 64 (TL)
// ======================================================================
{
  const id = 'corner';
  const half =
    `<path d="M${P(14, 9)}L${P(63, 9.7)}L${P(14, 10.6)}Z"/>` + // tapered outer line
    `<path d="M${P(31, 15)}L${P(58, 15.4)}L${P(31, 16)}Z"/>` + // tapered inner line
    `<path d="${taper([[44, 16.2], [38.5, 17.2], [34.2, 20], [32.6, 24.6], [34.6, 28.6], [39, 29.2], [41.8, 26.2], [40.8, 22.6], [37.6, 22.4]], swell(1.6, 2.8, 0.5))}"/>` +
    `<path d="${taper([[30, 9.8], [25, 11.2], [21.6, 13.6]], swell(0.6, 2, 0.2))}"/>` +
    `<path d="${diamond(48.5, 12.6, 2.2, 3.4)}"/>` + circ(56, 12.6, 0.9, '');
  const body = `<defs>${gold(id + '-g', 0, 0, 60, 60)}${glowFilter(id + '-f', 1, 0.35)}</defs>` +
    `<g fill="url(#${id}-g)" filter="url(#${id}-f)">${half}<g transform="${swapXY}">${half}</g>` +
    `<path d="M31,15.5A15.5,15.5 0 0 1 15.5,31" fill="none" stroke="url(#${id}-g)" stroke-width="1.6"/>` +
    `<path d="${diamond(9.8, 9.8, 6.2, 6.2)}"/><path d="${diamond(9.8, 9.8, 2.4, 2.4)}" fill="#3a2a10" fill-opacity="0.55"/>` +
    `<path d="${star4(21, 21, 4, 0.8)}"/>` +
    `<path d="${taper([[27.8, 27.8], [31, 31], [35, 35]], swell(1.4, 2.6, 0))}"/>` +
    `<path d="${diamond(37.6, 37.6, 2, 4)}" transform="rotate(-45 37.6 37.6)"/>` + circ(43.4, 43.4, 1.3, '') +
    `</g>`;
  write(id, 64, 64, body);
}

// ======================================================================
// 7. medallion.svg 128
// ======================================================================
{
  const id = 'medallion', c = 64;
  let ticks = '';
  for (let i = 0; i < 48; i++) {
    if (i % 12 === 0) continue;
    const a = i * Math.PI / 24, major = i % 6 === 0, r1 = major ? 47.5 : 49.2, r2 = 52.2;
    ticks += `M${P(c + Math.cos(a) * r1, c + Math.sin(a) * r1)}L${P(c + Math.cos(a) * r2, c + Math.sin(a) * r2)}`;
  }
  const dia = [0, 1, 2, 3].map(i => `<path d="${diamond(c, c - 58, 4, 6)}" transform="rotate(${i * 90} ${c} ${c})"/>` +
    `<path d="${diamond(c, c - 49.5, 1.6, 2.4)}" transform="rotate(${i * 90} ${c} ${c})"/>`).join('');
  const dots = [45, 135, 225, 315].map(a => circ(c + Math.cos(a * Math.PI / 180) * 58, c + Math.sin(a * Math.PI / 180) * 58, 1.3, '')).join('');
  const body = `<defs>${gold(id + '-g', 10, 10, 118, 118)}${glowFilter(id + '-f', 1.2, 0.35)}</defs>` +
    `<g filter="url(#${id}-f)"><g fill="none" stroke="url(#${id}-g)">` +
    `<circle cx="${c}" cy="${c}" r="58" stroke-width="1.8"/><circle cx="${c}" cy="${c}" r="54.4" stroke-width="0.8"/>` +
    `<circle cx="${c}" cy="${c}" r="46" stroke-width="1.2"/><path d="${ticks}" stroke-width="0.8"/></g>` +
    `<g fill="url(#${id}-g)">${dia}${dots}</g></g>`;
  write(id, 128, 128, body);
}

// ======================================================================
// 8. crest.svg 420x120
// ======================================================================
{
  const id = 'crest', W = 420, cx = 210;
  const half =
    // bottom line under title, tapering out
    `<path d="M${P(58, 92)}L${P(cx - 14, 91)}L${P(cx - 14, 93)}Z"/>` +
    // top thin line from flame spreading out
    `<path d="${taper([[cx - 8, 31], [cx - 50, 33.4], [cx - 100, 35.6], [cx - 124, 36]], lin(1.2, 0))}"/>` +
    // great wing scroll (lower), sweeping up from bottom line end
    `<path d="${taper([[96, 92], [70, 90.6], [48, 85], [32, 74], [26, 60], [30, 48], [40, 43], [49, 47], [50, 55], [44, 59], [39.4, 55.6]], swell(1, 3.2, 0.6), 2, 7)}"/>` +
    // upper wing feather
    `<path d="${taper([[92, 40], [76, 34], [62, 26], [56, 16], [60, 9.6], [67, 9.4], [69.6, 14.6], [65.6, 17.4]], swell(0.6, 2.6, 0.5), 2, 7)}"/>` +
    // inner counter-scroll
    `<path d="${taper([[90, 80], [74, 78], [62, 70], [58, 62], [62, 56.4], [67.4, 58.6], [66.4, 63]], swell(0.5, 2, 0.4), 2, 7)}"/>` +
    // leaves / teardrops
    `<path d="${taper([[44, 30], [38, 24], [36, 16]], swell(0, 2.6, 0))}"/>` +
    `<path d="${taper([[18, 66], [10, 62], [5, 56]], swell(0, 2.2, 0))}"/>` +
    `<path d="${taper([[24, 86], [16, 88], [9, 86]], swell(0, 2, 0))}"/>` +
    circ(52, 37, 1.4, '') + circ(15, 76, 1.2, '') + circ(80, 99, 1, '') + circ(118, 98, 1.1, '') + circ(150, 97, 1.2, '') +
    `<path d="${diamond(108, 92, 3, 2.4)}"/>` +
    // small hooks under the bottom line
    `<path d="${taper([[cx - 16, 94], [cx - 26, 98], [cx - 36, 99], [cx - 41, 97], [cx - 39.6, 94.6]], swell(1.4, 1.6, 0.3))}"/>`;
  const body = `<defs>${gold(id + '-g', 0, 0, W, 240)}${glowFilter(id + '-f', 1.4, 0.4)}</defs>` +
    `<g fill="url(#${id}-g)" filter="url(#${id}-f)">${half}<g transform="matrix(-1 0 0 1 ${W} 0)">${half}</g>` +
    // flame point
    `<path d="M${cx},2C${cx + 2.4},10 ${cx + 7},14 ${cx + 6.4},21C${cx + 6},26.6 ${cx + 2.4},30 ${cx},31.4C${cx - 2.4},30 ${cx - 6},26.6 ${cx - 6.4},21C${cx - 7},14 ${cx - 2.4},10 ${cx},2Z"/>` +
    `<path d="M${cx - 0.6},9C${cx - 3.4},16 ${cx - 4.8},22 ${cx - 1.6},28.4C${cx - 2.6},22 ${cx - 2},16 ${cx - 0.6},9Z" fill="#fff3cf" fill-opacity="0.6"/>` +
    `<path d="${star4(cx, 21, 3, 0.5, 16)}"/>` +
    // centre of bottom line
    `<path d="${diamond(cx, 92, 9, 6)}" fill="none" stroke="url(#${id}-g)" stroke-width="1.3"/><path d="${diamond(cx, 92, 4, 3)}"/>` +
    `<path d="${star4(cx, 108, 6, 0.8, 3.4)}"/>` +
    `</g>`;
  write(id, W, 120, body);
}

// ======================================================================
// 9. button.svg 240x56, horizontal slice 28
// ======================================================================
{
  const id = 'button', W = 240;
  const cap =
    `<path d="M28,6H23L9,28L23,50H28" fill="none" stroke="url(#${id}-g)" stroke-width="2.2" stroke-linejoin="miter"/>` +
    `<path d="M24,13.5L15,28L24,42.5" fill="none" stroke="url(#${id}-g)" stroke-width="1.6"/>` +
    circ(25.4, 11.6, 1.2, '') + circ(25.4, 44.4, 1.2, '') +
    `<path d="${diamond(5, 28, 4.4, 5.2)}"/>`;
  const body = `<defs>${gold(id + '-g', 0, 0, 30, 56)}</defs>` +
    `<path d="M28,6H212M28,50H212" fill="none" stroke="#d4af6a" stroke-width="1.6"/>` +
    `<g fill="url(#${id}-g)">${cap}<g transform="matrix(-1 0 0 1 ${W} 0)">${cap}</g></g>`;
  write(id, W, 56, body);
}

// ======================================================================
// 12. bar_frame.svg 200x24, horizontal slice 12
// ======================================================================
{
  const id = 'bar_frame', W = 200;
  const cap = `<path d="M12,2H10.5C6,2 3.6,7 1.4,12C3.6,17 6,22 10.5,22H12" fill="none" stroke="url(#${id}-g)" stroke-width="2"/>` +
    `<path d="${diamond(7.2, 12, 3.4, 3.4)}"/>`;
  const body = `<defs>${gold(id + '-g', 0, 0, 14, 24)}</defs>` +
    `<path d="M12,2H188M12,22H188" fill="none" stroke="#d4af6a" stroke-width="1.5"/>` +
    `<g fill="url(#${id}-g)">${cap}<g transform="matrix(-1 0 0 1 ${W} 0)">${cap}</g></g>`;
  write(id, W, 24, body);
}

// ======================================================================
// 10. bg_stars.svg 512 tileable, opaque
// ======================================================================
{
  const id = 'bg_stars', S = 512;
  let seed = 7331;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const wrapCopies = (x, y, ext) => {
    const out = [];
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      const X = x + dx, Y = y + dy;
      if (X + ext > 0 && X - ext < S && Y + ext > 0 && Y - ext < S) out.push([X, Y]);
    }
    return out;
  };
  const neb = [ // x, y, rx, ry, rot, gradient
    [120, 140, 190, 110, 25, 'n'], [380, 330, 220, 120, -30, 'n'], [470, 60, 150, 90, 10, 'p'], [60, 420, 160, 100, 40, 'p'],
    [260, 250, 130, 80, -10, 'd'], [300, 470, 140, 70, 5, 'n'], [500, 220, 110, 160, 0, 'd'], [180, 20, 120, 60, -15, 'd']];
  let nebs = '';
  for (const [x, y, rx, ry, rot, g] of neb) for (const [X, Y] of wrapCopies(x, y, Math.max(rx, ry)))
    nebs += `<ellipse cx="${n(X, 0)}" cy="${n(Y, 0)}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${n(X, 0)} ${n(Y, 0)})" fill="url(#${id}-${g})"/>`;
  let stars = '';
  const groups = { w: '', g: '' };
  for (let i = 0; i < 124; i++) {
    const x = rnd() * S, y = rnd() * S, r = 0.4 + Math.pow(rnd(), 2.4) * 1.0, o = 0.22 + rnd() * 0.7, col = rnd() < 0.3 ? 'g' : 'w';
    for (const [X, Y] of wrapCopies(x, y, r + 0.5)) groups[col] += `<circle cx="${n(X, 1)}" cy="${n(Y, 1)}" r="${n(r, 2)}" opacity="${n(o, 2)}"/>`;
  }
  stars = `<g fill="#ffffff">${groups.w}</g><g fill="#f6e3b0">${groups.g}</g>`;
  // a few brighter sparkles (kept away from the edges)
  let sparks = '';
  for (const [x, y, s] of [[96, 300, 1], [342, 118, 0.8], [430, 410, 0.9], [210, 60, 0.6], [40, 180, 0.6], [290, 380, 0.7]]) {
    sparks += circ(x, y, 7 * s, `fill="url(#${id}-gl)"`) + `<path d="${star4(x, y, 5.5 * s, 0.35 * s)}" fill="#fff6dc" opacity="0.85"/>` + circ(x, y, 0.9 * s, 'fill="#ffffff"');
  }
  const body = `<defs>` +
    `<radialGradient id="${id}-n"><stop offset="0" stop-color="#1b2b6b" stop-opacity="0.42"/><stop offset="0.55" stop-color="#1b2b6b" stop-opacity="0.16"/><stop offset="1" stop-color="#1b2b6b" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="${id}-p"><stop offset="0" stop-color="#2a2468" stop-opacity="0.32"/><stop offset="0.6" stop-color="#2a2468" stop-opacity="0.1"/><stop offset="1" stop-color="#2a2468" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="${id}-d"><stop offset="0" stop-color="#05071a" stop-opacity="0.6"/><stop offset="1" stop-color="#05071a" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="${id}-gl"><stop offset="0" stop-color="#f2c879" stop-opacity="0.35"/><stop offset="1" stop-color="#f2c879" stop-opacity="0"/></radialGradient>` +
    `</defs><rect width="${S}" height="${S}" fill="#0a0d24"/>${nebs}${stars}${sparks}`;
  write(id, S, S, body);
}

// ======================================================================
// 11. circle_sigil.svg 512
// ======================================================================
{
  const id = 'circle_sigil', c = 256;
  const pol = (r, a) => [c + Math.cos(a) * r, c + Math.sin(a) * r];
  const deg = Math.PI / 180;
  let ticks = '';
  for (let i = 0; i < 120; i++) {
    const a = i * 3 * deg - Math.PI / 2;
    const L = i % 10 === 0 ? 0 : (i % 5 === 0 ? 7 : 4);
    if (!L) continue;
    const [x1, y1] = pol(241, a), [x2, y2] = pol(241 - L, a);
    ticks += `M${P(x1, y1, 1)}L${P(x2, y2, 1)}`;
  }
  // hexagram
  const tri = off => { const p = [0, 1, 2].map(i => pol(194, off + i * 120 * deg)); return `M${p.map(q => P(q[0], q[1], 1)).join('L')}Z`; };
  // glyph marks in the 200..228 band, 24 positions, abstract (not letters)
  const glyphs = [
    `<circle cx="${c}" cy="${c - 214}" r="4"/><path d="M${c},${c - 222}V${c - 218}M${c},${c - 210}V${c - 206}"/>`,
    `<path d="M${c - 5},${c - 208}L${c},${c - 220}L${c + 5},${c - 208}M${c - 3},${c - 213}H${c + 3}"/>`,
    `<path d="M${c},${c - 222}V${c - 206}M${c - 4},${c - 218}L${c + 4},${c - 210}"/><circle cx="${c}" cy="${c - 224}" r="1.2"/>`,
    `<path d="M${c - 4},${c - 220}H${c + 4}L${c - 4},${c - 208}H${c + 4}"/>`,
    `<path d="${diamond(c, c - 214, 4, 6)}"/><circle cx="${c}" cy="${c - 214}" r="1"/>`,
    `<path d="M${c - 5},${c - 214}A5,5 0 0 1 ${c + 5},${c - 214}M${c},${c - 214}V${c - 206}"/>`,
  ];
  let runes = '';
  for (let i = 0; i < 24; i++) {
    if (i % 2 === 0) { // star point marker on 12 main positions
      runes += `<g transform="rotate(${i * 15} ${c} ${c})">${glyphs[(i / 2) % glyphs.length]}</g>`;
    } else {
      runes += `<g transform="rotate(${i * 15} ${c} ${c})"><circle cx="${c}" cy="${c - 214}" r="1.4" fill="url(#${id}-g)" stroke="none"/></g>`;
    }
  }
  const rays = [0, 90, 180, 270].map(a => `<path d="${taper([[c, c - 200], [c, c - 228], [c, c - 256]], lin(3.2, 0))}" transform="rotate(${a} ${c} ${c})"/>`).join('') +
    [45, 135, 225, 315].map(a => `<path d="${taper([[c, c - 200], [c, c - 216], [c, c - 232]], lin(2.2, 0))}" transform="rotate(${a} ${c} ${c})"/>`).join('');
  const vtx = [0, 1, 2, 3, 4, 5].map(i => { const [x, y] = pol(194, -Math.PI / 2 + i * 60 * deg); return `<circle cx="${n(x, 1)}" cy="${n(y, 1)}" r="6"/>`; }).join('');
  const vdots = [0, 1, 2, 3, 4, 5].map(i => { const [x, y] = pol(194, -Math.PI / 2 + i * 60 * deg); return circ(x, y, 1.8, ''); }).join('');
  // 8-point star centre
  const st = []; for (let i = 0; i < 16; i++) st.push(pol(i % 2 ? 22 : 62, -Math.PI / 2 + i * 22.5 * deg));
  const body = `<defs>${gold(id + '-g', 40, 40, 472, 472)}</defs>` +
    `<g fill="none" stroke="url(#${id}-g)">` +
    `<circle cx="${c}" cy="${c}" r="248" stroke-width="1.6"/><circle cx="${c}" cy="${c}" r="241" stroke-width="0.8"/>` +
    `<path d="${ticks}" stroke-width="1"/>` +
    `<circle cx="${c}" cy="${c}" r="228" stroke-width="1"/><circle cx="${c}" cy="${c}" r="200" stroke-width="1.6"/><circle cx="${c}" cy="${c}" r="194" stroke-width="0.7"/>` +
    `<g stroke-width="1.2">${runes}</g>` +
    `<path d="${tri(-Math.PI / 2)}${tri(Math.PI / 2)}" stroke-width="1.4" stroke-linejoin="round"/>` +
    `<circle cx="${c}" cy="${c}" r="112" stroke-width="1.1"/><circle cx="${c}" cy="${c}" r="97" stroke-width="0.7"/>` +
    `<path d="M${st.map(q => P(q[0], q[1], 1)).join('L')}Z" stroke-width="1.1"/>` +
    `<circle cx="${c}" cy="${c}" r="70" stroke-width="0.6" stroke-dasharray="2 5"/><circle cx="${c}" cy="${c}" r="14" stroke-width="1"/>` +
    `<g stroke-width="1">${vtx}</g></g>` +
    `<g fill="url(#${id}-g)">${rays}${vdots}${circ(c, c, 3, '')}` +
    [0, 90, 180, 270].map(a => `<path d="${diamond(c, c - 248, 4, 7)}" transform="rotate(${a} ${c} ${c})"/>`).join('') +
    `</g>`;
  write(id, 512, 512, body);
}
