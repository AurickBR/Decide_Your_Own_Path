/* Conditions on the character sheet.
 *
 * The fifteen conditions are SRD 5.2.1 (CC BY 4.0); Concentrating and Raging are this system's own
 * and carry no SRD text. Exhaustion is level-based and lives on its own bar, so it is deliberately
 * NOT one of the on/off toggles — there must be exactly one source of truth for it.
 *
 * Design ruling (2026-09-12): conditions are TRACKED AND DISPLAYED ONLY. Most of them grant
 * Advantage or Disadvantage on attack rolls, and this system has no to-hit roll, so nothing here
 * may touch a roll. The "TOUCHES NO DICE" block guards that.
 *
 * Run:  npm install jsdom   (once)
 *       node test/conditions.test.js
 */
const fs=require('fs'), path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
const FILE=path.join(__dirname,'..','character-builder-2.html');
const vc=new VirtualConsole(); const errs=[]; vc.on('jsdomError',e=>errs.push(e.message));
const dom=new JSDOM(fs.readFileSync(FILE,'utf8'),{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,url:'https://localhost/'});
const w=dom.window,E=c=>w.eval(c),$=s=>w.document.querySelector(s),$$=s=>[...w.document.querySelectorAll(s)];
const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
let pass=0,fail=0; const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL: '+n+(d?'   ['+d+']':'')));};
const sheet=()=>{ E('UI.view="sheet"; renderAll();'); };

console.log('BOOT');
ok('no jsdom errors', errs.length===0, errs[0]);
ok('data present', E('Array.isArray(CONDITIONS)') && E('CONDITIONS.length')===17, 'len='+E('CONDITIONS.length'));
ok('15 from the SRD', E('CONDITIONS.filter(c=>!c.hb).length')===15);
ok('2 homebrew', E('CONDITIONS.filter(c=>c.hb).length')===2);
ok('every one has a description', E('CONDITIONS.every(c=>c.d && c.d.length>20)'));

console.log('BOTH TOOLS AGREE');
const ec=fs.readFileSync(path.join(__dirname,'..','encounter-control.html'),'utf8');
/* Both files are written by tools/build_conditions.py. Accept either shape so this assertion is
   about the NAMES agreeing, not about how each file happens to store them. */
const dmRaw=JSON.parse(ec.match(/const CONDITIONS\s*=\s*(\[[\s\S]*?\]);\n/)[1]);
const dmList=dmRaw.map(c=>typeof c==='string'?c:c.n).sort();
const pcList=E('JSON.stringify(CONDITIONS.map(c=>c.n).sort())');
ok('the sheet lists exactly what Encounter Control lists',
   JSON.stringify(dmList)===pcList, 'dm='+dmList.length+' pc='+JSON.parse(pcList).length);

console.log('EXHAUSTION STAYS ON ITS OWN BAR');
ok('marked level-based', E('!!CONDITIONS.find(c=>c.n==="Exhaustion").lvl'));
ok('excluded from the on/off list', E('condList().length')===16 && E('!condList().some(c=>c.n==="Exhaustion")'));
sheet();
E('condPickOpen=true; renderSheetView();');
ok('no Exhaustion chip in the picker', !$('[data-condtoggle="Exhaustion"]'));
ok('16 chips offered', $$('[data-condtoggle]').length===16, 'chips='+$$('[data-condtoggle]').length);
E('condPickOpen=false; renderSheetView();');
ok('its rules are readable from the bar', !!$('[data-exhread]'));
click($('[data-exhread]'));
ok('and open there', /Exhaustion Levels/.test(($('.exh-bar .cond-desc')||{textContent:''}).textContent),
   (($('.exh-bar .cond-desc')||{textContent:''}).textContent||'').slice(0,80));
click($('[data-exhread]'));

console.log('TOGGLING');
E('Object.assign(S,blankChar()); UI.view="sheet"; renderAll();');
ok('starts with none', E('condsOn().length')===0 && /none/.test($('.cond-none').textContent));
E('condPickOpen=true; renderSheetView();');
click($('[data-condtoggle="Prone"]'));
ok('Prone is active', E('condActive("Prone")')===true);
ok('a card appeared', !!$('[data-condread="Prone"]'));
ok('the count shows 1', $('.cond-count').textContent==='1');
click($('[data-condtoggle="Poisoned"]'));
ok('two active', E('condsOn().length')===2);
ok('picker chip reads as on', $('[data-condtoggle="Prone"]').className.includes('on'));
click($('[data-condtoggle="Prone"]'));
ok('toggling off removes it', E('condActive("Prone")')===false && E('condsOn().length')===1);
click($('[data-condrm="Poisoned"]'));
ok('the ✕ removes it too', E('condsOn().length')===0);

console.log('DESCRIPTIONS');
E('toggleCond("Restrained"); toggleCond("Raging"); renderSheetView();');
click($('[data-condread="Restrained"]'));
ok('SRD text opens', /Speed 0/.test($('.cond-card.open .cond-desc').textContent),
   ($('.cond-card.open .cond-desc')||{textContent:''}).textContent.slice(0,70));
ok('and is credited', /CC BY 4\.0/.test($('.cond-card.open .cond-desc').textContent));
click($('[data-condread="Restrained"]'));
ok('closes again', !$('.cond-card.open'));
click($('[data-condread="Raging"]'));
ok('homebrew condition points at the talent', /Rage/.test($('.cond-card.open .cond-desc').textContent));
ok('homebrew is NOT credited to the SRD', !/CC BY/.test($('.cond-card.open .cond-desc').textContent));
ok('homebrew is badged as ours', !!$('.cond-hb'));
ok('descriptions use only expected tags',
   E('(()=>{const ok=new Set(["P","EM","STRONG","UL","LI","H4","TABLE","THEAD","TBODY","TR","TH","TD","DIV"]);'+
     'const d=document.createElement("div");for(const c of CONDITIONS){d.innerHTML=c.d;'+
     'for(const el of d.querySelectorAll("*"))if(!ok.has(el.tagName))return "bad:"+el.tagName+" in "+c.n;}return "clean";})()')==='clean');
ok('no leftover markdown', E('CONDITIONS.every(c=>c.d.indexOf("**")===-1 && c.d.indexOf("\\u0000")===-1)'));

console.log('NOTES — and the focus rule');
E('Object.assign(S,blankChar()); toggleCond("Frightened"); UI.view="sheet"; renderAll();');
const note=$('[data-condnote="Frightened"]');
ok('note field rendered', !!note);
note.value='until dawn'; note.dispatchEvent(new w.Event('input',{bubbles:true}));
ok('typing does not re-render the field away', $('[data-condnote="Frightened"]').value==='until dawn');
ok('state took it', E('S.conds["Frightened"].note')==='until dawn');
E('renderSheetView();');
ok('note survives a re-render', $('[data-condnote="Frightened"]').value==='until dawn');
E('save(); Object.assign(S,blankChar()); load(); migrate(); renderSheetView();');
ok('and a save/load round-trip', E('S.conds["Frightened"] && S.conds["Frightened"].note')==='until dawn');

console.log('TOUCHES NO DICE (the design ruling)');
E('Object.assign(S,blankChar()); S.budget=30; S.level=9; S.skills={Acrobatics:1};');
const rnd=w.Math.random; w.Math.random=()=>0.5;
const before=E('skillCheckRoll("Acrobatics")');
E('toggleCond("Prone"); toggleCond("Restrained"); toggleCond("Poisoned"); toggleCond("Blinded");');
const after=E('skillCheckRoll("Acrobatics")');
w.Math.random=rnd;
ok('four conditions change a skill check by nothing', before.total===after.total,
   'before='+before.total+' after='+after.total);
ok('and add no penalty field', after.exh===0);
ok('the picker says so in plain words', (()=>{E('condPickOpen=true; renderSheetView();');
   return /don.t change your dice/.test(($('.cond-hint')||{textContent:''}).textContent);})(),
   (($('.cond-hint')||{textContent:''}).textContent||'').slice(0,90));

console.log('IMPORTED SAVES');
E('S.conds="nonsense"; migrate();');
ok('a non-object becomes empty', E('typeof S.conds==="object" && !Array.isArray(S.conds) && Object.keys(S.conds).length===0'));
E('S.conds={Prone:1,Charmed:{note:42},Stunned:{}}; migrate();');
ok('odd entries are coerced to {note:string}',
   E('Object.values(S.conds).every(v=>v&&typeof v.note==="string")'),
   E('JSON.stringify(S.conds)'));
ok('a numeric note becomes text', E('S.conds.Charmed.note')==='42');

console.log('A HOSTILE NAME FROM AN IMPORTED FILE');
/* condition names are interpolated into data-* attributes, so they must be escaped */
E('window.__PWNED=0; Object.assign(S,blankChar());');
E('S.conds={\'x"><img src=y onerror="window.__PWNED=1">\':{note:"n"}}; migrate(); UI.view="sheet"; renderAll();');
ok('no element was created from the name', $$('.cond-wrap img').length===0, 'imgs='+$$('.cond-wrap img').length);
ok('nothing executed', w.__PWNED===0);
ok('it renders as literal text', /onerror/.test($('.cond-wrap').textContent));
ok('an unknown name still gets a card', $$('.cond-card').length===1);
ok('with an honest placeholder', /No description recorded/.test($$('.cond-card')[0].textContent) ||
   !!$('[data-condread]'), 'card='+$$('.cond-card')[0].textContent.slice(0,60));

console.log('REGRESSION');
ok('still no jsdom errors', errs.length===0, errs[0]);
E('Object.assign(S,blankChar()); UI.view="sheet"; renderAll();');
ok('sheet still renders vitals', !!$('.sv-vitals') && !!$('.exh-bar'));
ok('rest bar still there', !!$('#svRest'));
console.log('\n'+(fail?'FAILED':'ALL PASS')+'  —  '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
