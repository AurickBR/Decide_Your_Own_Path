/* Campaign navigation — the menu that sits in every tool.
 *
 * Two things this suite exists to stop:
 *
 *  1. A renamed file leaving a dead link behind in five places at once. The menu is generated from
 *     index.html's FILES map by tools/build_nav.py, and the block below asserts every file the menu
 *     names actually exists in the repository — the check HOSTING_AND_DEPLOYMENT.md §6 says was
 *     missing the last time a rename produced live 404s.
 *
 *  2. The five copies drifting apart. They are byte-identical except for the one line naming the
 *     page they sit in, and that is asserted rather than trusted.
 *
 * Run:  npm install   (once)
 *       node test/nav.test.js
 */
const fs=require('fs'), path=require('path'), {execFileSync}=require('child_process');
const {JSDOM,VirtualConsole}=require('jsdom');
const ROOT=path.join(__dirname,'..');
let pass=0,fail=0; const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL: '+n+(d?'   ['+d+']':'')));};

const PAGES=['character-builder-2.html','journal.html','compendium-and-bestiary.html',
             'encounter-control.html','dm-loom.html','legal.html'];
const OPEN='<!-- DYOP-NAV start', CLOSE='<!-- DYOP-NAV end -->';
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
function blockOf(html){
  const a=html.indexOf(OPEN); if(a<0) return null;
  const b=html.indexOf(CLOSE,a); if(b<0) return null;
  return html.slice(a,b+CLOSE.length);
}

console.log('THE BLOCK IS PRESENT, ONCE, EVERYWHERE');
const blocks={};
for(const p of PAGES){
  const html=read(p);
  const n=html.split(OPEN).length-1;
  ok(p+' carries exactly one nav block', n===1, 'found '+n);
  blocks[p]=blockOf(html);
  ok(p+' block is closed', blocks[p]!==null);
}
ok('index.html carries none — it IS the navigation', !read('index.html').includes(OPEN));

console.log('THE FIVE COPIES CANNOT DRIFT');
const norm=s=>s.replace(/var HERE\s+= "[^"]+";/,'var HERE = "<page>";');
const ref=norm(blocks[PAGES[0]]);
for(const p of PAGES.slice(1))
  ok(p+' is byte-identical to the builder\'s copy apart from HERE', norm(blocks[p])===ref);
for(const p of PAGES){
  const m=blocks[p].match(/var HERE\s+= "([^"]+)";/);
  ok(p+' names itself in HERE', m && m[1]===p, m && m[1]);
}
ok('the stamp still comes after the menu', PAGES.every(p=>{
  const h=read(p); return h.indexOf(OPEN) < h.indexOf('<!-- build stamp');
}));

console.log('EVERY LINK THE MENU OFFERS RESOLVES');
const idx=read('index.html');
const BASE=idx.match(/const\s+BASE\s*=\s*"([^"]+)"/)[1];
const FILES=Object.fromEntries([...idx.match(/const\s+FILES\s*=\s*\{([\s\S]*?)\}/)[1]
              .matchAll(/(\w+)\s*:\s*"([^"]+)"/g)].map(m=>[m[1],m[2]]));
const tools=JSON.parse(blocks[PAGES[0]].match(/var TOOLS\s+= (\[[\s\S]*?\]);/)[1]);
ok('the menu lists five tools', tools.length===5, tools.length);
for(const t of tools){
  ok('menu file for '+t.key+' matches index.html', t.file===FILES[t.key], t.file+' vs '+FILES[t.key]);
  ok(t.file+' exists in the repo', fs.existsSync(path.join(ROOT,t.file)));
}
ok('the menu uses the same BASE as the hub',
   blocks[PAGES[0]].includes('var BASE     = "'+BASE+'"'));
ok('every extra chip points somewhere real', JSON.parse(
     blocks[PAGES[0]].match(/var EXTRAS\s+= (\[[\s\S]*?\]);/)[1])
   .filter(e=>e.href.startsWith(BASE))
   .every(e=>fs.existsSync(path.join(ROOT,e.href.slice(BASE.length)))));

console.log('EVERY LINK ON THE SITE, NOT JUST THE GENERATED ONES');
{
  /* The menu is generated and therefore follows a rename. Hand-written links do not, and two of
     them (the builder's masthead Journal button and the journal's Builder button) survived the
     menu until 2026-09-19 as exactly that hazard: hardcoded absolute URLs pointing at files whose
     names live in index.html. They are gone, and this block makes sure nothing like them creeps
     back in — it walks EVERY absolute site link in EVERY page, generated or not. */
  const ALL=PAGES.concat(['index.html']);
  let checked=0;
  for(const p of ALL){
    const html=read(p);
    const links=[...html.matchAll(new RegExp(BASE.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^"\'\\s>]*)','g'))]
                  .map(m=>m[1]).filter(u=>!u.startsWith('#'));
    for(const u of links){
      const file=u.split('#')[0].split('?')[0];
      checked++;
      if(file==='') continue;                       /* the bare site root */
      ok(p+' links to a file that exists: '+file, fs.existsSync(path.join(ROOT,file)));
    }
  }
  ok('the sweep actually found links to check', checked>=10, checked);
  ok('no page still hardcodes a cross-link outside the menu', PAGES.concat(['index.html']).every(p=>{
    const html=read(p), i=html.indexOf(OPEN);
    const own = i>-1 ? html.slice(0,i)+html.slice(html.indexOf(CLOSE,i)+CLOSE.length) : html;
    /* legal.html and the site root are structural names that will never move; a link to any
       OTHER tool from outside the generated block is the drift hazard. */
    return !/aurickbr\.github\.io\/Decide_Your_Own_Path\/(character-builder-2|journal|compendium-and-bestiary|encounter-control|dm-loom)\.html/.test(own);
  }));
}

console.log('THE GENERATOR AGREES WITH WHAT IS ON DISK');
let checkOk=true, checkOut='';
try{ execFileSync('python3',[path.join(ROOT,'tools','build_nav.py'),'--check'],{encoding:'utf8'}); }
catch(e){ checkOk=false; checkOut=(e.stdout||'')+(e.stderr||''); }
ok('tools/build_nav.py --check passes', checkOk, checkOut.trim().split('\n').pop());

/* ---------------------------------------------------------------- behaviour */
function boot(f,view){
  const vc=new VirtualConsole(); const errs=[]; vc.on('jsdomError',e=>errs.push(e.message));
  const dom=new JSDOM(read(f),{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
    url:'https://aurickbr.github.io/Decide_Your_Own_Path/'+f,
    beforeParse(w){ if(view) try{ w.localStorage.setItem('dyop_view',view); }catch(e){} }});
  return {w:dom.window, errs, d:dom.window.document};
}

console.log('IT BUILDS, IN EVERY TOOL');
const booted={};
for(const p of ['character-builder-2.html','journal.html','encounter-control.html','dm-loom.html']){
  const b=booted[p]=boot(p);
  ok(p+' boots clean', b.errs.length===0, b.errs[0]);
  ok(p+' has a launcher', !!b.d.querySelector('.dyop-nav-fab'));
  ok(p+' exposes __dyopNav', !!b.w.__dyopNav);
  ok(p+' knows which page it is', b.w.__dyopNav && b.w.__dyopNav.here===p, b.w.__dyopNav&&b.w.__dyopNav.here);
  ok(p+' starts closed', b.d.querySelector('.dyop-nav-panel').hidden===true);
  ok(p+' launcher reports collapsed', b.d.querySelector('.dyop-nav-fab').getAttribute('aria-expanded')==='false');
  ok(p+' adds no duplicate element ids', (()=>{
    const ids=[...b.d.querySelectorAll('[id]')].map(e=>e.id);
    return new Set(ids).size===ids.length;
  })());
}

console.log('OPENING AND CLOSING');
{
  const {w,d}=booted['character-builder-2.html'];
  const fab=d.querySelector('.dyop-nav-fab'), panel=d.querySelector('.dyop-nav-panel');
  fab.click();
  ok('click opens the panel', panel.hidden===false);
  ok('the scrim comes with it', d.querySelector('.dyop-nav-scrim').hidden===false);
  ok('the launcher reports expanded', fab.getAttribute('aria-expanded')==='true');
  ok('focus moves into the dialog', d.activeElement===panel);
  ok('it is a real dialog for a screen reader',
     panel.getAttribute('role')==='dialog' && panel.getAttribute('aria-modal')==='true');

  d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  ok('Escape closes it', panel.hidden===true);
  ok('focus returns to the launcher', d.activeElement===fab);

  fab.click();
  d.querySelector('.dyop-nav-scrim').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  ok('clicking the scrim closes it', panel.hidden===true);

  fab.click();
  d.querySelector('.dyop-nav-x').click();
  ok('the close button closes it', panel.hidden===true);

  fab.click(); fab.click();
  ok('the launcher toggles', panel.hidden===true);
}

console.log('WHAT A PLAYER SEES');
{
  const {d}=boot('character-builder-2.html','player');
  const items=d.querySelectorAll('.dyop-nav-item');
  ok('three tools, no DM section', items.length===3, items.length);
  ok('no DM heading', ![...d.querySelectorAll('.dyop-nav-sec')].some(s=>/DM/.test(s.textContent)));
  ok('Encounter Control is not offered',
     ![...items].some(i=>/Encounter/.test(i.textContent)));
  ok('the current tool is marked once',
     d.querySelectorAll('.dyop-nav-item[aria-current="page"]').length===1);
  ok('the current tool is not a link',
     d.querySelector('.dyop-nav-item[aria-current="page"]').tagName!=='A');
  ok('and it says so in words',
     /you are here/i.test(d.querySelector('.dyop-nav-item[aria-current="page"]').textContent));
  ok('the other two are links', d.querySelectorAll('a.dyop-nav-item').length===2);
}

console.log('WHAT THE DM SEES');
{
  const {d}=boot('character-builder-2.html','dm');
  ok('five tools once the DM view is set', d.querySelectorAll('.dyop-nav-item').length===5,
     d.querySelectorAll('.dyop-nav-item').length);
  ok('with a DM heading', [...d.querySelectorAll('.dyop-nav-sec')].some(s=>/DM/.test(s.textContent)));
}
{
  /* Someone already inside a DM tool is obviously the DM, whatever the portal toggle says. */
  const {d,w}=boot('encounter-control.html','player');
  ok('a DM tool shows the DM section even in player view',
     d.querySelectorAll('.dyop-nav-item').length===5, d.querySelectorAll('.dyop-nav-item').length);
  ok('and knows it', w.__dyopNav.dm===true);
  ok('the Fray marks itself as current',
     /Encounter/.test(d.querySelector('.dyop-nav-item[aria-current="page"]').textContent));
}

console.log('THE LINKS THEMSELVES');
{
  const {d}=boot('journal.html','dm');
  const links=[...d.querySelectorAll('a.dyop-nav-item')];
  ok('every tool link is absolute on BASE', links.every(a=>a.getAttribute('href').startsWith(BASE)));
  ok('every tool link names a file that exists',
     links.every(a=>fs.existsSync(path.join(ROOT,a.getAttribute('href').slice(BASE.length)))));
  ok('tool links open in the same tab — the tools autosave',
     links.every(a=>!a.hasAttribute('target')));
  ok('the portal chip is there', [...d.querySelectorAll('a.dyop-nav-chip')].some(a=>/Portal/.test(a.textContent)));
  ok('the Drive folder opens in a new tab and is noopener', (()=>{
    const a=[...d.querySelectorAll('a.dyop-nav-chip')].find(x=>/Shared folder/.test(x.textContent));
    return a && a.target==='_blank' && /noopener/.test(a.rel);
  })());
  ok('the journal does not link to itself',
     ![...d.querySelectorAll('a[href]')].some(a=>a.getAttribute('href')===BASE+'journal.html'
       && a.closest('.dyop-nav')));
}
{
  const {d}=boot('legal.html');
  ok('the licensing page drops its own chip',
     ![...d.querySelectorAll('.dyop-nav-chip')].some(a=>/Licensing/.test(a.textContent)));
  ok('but still offers the portal',
     [...d.querySelectorAll('.dyop-nav-chip')].some(a=>/Portal/.test(a.textContent)));
}

console.log('IT KEEPS OUT OF THE TOOLS\' WAY');
{
  const css=blocks[PAGES[0]];
  ok('the launcher sits on the left', /\.dyop-nav-fab\{position:fixed; left:20px/.test(css));
  ok('the dice roller still owns the right',
     /\.dice-fab\{position:fixed; right:20px/.test(read('character-builder-2.html')) &&
     /\.dice-fab\{position:fixed; right:20px/.test(read('encounter-control.html')));
  ok('it lifts above the Fray\'s turn bar', /body\.fighting \.dyop-nav-fab\{bottom:76px\}/.test(css));
  ok('it is below a tool\'s own modals when shut, above everything when open',
     /\.dyop-nav-fab\{[^}]*z-index:60/.test(css) && /\.dyop-nav-scrim\{[^}]*z-index:500/.test(css));
  ok('nothing in any tool out-stacks the open panel', PAGES.every(p=>{
    const own=read(p).replace(blocks[p],'');
    return ![...own.matchAll(/z-index:\s*(\d+)/g)].some(m=>+m[1]>=500);
  }));
  ok('it disappears when printing', /@media print\{\.dyop-nav\{display:none !important\}\}/.test(css));
  ok('it respects reduced motion', /prefers-reduced-motion/.test(css));
  ok('it never builds twice', /if \(window\.__dyopNav\) return;/.test(css));
  ok('it survives localStorage being unavailable', /catch \(e\) \{ dm = false; \}/.test(css));
}

console.log('\n  %d passed, %d failed', pass, fail);
process.exit(fail?1:0);
