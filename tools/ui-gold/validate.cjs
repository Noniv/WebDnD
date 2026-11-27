const fs=require('fs'),path=require('path');const D=path.join(__dirname,'..','..','public','art','ui','gold');
const want={frame:[192,192],frame_slim:[96,96],frame_arch:[192,256],divider:[360,28],divider_small:[160,16],corner:[64,64],medallion:[128,128],crest:[420,120],button:[240,56],bar_frame:[200,24],bg_stars:[512,512],circle_sigil:[512,512]};
const allowed=new Set(['svg','defs','g','path','circle','ellipse','rect','line','polygon','polyline','linearGradient','radialGradient','stop','filter','feGaussianBlur','feColorMatrix','feMerge','feMergeNode']);
let ok=true;const allIds=new Set();
for(const [name,[w,h]] of Object.entries(want)){
  const s=fs.readFileSync(path.join(D,name+'.svg'),'utf8');const errs=[];
  if(s.length>=14*1024)errs.push('size '+s.length);
  const m=s.match(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)">/);
  if(!m||+m[1]!==w||+m[2]!==h||+m[3]!==w||+m[4]!==h)errs.push('header');
  // simple XML well-formedness: tag stack
  const st=[];for(const t of s.matchAll(/<(\/?)([A-Za-z]+)([^>]*?)(\/?)>/g)){const [,c,tag,attrs,self]=t;
    if(!allowed.has(tag))errs.push('tag '+tag);
    if(/\b(class|style|href|xlink:href)=/.test(attrs))errs.push('attr in '+tag);
    if(c){if(st.pop()!==tag)errs.push('mismatch '+tag)}else if(!self)st.push(tag);}
  if(st.length)errs.push('unclosed '+st);
  const ids=[...s.matchAll(/ id="([^"]+)"/g)].map(x=>x[1]);
  for(const id of ids){if(!id.startsWith(name+'-'))errs.push('id prefix '+id);if(allIds.has(id))errs.push('dup id '+id);allIds.add(id);}
  for(const r of s.matchAll(/url\(#([^)]+)\)/g))if(!ids.includes(r[1]))errs.push('bad ref '+r[1]);
  if(/NaN|undefined/.test(s))errs.push('NaN');
  console.log(name.padEnd(14),(s.length/1024).toFixed(1)+'KB',errs.length?'FAIL '+[...new Set(errs)].join('; '):'ok');if(errs.length)ok=false;
}
console.log(ok?'ALL OK':'ERRORS');
