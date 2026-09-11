/* Combat record — structural safety + regression suite for encounter-control.html
 *
 * SECURITY_AUDIT.md finding 2 was stored XSS through the combat log: entries were saved as HTML
 * strings and re-injected raw, so a crafted "Restore" backup supplied markup directly. The log now
 * stores data ({r, p:[parts], k}) and builds markup only in renderParts(), where every value is
 * escaped. These tests assert that no element can be created from a restored file, that legacy
 * {m:html} entries still read correctly, and that ordinary formatting survives.
 *
 * encounter-control.html wraps itself in an IIFE, so internals are reached through the
 * window.__fray test hook — which is itself now local-only (see the last block).
 *
 * Run:  npm install jsdom   (once)
 *       node test/combat-log.test.js
 */
const fs=require('fs');
const {JSDOM,VirtualConsole}=require('jsdom');
const FILE=require('path').join(__dirname,'..','encounter-control.html');
const html=fs.readFileSync(FILE,'utf8');

let pass=0,fail=0;
const ok=(n,c,d)=>{ c?(pass++):(fail++,console.log('  FAIL: '+n+(d?'   ['+d+']':''))); };
function boot(url){
  const vc=new VirtualConsole(); const errs=[]; vc.on('jsdomError',e=>errs.push(e.message));
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
                            virtualConsole:vc, url:url||'https://localhost/'});
  return {w:dom.window, errs};
}
const PAYLOAD='<img src=x onerror="window.__PWNED=1">';
const foe=(id,name)=>({id,side:"foe",name,g:"x",sub:"",ac:5,initMod:0,init:10,
  hp:{c:12,m:12},thp:0,tp:{c:0,m:0},mana:{c:0,m:0},cond:[],note:"",blk:null});

console.log('BOOT');
const {w,errs}=boot();
const F=w.__fray, $=s=>w.document.querySelector(s), $$=s=>[...w.document.querySelectorAll(s)];
const logText=()=>($('.logbox')||{textContent:''}).textContent;
const logHTML=()=>($('.logbox')||{innerHTML:''}).innerHTML;
ok('no jsdom errors on load', errs.length===0, errs[0]);
ok('test hook available on localhost', !!F);
ok('log helpers present', typeof F.renderParts==='function' && typeof F.logit==='function');

console.log('THE LOG STORES DATA, NOT MARKUP');
F.S.cs.length=0; F.S.log.length=0; F.S.round=1;
F.S.cs.push(foe('c1','Goblin'));
F.damage('c1',4); F.heal('c1',2); F.grantTemp('c1',3);
ok('entries were written', F.S.log.length>=3, 'len='+F.S.log.length);
ok('every entry has parts', F.S.log.every(l=>Array.isArray(l.p)));
ok('no entry carries an m string', F.S.log.every(l=>l.m===undefined));
const noMarkup=o=>!/<\/?(b|span|i|em|small|img|svg)\b|class=/i.test(JSON.stringify(o));
ok('nothing stored contains markup', noMarkup(F.S.log), JSON.stringify(F.S.log).slice(0,120));

console.log('FORMATTING SURVIVES');
F.S.view='encounter'; F.renderAll();
ok('log box rendered', !!$('.logbox'));
ok('names still render bold', $$('.lm b').length>0);
ok('numbers still get the .n class', $$('.lm b.n').length>0);
ok('damage line reads correctly', /Goblin takes 4 damage/.test(logText()), logText().slice(0,160));
ok('heal line reads correctly', /Goblin recovers 2 HP/.test(logText()));
ok('temp HP line reads correctly', /gains 3 temporary HP/.test(logText()));

console.log('EXPLOIT — markup in a restored backup');
w.__PWNED=0;
F.hydrate({round:1, cs:[], party:[], savedRolls:[],
  log:[{r:1, p:[{b:PAYLOAD}, ' hits ', {n:PAYLOAD}, {dim:PAYLOAD}, PAYLOAD], k:'dmg'}]});
F.renderAll();
ok('no element created from the payload', $$('.logbox img').length===0, 'imgs='+$$('.logbox img').length);
ok('nothing executed', w.__PWNED===0);
ok('payload shown as literal text', /<img src=x onerror=/.test(logText()), logText().slice(0,140));
ok('payload escaped in the markup', logHTML().indexOf('<img')===-1);
ok('still no jsdom errors', errs.length===0, errs[0]);

console.log('EXPLOIT — legacy {m:html} entry');
w.__PWNED=0;
F.hydrate({round:1, cs:[], party:[], savedRolls:[],
  log:[{r:2, m:'<b>Orc</b> takes '+PAYLOAD+' damage', k:'dmg'}]});
F.renderAll();
ok('legacy entry converted to parts', Array.isArray(F.S.log[0].p) && F.S.log[0].m===undefined);
ok('legacy entry stores no markup', noMarkup(F.S.log), JSON.stringify(F.S.log).slice(0,140));
ok('legacy words preserved', /Orc takes/.test(logText()), logText().slice(0,120));
ok('legacy payload created no element', $$('.logbox img').length===0 && w.__PWNED===0);

console.log('EXPLOIT — hostile combatant name reaches the log');
w.__PWNED=0; F.S.log.length=0; F.S.cs.length=0;
F.S.cs.push(foe('c9',PAYLOAD));
F.damage('c9',3); F.renderAll();
ok('hostile name creates no element', $$('.logbox img').length===0 && w.__PWNED===0);
ok('hostile name shown literally', /onerror/.test(logText()));

console.log('AWKWARD CHARACTERS ROUND-TRIP');
F.S.log.length=0; F.S.cs.length=0;
F.S.cs.push(foe('cq','Va\'len "the <Ash>"'));
F.damage('cq',2); F.renderAll();
ok('quotes and brackets display literally', /Va'len "the <Ash>" takes 2 damage/.test(logText()), logText().slice(0,170));
F.save();
F.hydrate(JSON.parse(w.localStorage.getItem('dyop_fray_v1')));
F.renderAll();
ok('survives save → restore', /Va'len "the <Ash>"/.test(logText()), logText().slice(0,170));
ok('and still stores no markup, only data', noMarkup(F.S.log) && /<Ash>/.test(JSON.stringify(F.S.log)));

console.log('COPY FOR THE JOURNAL');
const copied=F.S.log.map(l=>'R'+l.r+'  '+F.partsText(l.p)).join('\n');
ok('copy output is plain text', copied.indexOf('<b>')===-1 && /Va'len/.test(copied), copied.slice(0,140));

console.log('TEST HOOK IS LOCAL-ONLY');
const pub=boot('https://aurickbr.github.io/Decide_Your_Own_Path/encounter-control.html');
ok('published origin exposes no __fray', typeof pub.w.__fray==='undefined');
ok('published build boots clean', pub.errs.length===0, pub.errs[0]);
const localFresh=boot('https://localhost/');
ok('published build renders exactly as the local one',
   pub.w.document.querySelectorAll('*').length===localFresh.w.document.querySelectorAll('*').length
   && pub.w.document.body.textContent.length===localFresh.w.document.body.textContent.length,
   'pub='+pub.w.document.querySelectorAll('*').length+' local='+localFresh.w.document.querySelectorAll('*').length);
ok('published build still has its masthead and picker',
   !!pub.w.document.querySelector('.masthead') && !!pub.w.document.querySelector('.switch'));

console.log('\n'+(fail?'FAILED':'ALL PASS')+'  —  '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
