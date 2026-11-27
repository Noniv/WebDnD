const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', '..', 'public', 'art');
const C = {
  ink: '#14110f', s0: '#2a2520', s1: '#3a342e', s2: '#4a433b',
  p1: '#e9d8b4', p2: '#cdb98f', e1: '#e0782f', e2: '#f2a65a',
  blood: '#b3261e', verd: '#4f9d8a', poison: '#8fb339', arc: '#8a6bd1',
  gold: '#d8b24a', steel: '#4a7bb0', skin: '#d9a77c', skinD: '#b07f5a',
  bone: '#d9cfb4', boneD: '#a89c80', wood: '#7a4a2a', woodD: '#55331d', iron: '#5e5a55',
};
const r1 = (n) => Math.round(n * 10) / 10;
function svg(w, h, body) {
  body = body.replace(/ stroke-linecap="round"/g, '').replace(/ stroke-linejoin="round"/g, '');
  const m = body.match(/^<defs>[\s\S]*?<\/defs>/);
  const defs = m ? m[0] : '';
  body = `${defs}<g stroke-linecap="round" stroke-linejoin="round">${body.slice(defs.length)}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${body}\n</svg>\n`;
}
const written = [];
function write(rel, content) {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content.replace(/\n\s*\n/g, '\n'));
  written.push(rel);
}
function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
// filled shape with ink outline
function P(d, fill, sw = 3, extra = '') {
  return `<path d="${d}" fill="${fill}" stroke="${C.ink}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"${extra ? ' ' + extra : ''}/>`;
}
// plain fill, no stroke
function F(d, fill, extra = '') {
  return `<path d="${d}" fill="${fill}"${extra ? ' ' + extra : ''}/>`;
}
// stroke only
function S(d, col, w, extra = '') {
  return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra ? ' ' + extra : ''}/>`;
}
// inked line: ink underlay + colored line
function L(d, w = 4, col = C.p1, ow = 3) {
  return S(d, C.ink, w + ow * 2) + S(d, col, w);
}
function circ(cx, cy, r, fill, sw = 3, extra = '') {
  const st = sw ? ` stroke="${C.ink}" stroke-width="${sw}"` : '';
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${st}${extra ? ' ' + extra : ''}/>`;
}
function ell(cx, cy, rx, ry, fill, sw = 3, extra = '') {
  const st = sw ? ` stroke="${C.ink}" stroke-width="${sw}"` : '';
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${st}${extra ? ' ' + extra : ''}/>`;
}
function rect(x, y, w, h, fill, sw = 0, rx = 0, extra = '') {
  const st = sw ? ` stroke="${C.ink}" stroke-width="${sw}" stroke-linejoin="round"` : '';
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}"${rx ? ` rx="${rx}"` : ''} fill="${fill}"${st}${extra ? ' ' + extra : ''}/>`;
}
function radial(id, stops, extra = '') {
  return `<radialGradient id="${id}"${extra ? ' ' + extra : ''}>${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</radialGradient>`;
}
function linear(id, stops, extra = '') {
  return `<linearGradient id="${id}"${extra ? ' ' + extra : ''}>${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</linearGradient>`;
}
function blur(id, sd) {
  return `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}"/></filter>`;
}
// regular polygon / star points
function star(cx, cy, n, ro, ri, rot = -90) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro;
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    pts.push(`${r1(cx + r * Math.cos(a))} ${r1(cy + r * Math.sin(a))}`);
  }
  return 'M' + pts.join(' L') + ' Z';
}
// sun rays as separate triangles path
function rays(cx, cy, n, r0, r1_, half, rot = -90) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = ((rot + (i * 360) / n) * Math.PI) / 180;
    const ap = half * Math.PI / 180;
    const p = (r, aa) => `${r1(cx + r * Math.cos(aa))} ${r1(cy + r * Math.sin(aa))}`;
    d += `M${p(r0, a - ap)} L${p(r1_, a)} L${p(r0, a + ap)} Z `;
  }
  return d.trim();
}
module.exports = { fs, path, OUT, C, r1, svg, write, written, rng, P, F, S, L, circ, ell, rect, radial, linear, blur, star, rays };
