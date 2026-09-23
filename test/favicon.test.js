/* Favicons — one per page, so four open tools don't look identical in the tab bar.
 *
 * Each icon is an inline SVG data: URI in the page's <head>. Every tool is a single file that also
 * gets opened from Drive or a local copy, so the icon must travel inside it rather than be a
 * separate file. data: images are already allowed by every page's CSP (img-src 'self' data:).
 *
 * Run:  node test/favicon.test.js
 */
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..');
let pass=0,fail=0; const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL: '+n+(d?'   ['+d+']':'')));};

const PAGES=['index.html','character-builder-2.html','journal.html','compendium-and-bestiary.html',
             'encounter-control.html','dm-loom.html','legal.html'];
const seen={};

for(const f of PAGES){
  const html=fs.readFileSync(path.join(ROOT,f),'utf8');
  const head=html.slice(0, html.indexOf('</head>'));
  const links=[...head.matchAll(/<link rel="icon"[^>]*>/g)].map(m=>m[0]);
  ok(f+': exactly one icon link, inside <head>', links.length===1, 'found '+links.length);
  if(links.length!==1) continue;
  const href=(links[0].match(/href="([^"]*)"/)||[])[1]||'';
  ok(f+': icon is an inline SVG (no request, travels with the file)', href.startsWith('data:image/svg+xml,'));
  const svg=decodeURIComponent(href.slice('data:image/svg+xml,'.length));
  ok(f+': icon decodes to one complete <svg>', /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svg.replace(/'/g,'"')) && svg.trim().endsWith('</svg>'));
  ok(f+': icon carries no script or external reference',
     !/<script|on[a-z]+=|href=|url\(/i.test(svg), svg.slice(0,60));
  const csp=(head.match(/Content-Security-Policy" content="([^"]*)"/)||[])[1]||'';
  ok(f+': the page CSP allows data: images', /img-src[^;]*\bdata:/.test(csp), csp.slice(0,60));
  seen[href]=(seen[href]||[]).concat(f);
}
const dupes=Object.values(seen).filter(v=>v.length>1);
ok('every page has its own icon', dupes.length===0, dupes.map(v=>v.join(' = ')).join('; '));

console.log('\n'+(fail?'FAILED':'ALL PASS')+'  —  '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
