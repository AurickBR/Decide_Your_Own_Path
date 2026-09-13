/* Compendium & Bestiary.
 *
 * Covers the attack-line change (claude/ATTACK_RULE.md: there is no to-hit roll in this system —
 * the damage roll IS the attack), and locks in the escaping/CSP hardening from the security pass.
 *
 * Note the "PROSE SURVIVES" block: eight monster descriptions legitimately contain the words
 * "to hit" ("easy to hit", "very little to hit"). A careless find-and-replace would eat them.
 *
 * Run:  npm install jsdom   (once)
 *       node test/compendium.test.js
 */
const fs=require('fs'), path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
const FILE=path.join(__dirname,'..','compendium-and-bestiary.html');
const src=fs.readFileSync(FILE,'utf8');
let pass=0,fail=0; const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL: '+n+(d?'   ['+d+']':'')));};

console.log('SOURCE');
ok('no to-hit bonus is computed anywhere', src.indexOf('toHit')===-1,
   'toHit occurrences: '+(src.split('toHit').length-1));
ok('no statblock prints a to-hit line', src.indexOf('to hit ·')===-1);
ok('esc() is the hardened one', /const esc = s => String\(s==null\?"":s\)\.replace\(\/\[&<>"'`\]\/g/.test(src));
ok('no un-hardened esc() survives', src.indexOf('replace(/[&<>"]/g')===-1);
ok('CSP present', src.includes('Content-Security-Policy'));
ok('legal notices present', src.includes('unofficial Fan Content permitted under the Fan Content Policy')
   && src.includes('System Reference Document 5.2.1 (&ldquo;SRD 5.2.1&rdquo;)'));
ok('build stamp present', /<div class="dyop-build" data-build="[\d-]+" data-rev="[0-9a-f]{7}">/.test(src));

console.log('PROSE SURVIVES — these are creature descriptions, not statblock code');
const prose = (src.match(/to hit/g)||[]).length;
ok('eight descriptions still say "to hit"', prose===8, 'found '+prose);
['very little to hit','easy to hit','hardest things to hit','everything you want to hit']
  .forEach(p=>ok('kept: "'+p+'"', src.includes(p)));

console.log('RENDERED');
const vc=new VirtualConsole(); const errs=[]; vc.on('jsdomError',e=>errs.push(e.message));
const dom=new JSDOM(src,{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,url:'https://localhost/'});
const d=dom.window.document;
ok('boots with no errors', errs.length===0, errs[0]);
ok('renders a full page', d.querySelectorAll('*').length>5000, 'nodes='+d.querySelectorAll('*').length);

const arolls=[...d.querySelectorAll('.aroll')];
ok('attack lines render', arolls.length>20, 'lines='+arolls.length);
ok('none of them says "to hit"', !arolls.some(a=>/to hit/i.test(a.textContent)),
   (arolls.find(a=>/to hit/i.test(a.textContent))||{textContent:''}).textContent);
ok('they still show damage and type',
   arolls.filter(a=>/\d+d\d+/.test(a.textContent)).length>10,
   arolls.slice(0,3).map(a=>a.textContent.trim()).join(' | '));
ok('no line starts with a stray + from the removed bonus',
   !arolls.some(a=>/^\s*[+−-]\d/.test(a.textContent)),
   (arolls.find(a=>/^\s*[+−-]\d/.test(a.textContent))||{textContent:''}).textContent);

const labels=[...new Set([...d.querySelectorAll('.sec-label')].map(l=>l.textContent).filter(t=>/^Attacks/.test(t)))];
ok('every attack section states the rule', labels.length===1 && /the damage roll is the attack/.test(labels[0]),
   JSON.stringify(labels));

console.log('SPELLCASTING IS UNTOUCHED');
/* The house rule is written about weapons. The casting block still advertises a spell attack
   bonus; whether that survives is a rules call, not a cleanup. Left deliberately. */
ok('casting block still present', src.includes('spell save DC'));
ok('spell attack bonus still shown', src.includes('spell attack'));

console.log('\n'+(fail?'FAILED':'ALL PASS')+'  —  '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
