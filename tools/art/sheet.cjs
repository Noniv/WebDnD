// node sheet.js <folder> <scale> [bg]  -> writes sheet_<folder>.html next to this script
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', '..', 'public', 'art');
const [folder, scale = '2', bg = '#1a1614'] = process.argv.slice(2);
const files = fs.readdirSync(path.join(OUT, folder)).filter((f) => f.endsWith('.svg'));
let html = `<html><body style="margin:0;background:${bg};display:flex;flex-wrap:wrap;gap:6px;padding:6px">`;
for (const f of files) {
  const src = 'file:///' + path.join(OUT, folder, f).replace(/\\/g, '/');
  html += `<div style="display:flex;flex-direction:column;align-items:center"><img src="${src}" style="zoom:${scale};image-rendering:auto"></div>`;
}
if (folder === 'tiles') {
  for (const t of ['floor_1', 'wall', 'crypt_floor']) {
    html += `<div style="width:192px;height:192px;background:url('file:///${OUT}/tiles/${t}.svg');background-size:64px 64px"></div>`;
  }
  const mix = ['floor_1', 'floor_2', 'floor_3', 'floor_2', 'rubble', 'floor_1', 'floor_3', 'floor_1', 'floor_2'];
  html += `<div style="display:grid;grid-template-columns:repeat(3,64px)">${mix.map((t) => `<img src="file:///${OUT}/tiles/${t}.svg">`).join('')}</div>`;
}
if (folder === 'tokens') {
  html += `<div style="display:flex;gap:4px;align-items:center">${files.map((f) => `<img src="file:///${OUT}/tokens/${f}" width="40" height="40">`).join('')}</div>`;
}
html += '</body></html>';
fs.writeFileSync(path.join(__dirname, `sheet_${folder}.html`), html);
