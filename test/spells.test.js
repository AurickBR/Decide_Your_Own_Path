/* Spell descriptions — SRD 5.2.1 text, licensing boundaries, and the two render surfaces. */
const fs=require('fs'); const {JSDOM,VirtualConsole}=require('jsdom');
const FILE=process.argv[2]||'./character-builder-2.html';
const html=fs.readFileSync(FILE,'utf8');
const vc=new VirtualConsole(); const errs=[]; vc.on('jsdomError',e=>errs.push(e.message));
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,url:'https://localhost/'});
const w=dom.window,E=c=>w.eval(c),$=s=>w.document.querySelector(s),$$=s=>[...w.document.querySelectorAll(s)];
const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
let pass=0,fail=0; const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL: '+n+(d?'   ['+d+']':'')));};

console.log('BOOT');
ok('no jsdom errors', errs.length===0, errs[0]);
ok('spell count', E('SPELLS.length')===389, 'got '+E('SPELLS.length'));

console.log('LICENSING BOUNDARY');
ok('340 spells carry SRD text', E('SPELLS.filter(s=>s.d).length')===340, E('SPELLS.filter(s=>s.d).length'));
ok('43 point at the PHB',       E('SPELLS.filter(s=>s.nb===1).length')===43);
ok('6 are in neither',          E('SPELLS.filter(s=>s.nb===2).length')===6);
ok('every one of those names its sourcebook', E('SPELLS.filter(s=>s.nb===2).every(s=>!!s.bk)'),
   E('JSON.stringify(SPELLS.filter(s=>s.nb===2&&!s.bk).map(s=>s.n))'));
ok('and none of them claims to be in the PHB', E('SPELLS.filter(s=>s.nb===2).every(s=>!/Player/.test(s.bk))'));
ok('no SRD spell carries a book pointer', E('SPELLS.filter(s=>s.d).every(s=>!s.bk&&!s.nb)'));
ok('every spell is exactly one of the three', E('SPELLS.every(s=>(s.d?1:0)+(s.nb?1:0)===1)'));
ok('no non-SRD spell carries text', E('SPELLS.filter(s=>s.nb).every(s=>!s.d&&!s.ct&&!s.cp)'));
ok('every SRD spell has a full stat block', E('SPELLS.filter(s=>s.d).every(s=>s.ct&&s.rg&&s.cp&&s.du)'));
ok('no leftover markdown anywhere', E('SPELLS.filter(s=>s.d&&(s.d.indexOf("**")>-1||s.d.indexOf("\\u0000")>-1)).length')===0);
ok('descriptions contain only expected tags',
   E('(()=>{const ok=new Set(["P","EM","STRONG","UL","LI","H4","TABLE","THEAD","TBODY","TR","TH","TD"]);'+
     'const d=document.createElement("div");for(const s of SPELLS){if(!s.d)continue;d.innerHTML=s.d;'+
     'for(const el of d.querySelectorAll("*"))if(!ok.has(el.tagName))return "bad:"+el.tagName+" in "+s.n;}return "clean";})()')==='clean');

console.log('CLEAN-UPS');
ok('Divine Smite is Evocation', E('SPELLS.find(s=>s.n==="Divine Smite").sc')==='Evocation');
ok('Glibness is Enchantment',   E('SPELLS.find(s=>s.n==="Glibness").sc')==='Enchantment');
ok('Feeblemind is gone',        E('!SPELLS.find(s=>s.n==="Feeblemind")'));
ok('Befuddlement present with free text', E('!!SPELLS.find(s=>s.n==="Befuddlement").d'));
['Antilife Shell','Floating Disk','Hideous Laughter','Transport via Plants','Tsunami','Vitriolic Sphere']
  .forEach(n=>ok('added '+n, E(`!!SPELLS.find(s=>s.n===${JSON.stringify(n)})`)));
E('S.spells={"Feeblemind":true}; migrate();');
ok('a learned Feeblemind migrates to Befuddlement', E('!!S.spells["Befuddlement"] && !S.spells["Feeblemind"]'));

console.log('BUILD VIEW');
E('Object.assign(S,blankChar()); S.budget=60; S.level=10; S.attr.INT=18;');
E('S.talents["Spell Knowledge"]={level:5,choices:["Arcane:9","Religion:9","Nature:9","History:9","Performance:9","Craft:9"]}; S.talents["Mana"]={level:5,choices:[]};');
E('UI.view="build"; UI.sub="spells"; renderAll(); applySub&&applySub();');
E('spellUI.search=""; spellUI.source="All"; spellUI.level="All"; spellUI.learnable=false; spellUI.knownOnly=false; renderSpells();');
ok('spell rows rendered', $$('.spell-row').length>50, 'rows='+$$('.spell-row').length);
ok('no description open yet', $$('.sp-desc').length===0);
const fireball=$$('[data-spellinfo="Fireball"]')[0];
ok('Fireball row found', !!fireball);
click(fireball);
ok('description opens', !!$('.sp-desc'));
ok('stat block rendered', /Casting Time/.test($('.sp-stats').textContent) && /150 feet/.test($('.sp-stats').textContent));
ok('body text present', /bright streak/i.test($('.sp-body').textContent));
ok('CC BY credited in the panel', /CC BY 4\.0/.test($('.sp-cc').textContent));
click($$('[data-spellinfo="Fireball"]')[0]);
ok('clicking again closes it', $$('.sp-desc').length===0);

console.log('NON-SRD SPELLS SHOW A POINTER, NEVER TEXT');
const phbSpell=E('SPELLS.find(s=>s.nb===1).n');
click($$(`[data-spellinfo="${phbSpell}"]`)[0]);
ok('PHB spell shows the notice', !!$('.sp-nosrd'), phbSpell);
ok('names the Player’s Handbook', /Player.s Handbook/.test($('.sp-nosrd').textContent));
ok('no stat block leaked', !$('.sp-stats'));
ok('no body text leaked', !$('.sp-body'));
click($$(`[data-spellinfo="${phbSpell}"]`)[0]);
const orphan=E('SPELLS.find(s=>s.nb===2).n');
click($$(`[data-spellinfo="${orphan}"]`)[0]);
const obook=E(`SPELLS.find(s=>s.n===${JSON.stringify(orphan)}).bk`);
ok('orphan names its sourcebook', $('.sp-nosrd').textContent.includes(obook), orphan+' / '+obook);
ok('orphan flags it is not in the 2024 PHB', /not in the 2024/i.test($('.sp-nosrd').textContent));
ok('orphan still leaks no text', !$('.sp-stats') && !$('.sp-body'));
click($$(`[data-spellinfo="${orphan}"]`)[0]);

console.log('SEARCH REACHES THE TEXT');
E('spellUI.search="bat guano"; renderSpells();');
const names=$$('.spell-name').map(n=>n.textContent.replace('▶','').trim());
ok('finds Fireball by its component text', names.includes('Fireball'), names.slice(0,5).join(','));
E('spellUI.search=""; renderSpells();');

console.log('SHEET VIEW');
E('S.spells={"Fireball":true,"'+phbSpell.replace(/"/g,'\\"')+'":true}; UI.view="sheet"; renderAll();');
const sb=$$('[data-sheetsec]').find(b=>/spell/i.test(b.textContent));
ok('Spellbook section found', !!sb); if(sb) click(sb);
ok('Read button offered', !!$('[data-svinfo="Fireball"]'));
click($('[data-svinfo="Fireball"]'));
ok('sheet description opens', !!$('.sv-spellrow .sp-desc'));
ok('sheet stat block', /150 feet/.test($('.sv-spellrow .sp-stats').textContent));
ok('Cast button still there', !!$('[data-svcast="Fireball"]'));
click($('[data-svinfo="Fireball"]'));
ok('sheet description closes', !$('.sv-spellrow .sp-desc'));

console.log('TABLES');
E('UI.view="build"; renderAll(); spellUI.search="augury"; renderSpells();');
click($$('[data-spellinfo="Augury"]')[0]);
ok('table rendered', !!$('.sp-tbl') && $$('.sp-tbl th').length>=2);
ok('table cells escaped as text', /Weal/.test($('.sp-tbl').textContent));

console.log('REGRESSION');
ok('still no jsdom errors', errs.length===0, errs[0]);
ok('save/load round-trips', (()=>{try{E('save(); load(); migrate(); renderAll();'); return errs.length===0;}catch(e){return false;}})());
console.log('\n'+(fail?'FAILED':'ALL PASS')+'  —  '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
