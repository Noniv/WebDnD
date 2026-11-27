// Village / forest road / lower-dungeon tiles. Required by tiles.cjs (which writes them).
// Ground tiles are opaque and seamless; props are drawn on a transparent background, centred in the cell.
const { C, r1, rng, P, F, S, L, circ, ell, rect, radial, linear, star } = require('./common.cjs');

// draw `fn(x, y)` at (x, y) plus wrapped copies wherever an element of radius r crosses a tile edge
function wrap(x, y, r, fn) {
  let o = '';
  for (const dx of [-64, 0, 64]) for (const dy of [-64, 0, 64]) {
    const X = x + dx, Y = y + dy;
    if (X + r <= 0 || X - r >= 64 || Y + r <= 0 || Y - r >= 64) continue;
    o += fn(X, Y);
  }
  return o;
}
// smooth irregular closed shape: returns a function (dx, dy) -> path, so wrapped copies share one shape
function blob(rx, ry, R, n = 8, j = 0.15) {
  const ph = R() * Math.PI;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = ph + (i / n) * Math.PI * 2, k = 1 - j + 2 * j * R();
    pts.push([rx * k * Math.cos(a), ry * k * Math.sin(a)]);
  }
  return (cx, cy) => {
    const p = pts.map(([x, y]) => [x + cx, y + cy]);
    const mid = (a, b) => `${r1((a[0] + b[0]) / 2)} ${r1((a[1] + b[1]) / 2)}`;
    let d = `M${mid(p[n - 1], p[0])}`;
    for (let i = 0; i < n; i++) d += ` Q${r1(p[i][0])} ${r1(p[i][1])} ${mid(p[i], p[(i + 1) % n])}`;
    return d + ' Z';
  };
}
// scalloped "cloud" outline (foliage)
function cloud(cx, cy, rx, ry, n, R, bulge = 1.18) {
  const ph = R() * Math.PI * 2;
  const pt = (a, k) => `${r1(cx + rx * k * Math.cos(a))} ${r1(cy + ry * k * Math.sin(a))}`;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a0 = ph + (i / n) * Math.PI * 2, a1 = ph + ((i + 1) / n) * Math.PI * 2;
    const k = 0.9 + R() * 0.12;
    if (!i) d += `M${pt(a0, 0.92)}`;
    d += ` Q${pt((a0 + a1) / 2, bulge * k)} ${pt(a1, 0.92)}`;
  }
  return d + ' Z';
}
const tuft = (x, y, s = 1) => {
  const d = `M${r1(x - 3 * s)} ${y} l${r1(-1.5 * s)} ${r1(-5 * s)} M${x} ${y} l0 ${r1(-6.5 * s)} M${r1(x + 3 * s)} ${y} l${r1(1.5 * s)} ${r1(-5 * s)} M${r1(x - 1.5 * s)} ${y} l${r1(-0.5 * s)} ${r1(-4 * s)} M${r1(x + 1.5 * s)} ${y} l${r1(0.5 * s)} ${r1(-4 * s)}`;
  return ell(x, y + 0.5, 4.5 * s, 1.4 * s, C.ink, 0, 'opacity="0.25"') + S(d, '#2f3a22', 2.6) + S(d, '#6a7d44', 1.1);
};
const flower = (x, y, col) => {
  let o = '';
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; o += circ(r1(x + 1.6 * Math.cos(a)), r1(y + 1.6 * Math.sin(a)), 1.2, col, 0); }
  return circ(x, y + 0.6, 3, C.ink, 0, 'opacity="0.3"') + o + circ(x, y, 0.9, C.gold, 0);
};

// ---------------- ground ----------------
function grass(seed, extra) {
  const R = rng(seed);
  let o = rect(0, 0, 64, 64, '#45532f');
  const blots = ['#4c5b33', '#3f4c2b', '#4a5832', '#414f2c'];
  for (let i = 0; i < 9; i++) {
    const x = R() * 64, y = R() * 64, rx = 7 + R() * 9, ry = 5 + R() * 7, col = blots[i % 4];
    o += wrap(x, y, rx, (X, Y) => ell(r1(X), r1(Y), r1(rx), r1(ry), col, 0, 'opacity="0.7"'));
  }
  let dk = '', lt = '';
  for (let i = 0; i < 64; i++) {
    const x = R() * 64, y = R() * 64, dx = (R() - 0.5) * 2.4, len = 2 + R() * 2.5;
    const seg = wrap(x, y, 4, (X, Y) => `M${r1(X)} ${r1(Y)} l${r1(dx)} ${r1(-len)} `);
    if (i % 2) dk += seg; else lt += seg;
  }
  o += S(dk, '#35422a', 1.1) + S(lt, '#5a6b3b', 1, 'opacity="0.8"');
  return o + extra(R);
}
const ground = {};
ground.grass_1 = () => grass(41, (R) => tuft(18, 22) + tuft(46, 48, 0.9) + tuft(52, 12, 0.7));
ground.grass_2 = () => grass(42, (R) => tuft(12, 50, 0.8) + tuft(40, 20) +
  flower(26, 36, C.p1) + flower(31, 40, C.p1) + flower(50, 44, '#c9b25a') + flower(8, 14, '#b9a8c8'));
ground.grass_3 = () => grass(43, (R) => {
  const peb = blob(3.2, 2.4, R, 7, 0.2), peb2 = blob(2.2, 1.7, R, 7, 0.2);
  let clover = '';
  for (const [x, y] of [[44, 34], [47.5, 36], [44.5, 38.5], [14, 46], [17, 44.5]]) clover += circ(x, y, 2.2, '#566a38', 0.8);
  return F(peb(23, 27), C.ink, 'opacity="0.4" transform="translate(0.8 1.2)"') + P(peb(22, 26), '#6a6358', 1) + S('M20 25 q2 -1.5 4 -0.5', '#8a8174', 0.9) +
    P(peb2(28, 30), '#5e584e', 0.9) + clover + tuft(36, 56, 0.8) + tuft(56, 18, 0.9);
});

function cobbles(seed, holes = []) {
  const R = rng(seed);
  let o = rect(0, 0, 64, 64, '#2b2722');
  const fills = ['#57504a', '#514a43', '#5b544c', '#4c4640', '#55504a', '#4f4943'];
  let dirt = '', all = '', spots = '', hl = '';
  const byFill = {};
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const off = row % 2 ? 8 : 0;
      const x = col * 16 + 8 + off + (R() - 0.5) * 1.4, y = row * 16 + 8 + (R() - 0.5) * 1.2;
      const shape = blob(6.6 + R() * 0.6, 6.2 + R() * 0.6, R, 7, 0.1);
      const fill = fills[Math.floor(R() * fills.length)];
      const sp = [R(), R(), R(), R()];
      if (holes.includes(row * 4 + col)) {
        dirt += wrap(x, y, 9, (X, Y) => F(shape(X, Y), '#4a3c2c') + S(`M${r1(X - 3)} ${r1(Y + 1)} h0.01 M${r1(X + 2)} ${r1(Y - 2)} h0.01 M${r1(X + 1)} ${r1(Y + 3)} h0.01`, '#6a5a44', 1.6));
        continue;
      }
      const d = wrap(x, y, 8, (X, Y) => shape(X, Y) + ' ');
      all += d;
      byFill[fill] = (byFill[fill] || '') + d;
      hl += wrap(x, y, 8, (X, Y) => `M${r1(X - 4.6)} ${r1(Y + 1.5)} Q${r1(X - 4.4)} ${r1(Y - 4.2)} ${r1(X + 1)} ${r1(Y - 4.8)} `);
      spots += wrap(x, y, 8, (X, Y) => `M${r1(X - 3 + sp[0] * 5)} ${r1(Y - 2 + sp[1] * 4)} h0.01 M${r1(X - 2 + sp[2] * 4)} ${r1(Y + sp[3] * 3)} h0.01 `);
    }
  }
  // one path per layer: shadow (offset down-right), lit rim (offset up-left), then the stones grouped by colour
  o += F(all.trim(), C.ink, 'opacity="0.55" transform="translate(0.9 1.3)"') + Object.entries(byFill).map(([f, d]) => F(d.trim(), f)).join('') +
    S(spots, '#3f3a34', 1.5) + S(hl, '#6e665b', 1.2, 'opacity="0.8"');
  return o + dirt;
}
ground.road_1 = () => cobbles(51);
ground.road_2 = () => cobbles(52, [5, 14]) + tuft(28, 24, 0.6) + S('M40 46 L45 50 L44 54', C.ink, 1, 'opacity="0.55"');

ground.dirt = () => {
  const R = rng(61);
  let o = rect(0, 0, 64, 64, '#4a3d2d');
  const blots = ['#524430', '#433727', '#4e4130'];
  for (let i = 0; i < 10; i++) {
    const x = R() * 64, y = R() * 64, rx = 6 + R() * 10, ry = 4 + R() * 6, col = blots[i % 3];
    o += wrap(x, y, rx, (X, Y) => ell(r1(X), r1(Y), r1(rx), r1(ry), col, 0, 'opacity="0.75"'));
  }
  let sp1 = '', sp2 = '';
  for (let i = 0; i < 46; i++) {
    const x = R() * 64, y = R() * 64;
    const seg = wrap(x, y, 2, (X, Y) => `M${r1(X)} ${r1(Y)} h0.01 `);
    if (i % 2) sp1 += seg; else sp2 += seg;
  }
  o += S(sp1, '#594a36', 1.5) + S(sp2, '#3c3124', 1.3);
  for (let i = 0; i < 4; i++) {
    const x = R() * 64, y = R() * 64, sh = blob(1.4 + R() * 1.8, 1.1 + R() * 1.3, R, 7, 0.25);
    o += wrap(x, y, 5, (X, Y) => F(sh(X + 0.6, Y + 0.9), C.ink, 'opacity="0.35"') + F(sh(X, Y), i % 2 ? '#64574a' : '#5a5045'));
  }
  o += S('M10 30 L15 32 L17 36 M50 8 L53 12', C.ink, 0.9, 'opacity="0.45"');
  return o;
};

ground.water = () => {
  const R = rng(71);
  let o = rect(0, 0, 64, 64, '#1c383e');
  const blots = ['#214148', '#183238', '#1f3d44'];
  for (let i = 0; i < 8; i++) {
    const x = R() * 64, y = R() * 64, rx = 8 + R() * 10, ry = 4 + R() * 5, col = blots[i % 3];
    o += wrap(x, y, rx, (X, Y) => ell(r1(X), r1(Y), r1(rx), r1(ry), col, 0, 'opacity="0.8"'));
  }
  let rip = '', hi = '', dots = '';
  const spots = [[8, 10], [36, 6], [56, 22], [20, 30], [44, 38], [6, 50], [30, 56], [54, 58], [62, 42]];
  for (const [bx, by] of spots) {
    const x = bx + (R() - 0.5) * 3, y = by + (R() - 0.5) * 3, w = 5 + R() * 4;
    rip += wrap(x, y, w + 2, (X, Y) => `M${r1(X - w)} ${r1(Y)} q${r1(w / 2)} -2.4 ${r1(w)} 0 t${r1(w)} 0 `);
    if (R() < 0.6) hi += wrap(x, y, w, (X, Y) => `M${r1(X - w * 0.5)} ${r1(Y + 3.2)} q${r1(w * 0.4)} -1.6 ${r1(w * 0.8)} 0 `);
    if (R() < 0.5) dots += wrap(x, y, 4, (X, Y) => `M${r1(X + w * 0.6)} ${r1(Y - 3)} h0.01 `);
  }
  o += S(rip, '#11262b', 2.6, 'opacity="0.55" transform="translate(0 1)"') + S(rip, '#3e6e70', 1.3, 'opacity="0.8"') + S(hi, '#2f5a5e', 1.1) + S(dots, '#9fc9c0', 1.5, 'opacity="0.6"');
  return o;
};

ground.cave_floor = () => {
  const R = rng(81);
  let o = rect(0, 0, 64, 64, '#222125');
  const fills = ['#2d2c31', '#2a292e', '#302f34', '#28272b'];
  const plates = [[12, 12, 12, 10], [40, 8, 13, 9], [58, 30, 10, 12], [30, 32, 13, 11], [8, 42, 10, 11], [46, 52, 12, 10], [22, 58, 10, 8]];
  let all = '';
  const byFill = {};
  plates.forEach(([x, y, rx, ry], i) => {
    const sh = blob(rx, ry, R, 9, 0.16);
    const d = wrap(x, y, Math.max(rx, ry) + 2, (X, Y) => sh(X, Y) + ' ');
    all += d;
    byFill[fills[i % 4]] = (byFill[fills[i % 4]] || '') + d;
  });
  o += F(all.trim(), C.ink, 'opacity="0.6" transform="translate(1 1.4)"') + F(all.trim(), '#3b3a40', 'transform="translate(-0.8 -0.9)"') +
    Object.entries(byFill).map(([f, d]) => F(d.trim(), f)).join('');
  let cr = '';
  for (let i = 0; i < 5; i++) {
    const x = R() * 64, y = R() * 64;
    const a = R() * 6, b = R() * 6;
    cr += wrap(x, y, 8, (X, Y) => `M${r1(X)} ${r1(Y)} l${r1(2 + a)} ${r1(1 + b * 0.5)} l${r1(1 + b * 0.4)} ${r1(3 + a * 0.3)} `);
  }
  let peb = '', sp = '';
  for (let i = 0; i < 30; i++) {
    const x = R() * 64, y = R() * 64;
    sp += wrap(x, y, 2, (X, Y) => `M${r1(X)} ${r1(Y)} h0.01 `);
  }
  for (let i = 0; i < 5; i++) {
    const x = R() * 64, y = R() * 64, sh = blob(1.5 + R() * 1.4, 1.2 + R(), R, 6, 0.2);
    peb += wrap(x, y, 4, (X, Y) => P(sh(X, Y), '#45434a', 0.8));
  }
  o += S(cr, C.ink, 1.1, 'opacity="0.8"') + S(sp, '#3d3c43', 1.5) + peb;
  return o;
};

module.exports = function townTiles({ floorBase }) {
  const T = { ...ground };

  T.flooded_floor = () => {
    const R = rng(91);
    let o = floorBase('c', 13);
    o += rect(0, 0, 64, 64, '#1f5257', 0, 0, 'opacity="0.55"');
    for (let i = 0; i < 6; i++) {
      const x = R() * 64, y = R() * 64, rx = 8 + R() * 8, ry = 4 + R() * 4;
      o += wrap(x, y, rx, (X, Y) => ell(r1(X), r1(Y), r1(rx), r1(ry), i % 2 ? '#2a6a6c' : '#173c40', 0, 'opacity="0.35"'));
    }
    let rip = '', dots = '';
    for (const [bx, by] of [[12, 8], [44, 14], [26, 30], [56, 40], [8, 52], [38, 56]]) {
      const x = bx + (R() - 0.5) * 3, y = by + (R() - 0.5) * 3, w = 4 + R() * 3;
      rip += wrap(x, y, w * 2 + 2, (X, Y) => `M${r1(X - w)} ${r1(Y)} q${r1(w / 2)} -2 ${r1(w)} 0 t${r1(w)} 0 `);
      dots += wrap(x, y, 4, (X, Y) => `M${r1(X + w * 1.6)} ${r1(Y - 2.5)} h0.01 `);
    }
    o += S(rip, '#5f9e98', 1.2, 'opacity="0.65"') + S(dots, '#a8d4cc', 1.4, 'opacity="0.55"');
    return o;
  };

  T.house_wall = () => {
    const R = rng(101);
    let o = rect(0, 0, 64, 64, '#9c8862');
    const panels = [[4, 4], [36, 4], [4, 36], [36, 36]];
    const pf = ['#a49069', '#9e8a64', '#a08c66', '#a5916a'];
    panels.forEach(([x, y], i) => {
      o += rect(x, y, 24, 24, pf[i]);
      for (let k = 0; k < 2; k++) o += ell(r1(x + 5 + R() * 14), r1(y + 5 + R() * 14), r1(3 + R() * 4), r1(2 + R() * 3), '#8a7652', 0, 'opacity="0.45"');
      o += rect(x, y, 24, 3, '#6e5c3e', 0, 0, 'opacity="0.55"');
    });
    let hatch = '';
    for (let k = 0; k <= 128; k += 6) hatch += `M${k} 0 L${k - 64} 64 `;
    o += S(hatch, C.ink, 0.8, 'opacity="0.12"');
    // diagonal braces in two panels
    const brace = (d) => S(d, C.ink, 6.5) + S(d, '#6e4226', 4);
    o += brace('M5 27 L27 5') + brace('M37 37 L59 59');
    const beam = (x, y, w, h) => rect(x, y, w, h, C.wood) + S(w > h ? `M${x} ${y + 1.2} H${x + w}` : `M${x + 1.2} ${y} V${y + h}`, '#94603a', 1.1);
    // posts at x=0/64 and 32; beams at y=0/64 and 32 (halves on the edges, so neighbours join)
    o += beam(-4, 0, 8, 64) + beam(60, 0, 8, 64) + beam(28, 0, 8, 64);
    o += beam(0, -4, 64, 8) + beam(0, 60, 64, 8) + beam(0, 28, 64, 8);
    o += S('M0 4 H64 M0 36 H64', '#2c1a0e', 1.2, 'opacity="0.7"') + S('M0 28 H64 M0 60 H64', C.ink, 1.2) +
      S('M4 0 V64 M36 0 V64', C.ink, 1.2) + S('M28 0 V64 M60 0 V64', C.ink, 1.2);
    // pegs at the joints and grain
    let pegs = '';
    for (const [x, y] of [[32, 32], [0, 32], [64, 32], [32, 0], [32, 64], [0, 0], [64, 0], [0, 64], [64, 64]]) pegs += circ(x, y, 1.3, C.woodD, 0.7);
    o += pegs + S('M30 8 V14 M30 44 V50 M10 30 H16 M46 62 H52 M46 30 H52 M10 62 H16', C.woodD, 0.9, 'opacity="0.8"');
    return o;
  };

  T.roof = () => {
    const R = rng(111);
    // four courses of thatch bundles; each course overlaps the one below with a scalloped, shadowed lip
    let o = rect(0, 0, 64, 64, '#5e4829');
    const rows = ['#735833', '#6e5431', '#765b35', '#6b5230'];
    for (let r = 0; r < 4; r++) {
      const y0 = r * 16, off = r % 2 ? 8 : 0;
      o += rect(0, y0, 64, 16, rows[r]);
      let straw = '', straw2 = '';
      for (let i = 0; i < 22; i++) {
        const x = R() * 64, len = 5 + R() * 6, y = y0 + 2 + R() * (12 - len);
        straw += `M${r1(x)} ${r1(y)} l${r1((R() - 0.5) * 1.2)} ${r1(len)} `;
        if (i % 2 === 0) straw2 += `M${r1(x + 2)} ${r1(y + 1)} v${r1(len * 0.7)} `;
      }
      o += S(straw, '#957747', 1, 'opacity="0.55"') + S(straw2, '#4a3820', 0.9, 'opacity="0.5"');
      let sc = '', lip = '';
      for (let x = -16 + off; x < 80; x += 16) {
        sc += `M${x} ${y0 + 15} Q${x + 8} ${y0 + 20} ${x + 16} ${y0 + 15} `;
        lip += `M${x + 2} ${y0 + 13.5} Q${x + 8} ${y0 + 17} ${x + 14} ${y0 + 13.5} `;
      }
      const sh = sc.replace(/M(-?\d+) (\d+)/g, (m, a, b) => `M${a} ${+b + 1.5}`);
      o += S(sh, C.ink, 3, 'opacity="0.35"') + S(sc, '#3a2b17', 1.8) + S(lip, '#a08250', 1, 'opacity="0.55"');
    }
    // wrap the last course's lip onto the top edge
    let top = '';
    for (let x = -8; x < 80; x += 16) top += `M${x} -1 Q${x + 8} 4 ${x + 16} -1 `;
    o += S(top, '#3a2b17', 1.8);
    return o;
  };

  // ---------------- props (transparent) ----------------
  T.tree = () => {
    const R = rng(121);
    const canopy = cloud(32, 29, 27, 25, 11, R);
    const mid = cloud(29, 26, 19, 17, 9, R);
    const top = cloud(25, 21, 10, 9, 7, R);
    return ell(36, 40, 27, 22, C.ink, 0, 'opacity="0.35"') +
      P('M27 44 H37 L37 56 C37 58 39 59 41 60 H23 C25 59 27 58 27 56 Z', C.wood, 2) + S('M30 47 V57', '#94603a', 1) + S('M34 50 V58', C.woodD, 1) +
      P(canopy, '#3f5a32', 2.6) + F(mid, '#4c6a3a') + F(top, '#5c7d45') +
      S('M15 18 q3 -4 8 -5 M38 10 q4 0 7 3 M12 32 q-1 -4 1 -7', '#7a9a52', 1.6) +
      S('M44 40 q4 -3 5 -8 M30 48 q6 0 10 -4 M48 26 q2 3 1 6', '#2c4026', 1.6) +
      S('M22 30 h0.01 M36 20 h0.01 M40 33 h0.01 M28 38 h0.01 M18 24 h0.01', '#2c4026', 2.2);
  };

  T.pine = () => {
    const R = rng(131);
    const jag = (n, ro, ri, rot) => {
      const pts = [];
      for (let i = 0; i < n * 2; i++) {
        const r = (i % 2 ? ri : ro) * (0.9 + R() * 0.2);
        const a = ((rot + (i * 180) / n) * Math.PI) / 180;
        pts.push(`${r1(32 + r * Math.cos(a))} ${r1(30 + r * Math.sin(a))}`);
      }
      return 'M' + pts.join(' L') + ' Z';
    };
    const l1 = jag(11, 29, 21, -90), l2 = jag(9, 21, 14, -70), l3 = jag(7, 13, 8, -50);
    return ell(37, 38, 26, 22, C.ink, 0, 'opacity="0.4"') +
      P(l1, '#243b2b', 2.4) + S(l1, '#2f4a34', 1, 'opacity="0.8" transform="translate(32 30) scale(0.86) translate(-32 -30)"') +
      P(l2, '#2f4a35', 2) + P(l3, '#3d5e42', 1.8) + circ(32, 30, 3, '#4c3220', 1.4) +
      S('M22 18 l3 3 M42 16 l-2 4 M18 34 l4 -1 M46 38 l-4 -2 M30 48 l1 -4', '#577a55', 1.2, 'opacity="0.9"');
  };

  T.bush = () => {
    const R = rng(141);
    const b = cloud(32, 36, 19, 15, 9, R), m = cloud(29, 33, 12, 9, 7, R);
    return ell(35, 44, 20, 11, C.ink, 0, 'opacity="0.35"') + P(b, '#43603a', 2.4) + F(m, '#557544') +
      S('M20 30 q2 -4 6 -5 M34 24 q4 -1 7 1', '#77985a', 1.4) + S('M40 44 q4 -2 6 -6 M24 46 q4 1 8 -1', '#2c4026', 1.4) +
      circ(24, 38, 1.8, '#9a3a2e', 1) + circ(41, 33, 1.8, '#9a3a2e', 1) + circ(36, 43, 1.6, '#9a3a2e', 1) + circ(30, 28, 1.5, '#9a3a2e', 1);
  };

  T.fence = () => {
    const post = (x) => ell(x + 1, 47, 6, 2.5, C.ink, 0, 'opacity="0.35"') + rect(x - 3.5, 22, 7, 25, C.woodD, 2, 1) + rect(x - 3.5, 18, 7, 7, '#94603a', 2, 1) +
      S(`M${x - 1.5} 27 V44`, C.wood, 1);
    const rail = (y) => S(`M-2 ${y + 4} H66`, C.ink, 3.5, 'opacity="0.35"') + S(`M-2 ${y} H66`, C.ink, 7) + S(`M-2 ${y} H66`, C.wood, 4.2) + S(`M-2 ${y - 1.2} H66`, '#94603a', 1);
    return post(12) + post(52) + rail(29) + rail(39) + S('M20 30 h6 M34 40 h8 M58 29 h4', C.woodD, 0.8);
  };

  T.well = () => {
    let st = '';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.2;
      st += `M${r1(32 + 13 * Math.cos(a))} ${r1(36 + 13 * Math.sin(a))} L${r1(32 + 21 * Math.cos(a))} ${r1(36 + 21 * Math.sin(a))} `;
    }
    return ell(35, 41, 24, 22, C.ink, 0, 'opacity="0.35"') +
      circ(32, 36, 21, '#5d564d', 2.6) + S(st, C.ink, 1.3, 'opacity="0.8"') + S('M14 30 A19 19 0 0 1 30 17', '#82786a', 1.6) +
      circ(32, 36, 13, '#101a1e', 2.4) + S('M24 38 A9 9 0 0 0 36 44', '#3e6e70', 1.4) + circ(29, 33, 1, '#9fc9c0', 0) +
      // crank posts and beam
      rect(5, 30, 7, 12, C.woodD, 2, 1) + rect(52, 30, 7, 12, C.woodD, 2, 1) +
      S('M8 33 H58', C.ink, 7) + S('M8 33 H58', C.wood, 4) + S('M8 31.8 H58', '#94603a', 1) +
      L('M58 33 H62 V40', 1.8, C.iron, 1.2) +
      S('M32 33 V40', '#cdb98f', 1.6) + rect(28, 39, 8, 7, C.wood, 1.6, 1) + S('M28 41.5 H36', C.iron, 1) +
      S('M20 33 C24 31 28 31 32 33', '#cdb98f', 1.4);
  };

  T.stall = () => {
    const id = 'stall';
    const awn = 'M4 6 H60 L57 34 H7 Z';
    let stripes = '';
    for (let x = 4; x < 60; x += 14) stripes += rect(x, 0, 7, 40, '#9a3a2e');
    let val = 'M7 34';
    for (let x = 7; x < 57; x += 6.25) val += ` Q${r1(x + 3.1)} 40 ${r1(x + 6.25)} 34`;
    return `<defs><clipPath id="${id}-awn"><path d="${awn}"/></clipPath></defs>` +
      rect(8, 10, 52, 52, C.ink, 0, 3, 'opacity="0.3"') +
      rect(6, 38, 52, 20, C.woodD, 2.2, 1.5) + S('M8 44 H56 M8 51 H56', '#3f2614', 1) + rect(6, 38, 52, 5, '#94603a', 2, 1.5) +
      // goods
      circ(14, 47, 3, '#9a3a2e', 1.3) + circ(19, 49, 3, '#a8463a', 1.3) + circ(15, 52, 3, '#9a3a2e', 1.3) +
      P('M26 45 C26 42 36 42 36 45 C36 48 26 48 26 45 Z', '#c08a4a', 1.4) + S('M29 43.5 l1 2 M32 43.3 l1 2', '#7a4a2a', 0.9) +
      P('M27 50 C27 48 35 48 35 50 C35 53 27 53 27 50 Z', '#b07a3e', 1.3) +
      rect(41, 43, 6, 9, '#4f9d8a', 1.4, 1.5) + rect(42, 41, 4, 3, C.p2, 1, 0.5) + rect(49, 45, 5, 7, '#8a6bd1', 1.4, 1.5) +
      // posts
      rect(6, 32, 4, 26, C.woodD, 1.5) + rect(54, 32, 4, 26, C.woodD, 1.5) +
      // awning
      F(awn, C.ink, 'opacity="0.3" transform="translate(0 4)"') + P(awn, '#d9c9a4', 2.5) +
      `<g clip-path="url(#${id}-awn)">${stripes}${F('M32 6 L60 6 L57 34 L32 34 Z', C.ink, 'opacity="0.18"')}</g>` +
      P(awn, 'none', 2.5) + P(val + ' Z', '#9a3a2e', 1.8) + S('M8 8 H58', '#f1e4c6', 1.2, 'opacity="0.7"') + S('M32 7 V33', C.ink, 1, 'opacity="0.35"');
  };

  T.anvil = () => {
    const body = 'M9 22 H42 C50 22 57 23.5 61 27 C55 30 49 31 43 31 L39 34 V40 L45 45 V50 H19 V45 L25 40 V34 L19 31 H13 C10 29 9 25.5 9 22 Z';
    return ell(34, 54, 26, 7, C.ink, 0, 'opacity="0.4"') +
      P('M10 46 V54 C10 58 54 58 54 54 V46 Z', C.woodD, 2.2) + ell(32, 46, 22, 6, C.wood, 2.2) + ell(32, 46, 15, 3.8, 'none', 0, `stroke="${C.woodD}" stroke-width="1"`) +
      S('M14 50 V55 M22 52 V57', '#3f2614', 1) +
      P(body, '#47433f', 2.6) + F('M9 22 H42 C50 22 57 23.5 61 27 C55 26.5 49 26 42 26 H11 Z', '#7a756e') +
      S('M11 23.2 H42 C48 23.2 53 24 57 25.5', '#a8a29a', 1) + F('M25 34 H39 V40 L45 45 V50 H33 Z', C.ink, 'opacity="0.25"') +
      rect(30, 20, 8, 3.5, C.e1, 1.4, 1) + S('M31 21 h6', C.e2, 1) +
      // hammer leaning on the stump
      L('M44 60 L56 40', 2.4, '#7a4a2a', 1.4) + P('M51 37 L60 42 L57 47 L48 42 Z', '#5e5a55', 1.8) + S('M52 38.5 L59 42.5', '#8a857e', 1);
  };

  T.barrels = () => {
    const barrel = (x, y, r) => ell(x + 2, y + 3, r, r * 0.9, C.ink, 0, 'opacity="0.35"') + circ(x, y, r, C.wood, 2.4) +
      circ(x, y, r - 2.6, 'none', 0, `stroke="${C.iron}" stroke-width="2.6"`) + circ(x, y, r - 2.6, 'none', 0, `stroke="${C.ink}" stroke-width="0.8" opacity="0.6"`) +
      circ(x, y, r - 4.4, '#8d5a33', 1.2) + S(`M${x - r + 5} ${y - 3} H${x + r - 5} M${x - r + 4.5} ${y + 3} H${x + r - 4.5}`, C.woodD, 1) +
      circ(x + 3, y - 1, 1.3, C.woodD, 0) + S(`M${x - r + 2} ${y - 4} A${r - 2} ${r - 2} 0 0 1 ${x - 3} ${y - r + 2}`, '#b07a4a', 1.2);
    const crate = rect(11, 37, 22, 22, C.ink, 0, 1, 'opacity="0.35" transform="translate(2 3)"') + rect(9, 35, 22, 22, '#8a6a42', 2.2, 1) +
      rect(11.5, 37.5, 17, 17, 'none', 0, 0, `stroke="${C.woodD}" stroke-width="1"`) + S('M12 38 L28 54 M28 38 L12 54', C.ink, 4.6) + S('M12 38 L28 54 M28 38 L12 54', '#a8844e', 2.4) +
      S('M10 36.2 H30', '#c09a62', 1);
    return crate + barrel(23, 20, 13) + barrel(45, 42, 14);
  };

  T.signpost = () => {
    const board = (d, hi) => F(d, C.ink, 'opacity="0.35" transform="translate(1.5 2.5)"') + P(d, '#94603a', 2.2) + S(hi, '#b7804e', 1) + S(hi.replace(/M(\d+) (\d+)/g, (m, a, b) => `M${a} ${+b + 4}`), C.ink, 1.1, 'opacity="0.55" stroke-dasharray="3 2"');
    return ell(34, 58, 13, 4, C.ink, 0, 'opacity="0.4"') + ell(32, 57, 9, 3.4, '#5a534a', 1.6) +
      rect(29, 10, 6, 48, C.wood, 2.2, 1) + S('M31 13 V55', '#94603a', 1) +
      board('M28 13 H52 L59 19 L52 25 H28 Z', 'M31 17 H50') +
      board('M36 31 H12 L5 37 L12 43 H36 Z', 'M15 35 H33') +
      circ(32, 19, 1.2, C.iron, 0.8) + circ(32, 37, 1.2, C.iron, 0.8) + P('M28 10 L32 6 L36 10 Z', C.woodD, 1.8);
  };

  T.mine_entrance = () => {
    const id = 'mine_entrance';
    const R = rng(151);
    const mound = blob(31, 26, R, 10, 0.08)(32, 34);
    let rocks = '';
    for (const [x, y, r] of [[8, 30, 5], [12, 50, 6], [56, 28, 5], [54, 50, 6], [30, 10, 5], [44, 14, 4], [18, 14, 4]]) {
      const sh = blob(r, r * 0.8, R, 7, 0.18);
      rocks += F(sh(x + 1, y + 1.5), C.ink, 'opacity="0.5"') + P(sh(x, y), R() < 0.5 ? '#5a524a' : '#4f4840', 1.6) + S(`M${x - r * 0.5} ${y} q${r * 0.2} -${r * 0.5} ${r * 0.7} -${r * 0.5}`, '#7a7064', 1);
    }
    const mouth = 'M20 62 L21 30 H43 L44 62 Z';
    let sleepers = '';
    for (const [y, w] of [[58, 10], [51, 8.5], [45, 7], [40, 5.6], [36, 4.4]]) sleepers += rect(r1(32 - w - 2), y, r1(2 * w + 4), 2.4, '#3f2614', 0, 0.5, `opacity="${r1(0.4 + (y - 36) * 0.025)}"`);
    return `<defs>${linear(id + '-dark', [[0, '#050403'], [0.6, '#15110e'], [1, '#2a2520']], 'x1="0" y1="0" x2="0" y2="1"')}</defs>` +
      F(mound, C.ink, 'opacity="0.4" transform="translate(2 3)"') + P(mound, '#3a342e', 2.4) + S('M6 34 C8 18 20 9 34 8', '#5a524a', 2, 'opacity="0.8"') + rocks +
      P(mouth, `url(#${id}-dark)`, 2.4) + sleepers + S('M24 62 L30 33 M40 62 L34 33', '#6e6a64', 1.3, 'opacity="0.7"') +
      // timbers
      rect(15, 27, 7, 35, C.wood, 2.2, 1) + rect(42, 27, 7, 35, C.wood, 2.2, 1) + S('M17 30 V60 M44 30 V60', '#94603a', 1) +
      rect(11, 21, 42, 8, '#6e4226', 2.4, 1) + S('M13 23 H51', '#94603a', 1) + S('M16 25 h8 M36 25 h10', C.woodD, 0.9) +
      L('M22 34 L28 29.5 M42 34 L36 29.5', 2, C.wood, 1.3) + circ(18.5, 25, 1.2, C.iron, 0.6) + circ(45.5, 25, 1.2, C.iron, 0.6) +
      // lantern on the post
      S('M49 33 H52 V36', C.ink, 1.2) + rect(50, 36, 5, 6, C.e2, 1.4, 1) + circ(52.5, 39, 8, C.e1, 0, 'opacity="0.18"');
  };

  T.stairs_down = () => {
    const id = 'stairs_down';
    let o = `<defs>${linear(id + '-deep', [[0, '#000000', 0], [0.55, '#050403', 0.35], [1, '#050403', 0.92]], 'x1="0" y1="0" x2="0" y2="1"')}</defs>` + rect(0, 0, 64, 64, C.ink);
    const cols = ['#5c544a', '#4f483f', '#433d35', '#37322c', '#2c2824', '#221f1c'];
    for (let i = 0; i < 6; i++) {
      const y = 1 + i * 10.5, ins = i * 1.6;
      o += rect(r1(9 + ins), y, r1(46 - 2 * ins), 9.5, cols[i]) + S(`M${r1(10 + ins)} ${r1(y + 1)} H${r1(54 - ins)}`, '#7d7366', 1, `opacity="${r1(0.85 - i * 0.13)}"`) +
        rect(r1(9 + ins), r1(y + 7.5), r1(46 - 2 * ins), 2, C.ink, 0, 0, 'opacity="0.6"') +
        S(`M${r1(16 + (i * 7) % 18)} ${r1(y + 4)} l3 2 M${r1(34 + (i * 5) % 10)} ${r1(y + 5)} l4 -1`, C.ink, 0.8, 'opacity="0.4"');
    }
    // walls close in as the stair goes down
    o += P('M0 0 H9 L17 64 H0 Z', '#2c2722', 0) + P('M64 0 H55 L47 64 H64 Z', '#2c2722', 0) +
      S('M6 0 L14 64', '#4a433b', 3) + S('M9 0 L17 64 M55 0 L47 64', C.ink, 1.5) + S('M57 0 L49 64', '#1f1b18', 2) + S('M1 0 V64 M63 0 V64', '#3a342e', 1.5);
    o += rect(0, 0, 64, 64, `url(#${id}-deep)`);
    return o;
  };

  function cage(open) {
    const id = open ? 'cage_open' : 'cage';
    let bars = '';
    for (let x = 14; x <= 50; x += 6) bars += `M${x} 21 V57 `;
    let topBars = '';
    for (let x = 16; x <= 48; x += 8) topBars += `M${x} 9 L${x - 2} 20 `;
    let o = ell(34, 59, 26, 5, C.ink, 0, 'opacity="0.4"');
    // inside floor + straw
    o += rect(11, 20, 42, 38, '#1c1815', 0, 0) + F('M11 40 H53 V58 H11 Z', '#2a2520') +
      S('M16 52 l6 -2 M24 54 l7 1 M36 51 l6 2 M44 54 l5 -2 M20 48 l4 1 M40 47 l5 -1', '#8a7350', 1.2, 'opacity="0.8"');
    if (open) {
      bars = '';
      for (const x of [14, 20, 44, 50]) bars += `M${x} 21 V57 `;
    }
    o += S(bars, C.ink, 4) + S(bars, '#6e6a64', 1.8);
    // frame: top lid (seen from above) and front rails
    o += P('M12 8 H52 L54 20 H10 Z', 'none', 2.4) + S(topBars, C.ink, 3.4) + S(topBars, '#6e6a64', 1.4) +
      S('M12 8 H52 L54 20 H10 Z', C.ink, 5) + S('M12 8 H52 L54 20 H10 Z', C.iron, 2.4) +
      S('M10 20 V58 H54 V20', C.ink, 5.5) + S('M10 20 V58 H54 V20', C.iron, 2.8) + S('M10 39 H54', C.ink, 4.4) + S('M10 39 H54', C.iron, 2);
    let rv = '';
    for (const [x, y] of [[10, 20], [54, 20], [10, 58], [54, 58], [12, 8], [52, 8]]) rv += circ(x, y, 1.8, '#8a857e', 1);
    o += rv;
    if (!open) {
      o += S('M24 22 V56 H40 V22 Z', C.ink, 4.4) + S('M24 22 V56 H40 V22 Z', '#5e5a55', 2) + rect(36, 34, 7, 8, C.gold, 1.6, 1.2) + circ(39.5, 37.5, 1, C.ink, 0) +
        S('M26 30 h12', '#8a857e', 1, 'opacity="0.6"');
    } else {
      // door swung out on its hinges to the right
      const door = 'M40 22 L60 28 L60 62 L40 56 Z';
      let db = '';
      for (const t of [0.25, 0.5, 0.75]) db += `M${r1(40 + 20 * t)} ${r1(22 + 6 * t)} V${r1(56 + 6 * t)} `;
      o += F(door, C.ink, 'opacity="0.3" transform="translate(2 3)"') + S(door, C.ink, 4.4) + S(door, '#5e5a55', 2) + S(db, C.ink, 3.4) + S(db, '#6e6a64', 1.4) +
        rect(55, 40, 5, 7, C.gold, 1.4, 1) + S('M24 22 V56', C.ink, 3) + S('M40 22 V56', C.ink, 4) + S('M40 22 V56', C.iron, 2);
    }
    void id;
    return o;
  }
  T.cage = () => cage(false);
  T.cage_open = () => cage(true);

  T.door_house = () => {
    const door = 'M20 62 V24 C20 16 26 11 32 11 C38 11 44 16 44 24 V62 Z';
    let pl = '';
    for (const x of [26, 32, 38]) pl += `M${x} 13 V61 `;
    return T.house_wall() +
      // stone surround
      P('M15 64 V23 C15 12 23 5 32 5 C41 5 49 12 49 23 V64 Z', '#6a6056', 2.4) +
      S('M18 60 V24 C18 15 24 8.5 32 8.5', '#8a7f71', 1.2) + S('M15 34 H20 M44 34 H49 M15 48 H20 M44 48 H49 M23 9 l2 4 M41 9 l-2 4 M32 5 V10', C.ink, 1.2, 'opacity="0.6"') +
      P(door, C.wood, 2.4) + S(pl, C.woodD, 1.4) + S('M22 60 V25 C22 19 25 15 29 13.5', '#94603a', 1.2) +
      rect(20, 22, 18, 4, C.iron, 1.4) + rect(20, 48, 18, 4, C.iron, 1.4) + circ(23, 24, 0.9, '#8a857e', 0) + circ(23, 50, 0.9, '#8a857e', 0) +
      circ(39, 38, 3.4, 'none', 0, `stroke="${C.ink}" stroke-width="3.6"`) + circ(39, 38, 3.4, 'none', 0, `stroke="${C.gold}" stroke-width="1.6"`) + circ(39, 34.5, 1.4, C.iron, 0.8) +
      F('M20 40 L44 30 V62 H20 Z', C.ink, 'opacity="0.18"') + rect(14, 60, 36, 4, '#5a534a', 1.6);
  };

  T.altar = () => {
    const id = 'altar';
    return `<defs>${radial(id + '-halo', [[0, '#ffe2a8', 0.7], [0.4, C.e2, 0.3], [1, C.gold, 0]])}</defs>` +
      ell(34, 55, 26, 6, C.ink, 0, 'opacity="0.4"') + circ(32, 18, 24, `url(#${id}-halo)`, 0) +
      rect(8, 36, 48, 20, '#4a433b', 2.4, 1.5) + S('M14 46 h8 M40 50 h8', C.ink, 1, 'opacity="0.5"') +
      rect(6, 26, 52, 12, '#6a6056', 2.4, 1.5) + S('M8 28 H56', '#8a7f71', 1.2) +
      // altar cloth with candle emblem
      P('M20 27 H44 V50 L38 47 L32 51 L26 47 L20 50 Z', C.p1, 2) + F('M36 27 H44 V50 L38 47 L36 48 Z', C.p2) + S('M20 27 H44 V50 L38 47 L32 51 L26 47 L20 50 Z', C.ink, 2) +
      S('M22.5 30 V46 M41.5 30 V46', C.gold, 1.2) + rect(30.5, 36, 3, 7, C.gold, 1) + P('M32 30.5 C33.6 32.4 33.8 33.6 32.8 34.6 C32.4 35 31.6 35 31.2 34.6 C30.2 33.6 30.4 32.4 32 30.5 Z', C.e1, 0.8) +
      // candle on a dish
      ell(32, 27, 6, 2.2, C.gold, 1.6) + rect(29, 13, 6, 14, '#efe4c8', 1.8, 1) + S('M30.4 15 V25', '#ffffff', 1, 'opacity="0.7"') + S('M34 15 V19 C34 20 33.4 21 33.4 22', C.p2, 1.2) +
      S('M32 13 V11', C.ink, 1.4) + P('M32 3 C35.2 6.4 36 8.6 34.2 10.8 C33.4 11.7 30.6 11.7 29.8 10.8 C28 8.6 28.8 6.4 32 3 Z', C.e1, 1.2) +
      F('M32 5.8 C33.4 7.6 33.8 8.8 33 10 C32.5 10.5 31.5 10.5 31 10 C30.2 8.8 30.6 7.6 32 5.8 Z', '#ffe2a8') +
      // small book
      P('M44 30 L54 28.5 L55 34 L45 35.5 Z', '#5a2a22', 1.4) + S('M45.5 33.6 L54 32.3', C.p1, 0.9);
  };

  return T;
};
