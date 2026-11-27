// Character figures drawn in a 128x128 token space (bust centered at x=64).
// Each returns { defs, clip, over }: `clip` is clipped to the token disc, `over` may break it.
const { C, r1, P, F, S, L, circ, ell, rect, radial, blur, star, rays } = require('./common.cjs');
const MIR = 'transform="matrix(-1 0 0 1 128 0)"';
const shade = (d, op = 0.22) => F(d, C.ink, `opacity="${op}"`);

function fighter(id, O, pt) {
  const o2 = O * 0.75, o3 = O * 0.5;
  const helm = 'M41 82 C38 56 45 30 64 28 C83 30 90 56 87 82 C80 88 48 88 41 82 Z';
  let clip = P('M10 130 C12 102 32 90 64 90 C96 90 116 102 118 130 Z', '#5d6b7a', O) +
    S('M40 102 C46 97 54 95 60 95', '#9aa7b4', 2.5) +
    P('M50 96 L78 96 L76 130 L52 130 Z', C.steel, o2) + S('M53 99 L55 128', '#7aa3d0', 1.6) +
    L('M93 70 L112 79', 3, '#8a98a6', 1.6) + L('M103 75 L108 63', 3.4, '#5a3d28', 1.6) + circ(109, 60, 3.5, C.gold, o3) +
    P('M84 84 C98 82 112 90 114 104 C108 110 96 110 88 106 C82 100 80 92 84 84 Z', '#8d9bab', O) +
    S('M88 97 C96 101 104 101 112 99', C.ink, o3) + S('M88 88 C96 86 104 89 109 94', '#c5cfd8', 1.8) +
    P('M48 84 C56 90 72 90 80 84 L80 93 C72 98 56 98 48 93 Z', '#7d8c9c', o2) +
    circ(26, 106, 30, C.steel, O) + circ(26, 106, 25, 'none', 0, `stroke="#9aa7b4" stroke-width="3.2"`) +
    S('M8 96 C12 86 20 80 30 79', '#9cc0e6', 2.5, 'opacity="0.8"') + shade('M48 96 A30 30 0 0 1 26 136 L26 106 Z', 0.25) +
    circ(26, 106, 7, '#9aa7b4', o2) + circ(24.5, 104.5, 2.2, '#e1e7ec', 0);
  if (pt) clip += S('M92 112 l6 -6 M96 116 l8 -8 M100 120 l10 -10 M66 104 l6 -6 M68 112 l6 -6', C.ink, 1, 'opacity="0.35"');
  let over = P('M66 31 C70 20 80 16 91 20 C85 22 79 26 75 35 Z', C.steel, o2) +
    P(helm, '#9aa7b4', O) + shade('M64 28 C83 30 90 56 87 82 C80 88 70 88 64 87 Z') + S(helm, C.ink, O) +
    S('M48 46 C49 38 54 33 60 31', '#e1e7ec', 2.5) + S('M64 30 V52', C.ink, o3) +
    S('M47 58 H81', C.ink, 6) + S('M64 58 V77', C.ink, 4.5) +
    circ(55, 70, 1.4, C.ink, 0) + circ(58.5, 74, 1.4, C.ink, 0) + circ(69.5, 74, 1.4, C.ink, 0) + circ(73, 70, 1.4, C.ink, 0) +
    circ(45, 76, 1.6, '#d5dde4', 0) + circ(83, 76, 1.6, '#d5dde4', 0) +
    circ(56, 58, 1.3, C.p1, 0) + circ(72, 58, 1.3, C.p1, 0);
  if (pt) over += S('M78 40 l4 -3 M80 48 l5 -3 M81 56 l5 -3 M82 66 l4 -2', C.ink, 0.9, 'opacity="0.4"');
  return { defs: '', clip, over };
}

function rogue(id, O, pt) {
  const o2 = O * 0.75, o3 = O * 0.5;
  const hood = 'M32 94 C28 64 38 36 58 22 C61 20 67 20 70 22 C90 36 100 64 96 94 C84 100 44 100 32 94 Z';
  let clip = P('M8 130 C12 100 34 88 64 88 C94 88 116 100 120 130 Z', '#34433f', O) +
    S('M40 104 C44 114 44 122 42 130 M88 104 C86 114 87 122 89 130', C.ink, o3, 'opacity="0.7"') +
    S('M18 116 C22 106 30 98 40 95', '#577069', 2.4) +
    L('M34 98 L84 132', 4, '#5a3d28', 1.5) + rect(52, 106, 7, 7, C.gold, 1.5, 1, 'transform="rotate(34 55.5 109.5)"');
  let over = P(hood, '#4a5e58', O) + shade('M64 21 C90 36 100 64 96 94 C86 98 74 99 64 99 Z') + S(hood, C.ink, O) +
    S('M38 80 C38 60 46 42 58 28', '#7a978e', 2.5) + S('M60 23 C62 30 63 38 64 44', C.ink, o3, 'opacity="0.6"') +
    P('M45 84 C43 64 51 46 64 44 C77 46 85 64 83 84 C76 90 52 90 45 84 Z', C.ink, o3);
  if (pt) {
    over += F('M50 60 C56 56 72 56 78 60 L80 74 L48 74 Z', '#7e5a43') + F('M50 60 C56 56 72 56 78 60 L78 64 C70 61 58 61 50 64 Z', C.ink, 'opacity="0.5"') +
      P('M52 66 C54 63.5 58 63.5 60 66 C58 67.5 54 67.5 52 66 Z', C.p1, 1.2) + P('M68 66 C70 63.5 74 63.5 76 66 C74 67.5 70 67.5 68 66 Z', C.p1, 1.2) +
      circ(57, 65.8, 1.3, C.ink, 0) + circ(73, 65.8, 1.3, C.ink, 0) + S('M51 61.5 L60 63 M68 63 L77 61.5', C.ink, 1.6) + S('M64 64 V71', '#5e412f', 1.2);
  } else {
    over += S('M52 64 L59 66 M69 66 L76 64', C.p1, 2.8);
  }
  over += P('M47 72 C56 76 72 76 81 72 L82 82 C74 89 54 89 46 82 Z', '#2c3936', o3) + S('M52 78 C60 80 68 80 76 78', '#4a5e58', 1.2);
  over += `<g transform="rotate(-18 96 72)">` + P('M96 30 L102 44 L101.5 70 L90.5 70 L90 44 Z', '#cfd6dc', o2) + S('M96 38 V67', '#8a98a6', 1.5) +
    S('M92 46 L91.5 66', '#f4f7f9', 1.2) + L('M84 72 H108', 3.5, '#b08a3a', 1.5) + rect(92, 74, 8, 14, '#5a3d28', o3) +
    circ(96, 91, 3.5, C.gold, o3) + ell(96, 80, 10, 7, '#3b2a1e', o2) + S('M90 77 V83 M95 76 V84 M100 77 V83', C.ink, 1.2) + `</g>`;
  return { defs: '', clip, over };
}

function wizard(id, O, pt) {
  const o2 = O * 0.75, o3 = O * 0.5;
  const defs = radial(`${id}-orb`, [[0, '#e3d6ff', 0.95], [0.35, C.arc, 0.6], [1, C.arc, 0]]);
  let clip = P('M8 130 C12 102 34 92 64 92 C94 92 116 102 120 130 Z', '#4b3a7a', O) +
    S('M20 114 C26 103 37 97 49 94', '#6f5aab', 3) + S('M84 98 C94 104 102 112 106 124', C.ink, o3, 'opacity="0.5"') +
    L('M46 94 L64 122 L82 94', 2.5, C.gold, 1.5) +
    L('M100 134 L99 46', 4.5, '#6a4a2e', 2) + ell(100, 98, 8, 7, C.skin, o2) + S('M95 96 h9 M95 100 h9', C.skinD, 1.2) +
    P('M48 72 C46 92 54 110 64 120 C74 110 82 92 80 72 Z', '#d8ccb0', o2) +
    S('M56 82 C57 93 60 102 63 110 M64 82 V114 M72 82 C71 93 68 102 65 110', '#a89c80', 1.5);
  let over = P('M50 56 C50 72 56 80 64 80 C72 80 78 72 78 56 Z', C.skin, o2) + F('M50 56 H78 V61 C70 63 58 63 50 61 Z', C.ink, 'opacity="0.35"') +
    S('M55 65 h4.5 M68.5 65 h4.5', C.ink, 2.4) + circ(57, 65, 0.9, '#d8c8ff', 0) + circ(71, 65, 0.9, '#d8c8ff', 0) +
    S('M64 63 C62 69 63 72 66 72', C.ink, 1.8) +
    P('M54 77 C58 72 63 73 64 75 C65 73 70 72 74 77 C70 79 66 78 64 77 C62 78 58 79 54 77 Z', '#ece4cf', 1.6);
  if (pt) over += S('M53 62 C55 60 58 60 61 61.5 M67 61.5 C70 60 73 60 75 62', '#ece4cf', 2.2) + S('M58 69 C59 70 60 70.5 61 70.5 M67 70.5 C68 70.5 69 70 70 69', C.skinD, 1);
  over += ell(64, 54, 37, 10, '#4a3880', O) + S('M30 54 C40 47 88 47 98 54', '#7a66b8', 2, 'opacity="0.8"') +
    P('M44 52 C48 38 55 27 62 19 C66 14 72 11 78 13 C73 16 71 21 72 27 C76 37 81 44 84 52 C72 56 56 56 44 52 Z', '#5b4592', O) +
    shade('M66 17 C72 13 76 12 78 13 C73 16 71 21 72 27 C76 37 81 44 84 52 C78 54 72 55 68 55 C70 44 68 30 66 17 Z') +
    P('M45 48 C57 52 71 52 83 48 L84 53 C72 57 56 57 44 53 Z', C.gold, o3) +
    S('M50 46 C53 37 57 30 62 23', '#8f78d6', 2.5) + P(star(58, 38, 4, 4.5, 1.3), '#c9b6f5', 1) +
    L('M93 48 C91 40 94 33 99 31 M105 48 C107 40 104 33 99 31', 1.8, '#6a4a2e', 1.2) +
    circ(99, 39, 17, `url(#${id}-orb)`, 0) + circ(99, 39, 6.5, '#c9b6f5', o2) + circ(97, 37, 2, '#ffffff', 0) +
    P(star(84, 26, 4, 3.5, 1), '#e3d6ff', 0.8) + P(star(112, 50, 4, 3, 0.9), '#e3d6ff', 0.8);
  return { defs, clip, over };
}

function cleric(id, O, pt) {
  const o2 = O * 0.75, o3 = O * 0.5;
  let chain = '';
  for (let y = 100; y < 130; y += 5) chain += `M${12 + ((y / 5) % 2) * 3} ${y}` + ' q3 3 6 0'.repeat(17) + ' ';
  let coifChain = '';
  for (let y = 40; y < 88; y += 5) coifChain += `M${40 + ((y / 5) % 2) * 3} ${y}` + ' q3 3 6 0'.repeat(8) + ' ';
  const coif = 'M40 86 C36 60 44 34 64 32 C84 34 92 60 88 86 C80 92 48 92 40 86 Z';
  const defs = `<clipPath id="${id}-coif"><path d="${coif}"/></clipPath>`;
  let clip = P('M8 130 C12 102 34 92 64 92 C94 92 116 102 120 130 Z', '#8a8f96', O) + S(chain, C.ink, 0.9, 'opacity="0.35"') +
    S('M20 112 C26 103 37 97 49 94', '#c3c8ce', 2.5) +
    P('M44 96 L84 96 L82 132 L46 132 Z', C.p1, o2) + F('M70 96 L84 96 L82 132 L72 132 Z', C.p2) + S('M44 96 L84 96 L82 132 L46 132', C.ink, o2) +
    S('M52 93 L64 101 L76 93', C.gold, 1.6) +
    P(rays(64, 107, 8, 7, 14.5, 13), C.gold, 1.4) + circ(64, 107, 7.5, C.gold, o3) + circ(64, 107, 3.6, '#f6e3a0', 0) +
    L('M100 134 L96 70', 4, '#6a4a2e', 1.8) + ell(99, 102, 8, 7, C.skin, o2) + S('M94 100 h9 M94 104 h9', C.skinD, 1.2);
  let over = P(coif, '#9aa0a8', O) + `<g clip-path="url(#${id}-coif)">${S(coifChain, C.ink, 0.9, 'opacity="0.3"')}${shade('M64 30 C84 34 92 60 88 86 C80 92 70 92 64 92 Z')}</g>` + S(coif, C.ink, O) +
    S('M44 70 C43 56 48 44 58 37', '#d6dbe0', 2.3) +
    P('M48 78 C48 60 54 50 64 50 C74 50 80 60 80 78 C76 86 52 86 48 78 Z', C.skin, o2) + F('M70 52 C76 56 80 64 80 78 C78 81 74 83 70 84 Z', C.skinD, 'opacity="0.45"') +
    L('M43 51 C55 44 73 44 85 51', 2.5, C.gold, 1.5) + circ(64, 46, 2.6, '#f6e3a0', 1.4) +
    S('M54 64 C56 62.5 58.5 62.5 60 64 M68 64 C69.5 62.5 72 62.5 74 64', C.ink, 2) +
    S('M53 59.5 C55.5 58 58.5 58 60.5 59 M67.5 59 C69.5 58 72.5 58 75 59.5', '#7a5236', 1.6) +
    S('M64 63 C63 68 63 70 65.5 70.5', C.skinD, 1.6) + S('M59.5 75 C62 77.5 66 77.5 68.5 75', C.ink, 1.8);
  if (pt) over += circ(56, 70, 3, '#e08f7a', 0, 'opacity="0.35"') + circ(72, 70, 3, '#e08f7a', 0, 'opacity="0.35"');
  over += P(star(96, 60, 6, 13, 7.5), '#8a98a6', o2) + circ(96, 60, 7, '#aab4bf', o3) + S('M91 56 C92 54 94 53 96 53', '#e1e7ec', 1.6);
  return { defs, clip, over };
}

function goblinHead(O, opts = {}) {
  const o2 = O * 0.75, o3 = O * 0.5;
  const skin = '#7d8f3e';
  const ear = P('M46 58 C34 52 24 48 15 46 C21 56 31 68 46 72 Z', skin, o2) + F('M42 60.5 C35 56.5 28 53.5 22 51.5 C26 57 33 63.5 42 67 Z', '#9c5b45', 'opacity="0.75"');
  const head = 'M44 56 C44 40 54 32 64 32 C74 32 84 40 84 56 C86 70 78 86 64 86 C50 86 42 70 44 56 Z';
  let o = ear + `<g ${MIR}>${ear}</g>`;
  if (opts.earring) o += circ(110, 51, 3, 'none', 0, `stroke="${C.ink}" stroke-width="3.4"`) + circ(110, 51, 3, 'none', 0, `stroke="${C.gold}" stroke-width="1.6"`);
  o += P(head, skin, O) + shade('M64 32 C74 32 84 40 84 56 C86 70 78 86 64 86 Z', 0.2) + S(head, C.ink, O) +
    S('M49 48 C51 41 56 36 62 35', '#a8b860', 2.2);
  const by = opts.helm ? 4 : 0;
  if (opts.nervous) {
    o += S(`M48 ${54 + by} C52 ${50 + by} 57 ${51 + by} 60 ${54 + by} M80 ${55 + by} L68 ${58 + by}`, C.ink, 3.2);
    o += ell(56, 62, 4.8, 3.6, '#e8c547', 1.5) + ell(72, 62, 4.8, 3.6, '#e8c547', 1.5) + circ(53.6, 61.6, 1.7, C.ink, 0) + circ(69.6, 61.6, 1.7, C.ink, 0);
    o += P('M84 44 C86 47 87 49 85.5 50.5 C84.5 51.5 83 51 82.6 49.6 C82.3 48 83 46 84 44 Z', '#dff1f6', 1.1);
  } else {
    o += S(`M48 ${53 + by} L60 ${58 + by} M80 ${53 + by} L68 ${58 + by}`, C.ink, 3.5);
    o += ell(56, 62, 4.5, 3.2, '#e8c547', 1.5) + ell(72, 62, 4.5, 3.2, '#e8c547', 1.5) + rect(55.2, 59.6, 1.6, 4.8, C.ink, 0, 0.8) + rect(71.2, 59.6, 1.6, 4.8, C.ink, 0, 0.8);
  }
  o += S('M63 63 C60 68 61 72 65 72 C66.5 71.5 67 70 66 68.5', C.ink, 1.8);
  o += S('M51 75 C57 81 71 81 77 75', C.ink, 2.6) + P('M55 77 L57 82 L59 78 Z', C.p1, 1.1) + P('M69 78 L71 82 L73 77 Z', C.p1, 1.1);
  if (opts.goldTooth) o += P('M62 79.2 L63.5 82 L65 79.4 Z', C.gold, 1);
  return o;
}
function goblinBlade(O, gold) {
  const o2 = O * 0.75, o3 = O * 0.5;
  return P('M88 104 L97 60 C100 54 108 51 113 55 L110 64 L106 62 L103 76 L99 104 Z', '#9a968a', o2) +
    S('M98 62 C100 57 106 54 110 55', '#d6d2c4', 1.5) + circ(101, 70, 2, '#8a5a3a', 0) + circ(99, 84, 2.6, '#8a5a3a', 0) + circ(104, 61, 1.4, '#8a5a3a', 0) +
    rect(88, 104, 12, 14, gold ? '#6b4a20' : '#4a3020', o3) + (gold ? rect(84, 101, 20, 4, C.gold, o3, 1) : '') +
    ell(93, 106, 9, 7, '#7d8f3e', o2) + S('M88 104 v5 M93 103 v6', C.ink, 1.1);
}
function goblin(id, O) {
  const o2 = O * 0.75, o3 = O * 0.5;
  const clip = P('M14 130 C18 104 38 94 64 94 C90 94 110 104 114 130 Z', '#5a3d28', O) +
    S('M24 116 C28 106 36 100 46 98', '#7d5a3c', 2.4) +
    P('M40 98 L46 106 L52 99 L58 108 L64 100 L70 108 L76 99 L82 106 L88 98 C80 94 48 94 40 98 Z', '#6e4c30', o3) +
    L('M30 104 L48 128', 2, '#3a2618', 1) + goblinBlade(O, false);
  return { defs: '', clip, over: goblinHead(O) };
}
function goblinBossFig(id, O, pt) {
  const o2 = O * 0.75, o3 = O * 0.5;
  let fur = '';
  for (let x = 38; x <= 90; x += 5) fur += `M${x} 97 l1.5 -4 `;
  const clip = P('M2 132 L4 104 L10 108 L12 94 L20 98 L26 86 L36 92 L64 88 L92 92 L102 86 L108 98 L116 94 L118 108 L124 104 L126 132 Z', '#5c2a22', O) +
    S('M14 120 L18 104 M110 120 L106 104', C.ink, o3, 'opacity="0.6"') +
    P('M18 132 C22 108 40 98 64 98 C88 98 106 108 110 132 Z', '#5a3d28', o2) +
    P('M32 98 C38 89 51 90 56 94 C60 88 68 88 72 94 C77 90 90 89 96 98 C88 106 40 106 32 98 Z', '#7a6a58', o2) + S(fur, '#4a3f33', 1.2) +
    circ(64, 104, 4, C.gold, o3) + goblinBlade(O, true);
  const horn = P('M48 40 C39 36 32 29 30 16 C37 21 44 26 53 33 Z', C.bone, o2) + S('M36 27 l3 -2.5 M40 31 l3 -2.5 M44 34 l2.5 -2', C.boneD, 1.4);
  let over = goblinHead(O, { helm: true, earring: true, nervous: pt, goldTooth: true }) +
    horn + `<g ${MIR}>${horn}</g>` +
    P('M43 54 C43 36 53 27 64 27 C75 27 85 36 85 54 C72 49 56 49 43 54 Z', '#6b6660', O) + shade('M64 27 C75 27 85 36 85 54 C78 52 70 51 64 51 Z', 0.25) +
    S('M48 46 C50 37 56 32 62 31', '#9a948b', 2) +
    P('M42 54 C56 48 72 48 86 54 L86 59 C72 53 56 53 42 59 Z', '#55504b', o3) +
    circ(50, 54, 1.3, '#bdb6aa', 0) + circ(64, 51.5, 1.3, '#bdb6aa', 0) + circ(78, 54, 1.3, '#bdb6aa', 0) + S('M64 28 V48', C.ink, o3);
  return { defs: '', clip, over };
}

function skeleton(id, O) {
  const o2 = O * 0.75, o3 = O * 0.5, B = C.bone;
  let ribs = '';
  for (const y of [98, 106, 114, 122]) {
    const d = `M64 ${y} C56 ${y - 3} 46 ${y} 41 ${y + 8}`;
    ribs += L(d, 3, B, 1.6) + `<g ${MIR}>${L(d, 3, B, 1.6)}</g>`;
  }
  const clav = L('M64 92 C52 89 40 91 28 98', 3.4, B, 1.8) + L('M24 104 L16 132', 5, B, 1.8) + circ(26, 99, 7, B, o2);
  const clip = P('M10 132 C14 110 26 100 40 97 L46 104 L52 99 L58 106 L64 99 L70 106 L76 99 L82 104 L88 97 C102 100 114 110 118 132 Z', '#2f2a26', o2) +
    L('M64 86 V132', 4, B, 1.8) + S('M61 96 h6 M61 104 h6 M61 112 h6 M61 120 h6', C.ink, 1.2) + ribs + clav + `<g ${MIR}>${clav}</g>` +
    `<g transform="translate(100 80) rotate(12)">` + P('M0 -44 L6 -34 L5 22 L-5 22 L-6 -34 Z', '#8c7a68', o2) +
    F('M-6 -20 L-3 -18 L-6 -15 Z M6 -4 L3 -2 L5 2 Z', C.ink) + circ(1, -10, 2.6, '#8a4f2c', 0) + circ(-2, 6, 3.2, '#8a4f2c', 0) + circ(2, -28, 1.8, '#8a4f2c', 0) +
    S('M0 -36 V18', '#5e4f42', 1.3) + L('M-13 25 H13', 3.4, '#6a4a32', 1.4) + rect(-3.5, 27, 7, 14, '#4a3526', o3) +
    `</g>` + ell(99, 108, 8, 6.5, B, o2) + S('M93 106 h12 M93 110 h12', C.boneD, 1.2);
  const skull = 'M44 54 C44 36 52 26 64 26 C76 26 84 36 84 54 C84 62 81 66 79 70 L77 74 L51 74 L49 70 C47 66 44 62 44 54 Z';
  const over = P('M51 70 L77 70 L76 80 C70 85 58 85 52 80 Z', '#c9bea2', o2) + S('M56 72 V81 M60 72 V83 M64 72 V84 M68 72 V83 M72 72 V81', C.ink, 1.2) +
    P(skull, B, O) + shade('M64 26 C76 26 84 36 84 54 C84 62 81 66 79 70 L77 74 L64 74 Z', 0.2) + S(skull, C.ink, O) +
    S('M48 48 C50 38 56 31 62 30', '#f3ecd8', 2.4) + S('M71 28 L69 36 L73 40 L71 44', C.ink, 1.5) +
    ell(55, 56, 6, 7, C.ink, 0) + ell(73, 56, 6, 7, C.ink, 0) + circ(56, 57, 1.7, C.blood, 0) + circ(72, 57, 1.7, C.blood, 0) +
    F('M64 62 L60.5 68.5 H67.5 Z', C.ink) + S('M52 72 H76', C.ink, 1.6) + S('M53 73.5 V77 M58 73.5 V77.5 M64 73.5 V78 M70 73.5 V77.5 M75 73.5 V77', C.ink, 1.1);
  return { defs: '', clip, over };
}

function ashWarden(id, O, pt) {
  const o2 = O * 0.75, o3 = O * 0.5;
  const defs = blur(`${id}-glow`, 2.4) + blur(`${id}-soft`, 1.2);
  const tongue = (x, y, h, w) => `M${x - w} ${y} C${x - w} ${r1(y - h * 0.5)} ${r1(x - w * 0.3)} ${r1(y - h * 0.6)} ${x} ${y - h} C${r1(x + w * 0.4)} ${r1(y - h * 0.6)} ${x + w} ${r1(y - h * 0.5)} ${x + w} ${y} Z`;
  const T = [[44, 26, 15, 6.5], [56, 20, 17, 7], [64, 30, 22, 7.5], [72, 20, 17, 7], [84, 26, 15, 6.5]];
  const flames = T.map(([x, y, h, w]) => tongue(x, y, h, w)).join(' ');
  const inner = T.map(([x, y, h, w]) => tongue(x, y, h * 0.6, w * 0.5)).join(' ');
  const crack = 'M60 102 L66 110 L61 118 L68 126 L66 132';
  const clip = P('M8 132 C12 104 34 94 64 94 C94 94 116 104 120 132 Z', '#262120', O) +
    S('M22 116 C28 106 38 100 50 97', '#4a433b', 2.4) +
    P('M48 98 L80 98 L82 128 L77 124 L73 132 L68 126 L63 132 L58 125 L53 132 L49 126 L46 130 Z', '#3a342e', o2) +
    S(crack, C.e1, 3.5, `filter="url(#${id}-glow)"`) + S(crack, C.e2, 1.4) + S('M30 112 L36 118 L34 124', C.e1, 1.3, 'opacity="0.85"');
  const pauld = P('M5 100 C5 82 22 72 44 76 C52 86 50 100 42 108 C30 114 12 112 5 100 Z', '#241f1c', O) +
    P('M15 84 L5 66 L26 77 Z', '#3a342e', o2) + P('M30 77 L29 58 L40 75 Z', '#3a342e', o2) +
    S('M10 94 C14 85 24 79 37 79', '#4f4740', 2.5) + S('M8 101 C14 108 30 110 41 105', C.e1, 1.2, 'opacity="0.8"') +
    circ(20, 96, 1.6, '#5f564c', 0) + circ(34, 98, 1.6, '#5f564c', 0);
  const helm = 'M40 92 L38 50 C38 34 50 28 64 28 C78 28 90 34 90 50 L88 92 C78 98 50 98 40 92 Z';
  let over = pauld + `<g ${MIR}>${pauld}</g>` +
    F(flames, C.arc, `opacity="0.8" filter="url(#${id}-glow)"`) + P(flames, C.arc, o3) + F(inner, '#d9caff') +
    P(helm, '#241f1c', O) + shade('M64 28 C78 28 90 34 90 50 L88 92 C80 96 72 97 64 97 Z', 0.3) + S(helm, C.ink, O) +
    S('M44 80 L42 50 C42 40 50 33 60 32', '#4a433b', 2.5) + S('M64 64 V94', '#3a342e', 2) +
    S('M44 60 H84', C.ink, 8) +
    ell(55, 60, 6.5, 3.2, C.e1, 0, `filter="url(#${id}-glow)"`) + ell(73, 60, 6.5, 3.2, C.e1, 0, `filter="url(#${id}-glow)"`) +
    ell(55, 60, 4.5, 1.7, '#ffd9a0', 0) + ell(73, 60, 4.5, 1.7, '#ffd9a0', 0) +
    S('M53 72 v11 M58.5 74 v11 M64 75 v11 M69.5 74 v11 M75 72 v11', C.ink, 2.8) + S('M58.5 76 v7 M64 77 v7 M69.5 76 v7', C.e1, 1, 'opacity="0.75"') +
    S('M81 37 L77 45 L81 51 L79 56', C.e1, 1.4) +
    P('M38 44 L42 26 L49 35 L56 18 L64 30 L72 18 L79 35 L86 26 L90 44 C74 39 54 39 38 44 Z', '#3a342e', o2) +
    S('M41 41 C56 37 72 37 87 41', '#5f564c', 1.4) + circ(64, 37, 2.6, C.arc, 1.2) +
    S('M45 30 l1 4 M86 32 l-1 4', C.e2, 1.2, 'opacity="0.8"');
  if (pt) over += S('M86 66 l4 -3 M86 74 l4 -3 M86 82 l4 -3', C.ink, 1, 'opacity="0.5"');
  return { defs, clip, over };
}

module.exports = { fighter, rogue, wizard, cleric, goblin, goblin_boss: goblinBossFig, skeleton, ash_warden: ashWarden };
