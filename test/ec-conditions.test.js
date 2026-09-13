/* Encounter Control — exhaustion as a level, and readable condition text.
 *
 * Brings the DM tool in line with the character sheet (claude/EXHAUSTION_RULE.md):
 *   · Exhaustion is a LEVEL on the combatant, not an on/off chip. 0–6, death at 6.
 *   · Every D20 Test is reduced by 2 × level. Initiative is the only D20 Test this tool rolls.
 *   · Recovery is the sheet's job — a combat tracker has no rests.
 *   · The other 16 conditions are tracked and displayed only; their SRD text is readable.
 *
 * Run:  npm install jsdom   (once)
 *       node test/ec-conditions.test.js
 */
const fs=require('fs'), path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
const FILE=process.env.EC || path.join(__dirname,'..','encounter-control.html');
const vc=new VirtualConsole(); const errs=[]; vc.on('jsdomError',e=>errs.push(e.message));
const dom=new JSDOM(fs.readFileSync(FILE,'utf8'),{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,url:'https://localhost/'});
const w=dom.window, F=w.__fray, $=s=>w.document.querySelector(s), $$=s=>[...w.document.querySelectorAll(s)];
const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
let pass=0,fail=0; const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL: '+n+(d?'   ['+d+']':'')));};
const foe=(id,name)=>({id,side:"foe",name,g:"x",sub:"",ac:5,initMod:2,init:null,
  hp:{c:12,m:12},thp:0,tp:{c:0,m:0},mana:{c:0,m:0},cond:[],note:"",blk:null});
const open=id=>{ F.ui.open[id]=true; F.renderAll(); };

console.log('BOOT');
ok('no jsdom errors', errs.length===0, errs[0]);
ok('hook available', !!F && typeof F.exhOf==='function');
ok('conditions carry text now', Array.isArray(F.CONDITIONS) && F.CONDITIONS.length===17
   && F.CONDITIONS.every(c=>c.n && c.d), 'len='+(F.CONDITIONS||[]).length);

console.log('EXHAUSTION IS A LEVEL, NOT A CHIP');
ok('Exhaustion marked level-based', !!F.CONDITIONS.find(c=>c.n==='Exhaustion').lvl);
ok('excluded from the chips', F.condList().length===16 && !F.condList().some(c=>c.n==='Exhaustion'));
F.S.cs.length=0; F.S.log.length=0;
F.S.cs.push(foe('e1','Drow Blade'));
F.renderAll(); open('e1');
ok('a level stepper is offered', !!$('[data-exhset="e1"]'));
ok('no Exhaustion chip', !$('[data-cond="e1|Exhaustion"]'), 'chip present');
ok('16 chips shown', $$('[data-cond^="e1|"]').length===16, 'chips='+$$('[data-cond^="e1|"]').length);
ok('starts at 0', F.exhOf(F.S.cs[0])===0);

console.log('THE PENALTY');
F.setExh('e1',3);
ok('level set', F.exhOf(F.S.cs[0])===3);
ok('D20 Tests reduced by 2 x level', F.exhPenalty(F.S.cs[0])===6);
ok('Speed reduced by 5 ft x level', F.exhSpeedLoss(F.S.cs[0])===15);
F.setExh('e1',99); ok('clamps at 6', F.exhOf(F.S.cs[0])===6);
F.setExh('e1',-2); ok('clamps at 0', F.exhOf(F.S.cs[0])===0);

console.log('INITIATIVE — the only D20 Test this tool rolls');
const real=w.Math.random; const forceD20=v=>{ w.Math.random=()=>(v-1)/20; };
F.setExh('e1',0); F.S.cs[0].init=null;
forceD20(15); F.rollInit(false); w.Math.random=real;
const clean=F.S.cs[0].init;
ok('unexhausted: 15 + 2 initMod = 17', clean===17, 'init='+clean);
F.setExh('e1',3); F.S.cs[0].init=null;
forceD20(15); F.rollInit(false); w.Math.random=real;
ok('exhausted 3: 15 + 2 − 6 = 11', F.S.cs[0].init===11, 'init='+F.S.cs[0].init);
ok('that is exactly 2 per level lower', clean-F.S.cs[0].init===6);

console.log('LOGGED, AND STILL NO MARKUP STORED');
F.S.log.length=0; F.setExh('e1',2);
ok('a change is written to the record', F.S.log.length>0);
ok('the record still stores data, not markup',
   !/<\/?(b|span|img)\b|class=/i.test(JSON.stringify(F.S.log)), JSON.stringify(F.S.log).slice(0,120));
F.renderAll();
ok('and renders', /exhaustion/i.test(($('.logbox')||{textContent:''}).textContent),
   (($('.logbox')||{textContent:''}).textContent||'').slice(0,120));
F.S.log.length=0; F.setExh('e1',6); F.renderAll();
ok('death at 6 is stated in the log', /dies/i.test($('.logbox').textContent), $('.logbox').textContent.slice(0,140));
F.setExh('e1',0);

console.log('OLD SAVES CARRYING A BARE "Exhaustion" CHIP');
F.hydrate({round:1, party:[], savedRolls:[], log:[],
  cs:[Object.assign(foe('e2','Old Save'), {cond:[{n:'Exhaustion',r:null},{n:'Prone',r:2}]})]});
const lifted=F.S.cs[0];
ok('the chip is gone', !lifted.cond.some(x=>/exhaustion/i.test(x.n)), JSON.stringify(lifted.cond));
ok('and became a level', F.exhOf(lifted)>=1, 'exh='+lifted.exh);
ok('other conditions are untouched', lifted.cond.length===1 && lifted.cond[0].n==='Prone' && lifted.cond[0].r===2);

console.log('CONDITION TEXT IS READABLE');
F.S.cs.length=0; F.S.cs.push(foe('e3','Kuo-toa Whip'));
F.renderAll(); open('e3');
click($('[data-cond="e3|Restrained"]'));
ok('condition applied', F.S.cs[0].cond.some(x=>x.n==='Restrained'));
open('e3');
ok('a read toggle appears', !!$('[data-condread="e3|Restrained"]'));
click($('[data-condread="e3|Restrained"]'));
ok('SRD text opens', /Speed 0/.test(($('.condbody')||{textContent:''}).textContent),
   (($('.condbody')||{textContent:''}).textContent||'').slice(0,70));
ok('credited', /CC BY 4\.0/.test($('.condbody').textContent));
click($('[data-condread="e3|Restrained"]'));
ok('closes', !$('.condbody'));
click($('[data-cond="e3|Raging"]'));
open('e3'); click($('[data-condread="e3|Raging"]'));
ok('homebrew condition points at the talent', /Rage/.test($('.condbody').textContent));
ok('homebrew is not credited to the SRD', !/CC BY/.test($('.condbody').textContent));

console.log('TOUCHES NOTHING ELSE');
F.S.cs.length=0; F.S.cs.push(foe('e4','Control'));
F.S.cs[0].init=null; F.setExh('e4',0);
forceD20(11); F.rollInit(false); w.Math.random=real;
const base=F.S.cs[0].init;
['Prone','Blinded','Poisoned','Restrained'].forEach(n=>F.S.cs[0].cond.push({n,r:null}));
F.S.cs[0].init=null;
forceD20(11); F.rollInit(false); w.Math.random=real;
ok('four ordinary conditions change initiative by nothing', base===F.S.cs[0].init,
   'base='+base+' after='+F.S.cs[0].init);

console.log('REGRESSION');
ok('still no jsdom errors', errs.length===0, errs[0]);
ok('encounter still renders', w.document.querySelectorAll('*').length>100);
ok('attack engine intact', typeof F.resolveAttack==='function' && typeof F.explodeDie==='function');
console.log('\n'+(fail?'FAILED':'ALL PASS')+'  —  '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
