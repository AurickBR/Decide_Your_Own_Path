/* Exhaustion — the condition from SRD 5.2.1, with this system's own recovery.
 *
 * Two house rules are pinned down here and must not drift:
 *
 *  1. RECOVERY IS NOT THE SRD'S. The SRD says "finishing a Long Rest removes 1 Exhaustion level".
 *     This system uses REST_TYPES[].exh instead — short 0, normal 0, long 1, safe 1, comfortable 2
 *     — plus Metabolic Control's trance on a safe or comfortable rest. The comfortable-rest and
 *     normal-rest cases below are what distinguish this from the SRD rule.
 *
 *  2. THE MASTERY FLOOR APPLIES AFTER THE EXHAUSTION PENALTY, so a mastered skill can shrug
 *     exhaustion off entirely. Order matters: floor-then-penalty and penalty-then-floor give
 *     different numbers, and the test below is built so only the correct order passes.
 *
 * Run:  npm install jsdom   (once)
 *       node test/exhaustion.test.js
 */
const fs=require('fs'); const {JSDOM,VirtualConsole}=require('jsdom');
const FILE=require('path').join(__dirname,'..','character-builder-2.html');
const vc=new VirtualConsole(); const errs=[]; vc.on('jsdomError',e=>errs.push(e.message));
const dom=new JSDOM(fs.readFileSync(FILE,'utf8'),{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,url:'https://localhost/'});
const w=dom.window,E=c=>w.eval(c),$=s=>w.document.querySelector(s),$$=s=>[...w.document.querySelectorAll(s)];
const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
let pass=0,fail=0; const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL: '+n+(d?'   ['+d+']':'')));};
const real=w.Math.random;
const forceDie=v=>{ w.Math.random=()=>(v-1)/20; };   // rollDie-style d20
const unforce=()=>{ w.Math.random=real; };

console.log('BOOT');
ok('no jsdom errors', errs.length===0, errs[0]);
ok('engine present', E('typeof curExh')==='function' && E('typeof exhRestTotal')==='function');
ok('max is 6', E('EXH_MAX')===6);

console.log('THE CONDITION (SRD 5.2.1)');
E('Object.assign(S,blankChar()); S.budget=30; S.level=9; S.attr.INT=14; S.attr.WIS=14;');
ok('starts at 0', E('curExh()')===0);
ok('no penalty at 0', E('exhPenalty()')===0 && E('exhSpeedLoss()')===0);
E('setExh(3)');
ok('D20 Tests reduced by 2 x level', E('exhPenalty()')===6, 'got '+E('exhPenalty()'));
ok('Speed reduced by 5 ft x level', E('exhSpeedLoss()')===15);
E('setExh(99)'); ok('clamps up at 6', E('curExh()')===6);
E('setExh(-4)'); ok('clamps down at 0', E('curExh()')===0);
E('setExh("bogus")'); ok('junk becomes 0', E('curExh()')===0);

console.log('HOUSE RULE 2 — Mastery applies AFTER the penalty');
/* Master skill, Int 20 => floor = proficiency 3 + 5 = 8. Exhaustion 3 => penalty 6.
   Roll a 12. The two orders give measurably different answers:
     correct (penalty first, then floor):  12 - 6 = 6, under the floor, so Mastery lifts it to 8
     wrong   (floor first, then penalty):  12 is already over the floor, so -6 leaves 6
   Asserting eff === 8 therefore fails if the order is ever flipped. */
E('S.attr.INT=20; S.skills={};');
E('S.talents["Expertise"]={level:4,choices:[]}; S.talents["Mastery"]={level:4,choices:[]};');
E('S.skills["Athletics"]=3;');   /* Master */
const pbv=E('profBonus()'), floorv=E('profBonus()+mod(S.attr.INT)');
ok('character is a Master in Athletics', E('skillTier("Athletics")')===3, 'tier='+E('skillTier("Athletics")'));
ok('floor is proficiency + Int mod = 8', floorv===8, 'floor='+floorv);
E('setExh(0)'); forceDie(12);
const clean=E('skillCheckRoll("Athletics")'); unforce();
ok('unexhausted: a 12 clears the floor untouched', clean.floored===false && clean.eff===12,
   JSON.stringify({eff:clean.eff,floor:floorv}));
E('setExh(3)'); forceDie(12);
const r1=E('skillCheckRoll("Athletics")'); unforce();
ok('penalty is recorded', r1.exh===6);
ok('12 − 6 = 6 falls under the floor, so Mastery lifts it to 8', r1.floored===true && r1.eff===8,
   JSON.stringify({die:r1.die,exh:r1.exh,eff:r1.eff,floor:floorv}));
ok('the WRONG order would have given 6 — it did not', r1.eff!==6, 'eff='+r1.eff);
ok('so Mastery cushions the penalty: 4 lost instead of 6', clean.total-r1.total===4,
   'lost '+(clean.total-r1.total));
forceDie(20);
const r2=E('skillCheckRoll("Athletics")'); unforce();
ok('a roll that survives the penalty is not floored', r2.floored===false && r2.eff===20-6,
   JSON.stringify({eff:r2.eff}));

console.log('...and a NON-mastered skill feels it in full');
E('S.skills={}; S.skills["Acrobatics"]=1;');    /* Trained only */
E('setExh(0)'); forceDie(12); const t0=E('skillCheckRoll("Acrobatics")'); unforce();
E('setExh(3)'); forceDie(12); const t3=E('skillCheckRoll("Acrobatics")'); unforce();
ok('trained skill loses the full 2 x level', t0.total-t3.total===6, 'delta='+(t0.total-t3.total));
ok('and is never floored', t3.floored===false);

console.log('HOUSE RULE 1 — recovery is this system’s, not the SRD’s');
const rt=k=>E(`REST_TYPES.find(t=>t.k==="${k}")`);
ok('short removes none',       E('exhRestTotal(REST_TYPES.find(t=>t.k==="short"))')===0);
ok('normal removes none',      E('exhRestTotal(REST_TYPES.find(t=>t.k==="normal"))')===0);
ok('long removes 1',           E('exhRestTotal(REST_TYPES.find(t=>t.k==="long"))')===1);
ok('safe removes 1',           E('exhRestTotal(REST_TYPES.find(t=>t.k==="safe"))')===1);
ok('comfortable removes 2 — the SRD would remove 1',
   E('exhRestTotal(REST_TYPES.find(t=>t.k==="comfortable"))')===2);
E('S.talents["Metabolic Control"]={level:1,choices:[]};');
ok('Metabolic Control adds 1 on safe',        E('exhRestTotal(REST_TYPES.find(t=>t.k==="safe"))')===2);
ok('Metabolic Control adds 1 on comfortable', E('exhRestTotal(REST_TYPES.find(t=>t.k==="comfortable"))')===3);
ok('but not on a normal rest',                E('exhRestTotal(REST_TYPES.find(t=>t.k==="normal"))')===0);
ok('and not on a long rest',                  E('exhRestTotal(REST_TYPES.find(t=>t.k==="long"))')===1);
delete0=E('delete S.talents["Metabolic Control"]');

console.log('A REST ACTUALLY APPLIES IT');
E('UI.view="sheet"; renderAll();');
E('setExh(4); restType="normal"; restDice=0; restSkills={healing:false,concentration:false}; applyRest();');
ok('a normal rest removes nothing', E('curExh()')===4, 'got '+E('curExh()'));
E('setExh(4); restType="long"; restDice=0; restSkills={healing:false,concentration:false}; applyRest();');
ok('a long rest removes 1', E('curExh()')===3, 'got '+E('curExh()'));
E('setExh(4); restType="comfortable"; restDice=0; restSkills={healing:false,concentration:false}; applyRest();');
ok('a comfortable rest removes 2', E('curExh()')===2, 'got '+E('curExh()'));
E('setExh(1); restType="comfortable"; restDice=0; restSkills={healing:false,concentration:false}; applyRest();');
ok('never goes below 0', E('curExh()')===0);

console.log('THE CONTROL');
E('setExh(2); UI.view="sheet"; renderAll();');
ok('bar rendered', !!$('.exh-bar'));
ok('shows the level', $('.exh-in').value==='2');
ok('states both effects', /D20 Tests −4/.test($('.exh-eff').textContent) && /Speed −10 ft/.test($('.exh-eff').textContent),
   $('.exh-eff').textContent);
click($('[data-exhadj="1"]'));
ok('+ adds a level', E('curExh()')===3);
click($('[data-exhadj="-1"]'));
ok('− removes one', E('curExh()')===2);
E('setExh(0); renderSheetView();');
ok('says no effect at 0', /no effect/.test($('.exh-eff').textContent));
ok('minus disabled at 0', $('[data-exhadj="-1"]').disabled===true);
E('setExh(6); renderSheetView();');
ok('plus disabled at 6', $('[data-exhadj="1"]').disabled===true);
ok('death is stated at 6', /this character dies/.test($('.exh-warn').textContent));
const inp=$('.exh-in'); inp.value='2'; inp.dispatchEvent(new w.Event('change',{bubbles:true}));
ok('typed value is accepted', E('curExh()')===2);

console.log('IMPORTED SAVES');
E('S.play.exh=99; migrate();'); ok('a silly imported level is clamped', E('curExh()')===6);
E('S.play.exh="x"; migrate();'); ok('a non-numeric level becomes 0', E('curExh()')===0);
E('setExh(3); save(); Object.assign(S,blankChar()); load(); migrate();');
ok('survives a save/load round-trip', E('curExh()')===3, 'got '+E('curExh()'));

console.log('REGRESSION');
ok('still no jsdom errors', errs.length===0, errs[0]);
ok('rest panel names the real number', (()=>{ E('setExh(3); restOpen=true; restType="comfortable"; renderSheetView();');
  return /−2 exhaustion levels/.test(($('.rest-eff')||{textContent:''}).textContent); })(),
  (($('.rest-eff')||{textContent:''}).textContent||'').slice(0,120));
console.log('\n'+(fail?'FAILED':'ALL PASS')+'  —  '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
