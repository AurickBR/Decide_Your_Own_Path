/* Attack resolution — regression suite for character-builder-2.html
 *
 * The house rule (claude/ATTACK_RULE.md): there is no separate to-hit roll. The damage roll
 * IS the attack. Each weapon die explodes independently on its own maximum, flat bonuses are
 * added, and the target's Armor Class is subtracted as damage reduction. Dice riding on the
 * weapon are rolled only on a hit and never explode.
 *
 * Run:   npm install jsdom      (once)
 *        node test/attack.test.js
 *
 * Dice are seeded by stubbing Math.random with a queue of [face, sides] pairs, so explosion
 * chains are asserted rather than assumed. Math.random is always restored — uid() depends on
 * it, and leaving it stubbed breaks later tests.
 */
const fs=require('fs');
const {JSDOM,VirtualConsole}=require('jsdom');
const FILE=require('path').join(__dirname,'..','character-builder-2.html');
const html=fs.readFileSync(FILE,'utf8');
const vc=new VirtualConsole(); let errs=[]; vc.on('jsdomError',e=>errs.push(e.message));
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,url:'https://localhost/'});
const w=dom.window, E=c=>w.eval(c), $=s=>w.document.querySelector(s), $$=s=>[...w.document.querySelectorAll(s)];
const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
let pass=0,fail=0;
const ok=(n,c,d)=>{ c?(pass++):(fail++,console.log('  FAIL: '+n+(d?'   ['+d+']':''))); };

/* Seed exact die faces. rollDie(N) = 1+floor(random()*N), so to force value v on a dN we
   return (v-1)/N. Each queue entry carries its own die size so mixed d8/d6 draws work. */
let queue=[];
const real=w.Math.random;
const seed=pairs=>{ queue=pairs.slice();
  w.Math.random=()=>{ const e=queue.shift(); if(!e) throw new Error('dice queue exhausted'); return (e[0]-1)/e[1]; }; };
const left=()=>queue.length;
const unseed=()=>{ w.Math.random=real; };
const res=()=>JSON.parse(E('JSON.stringify(atk.result)'));
const setField=(sel,v)=>{ const el=$(sel); el.value=v; el.dispatchEvent(new w.Event('input',{bubbles:true})); };

console.log('BOOT');
ok('no jsdom errors on load', errs.length===0, errs[0]);
ok('attack engine present', E('typeof explodeDie')==='function' && E('typeof resolveAttack')==='function');
ok('existing app still boots', E('typeof renderAll')==='function' && E('typeof migrate')==='function');

console.log('ENGINE — parsing');
ok('parseDmg 1d8', JSON.stringify(E('parseDmg("1d8")'))===JSON.stringify({qty:1,sides:8,mod:0}));
ok('parseDmg 4d6 +4', JSON.stringify(E('parseDmg("4d6 +4")'))===JSON.stringify({qty:4,sides:6,mod:4}));
ok('parseDmg 2d4 -1', E('parseDmg("2d4 -1").mod')===-1);
ok('parseDmg on a flat number is null', E('parseDmg("1")')===null);
ok('parseRider keeps damage type', E('parseRider("1d6 fire").type')==='fire');
ok('parseRider bare dice has no type', E('parseRider("1d6").type')==='');

console.log('ENGINE — exploding dice');
seed([[6,6],[6,6],[2,6]]); ok('a maxed die rerolls and chains', JSON.stringify(E('explodeDie(6)'))==='[6,6,2]'); unseed();
seed([[3,6]]);             ok('a non-max die stops',            JSON.stringify(E('explodeDie(6)'))==='[3]'); unseed();
seed([[6,6],[2,6],[3,6]]); ok('each die of 2d6 explodes on its own', JSON.stringify(E('rollExploding(2,6)'))==='[[6,2],[3]]'); unseed();
ok('a d1 never explodes', JSON.stringify(E('explodeDie(1)'))==='[1]');
ok('chainSum adds the chain', E('chainSum([6,6,2])')===14);
seed(Array.from({length:40},()=>[6,6]));
const capped=E('explodeDie(6)').length; unseed();
ok('runaway chain is capped at 30', capped===30, 'len='+capped);

console.log('BONUS — which attribute rides on the weapon');
E('S.attr.STR=16; S.attr.DEX=10;');
ok('melee uses STR',  E('weaponAbility(WEAPONS.find(w=>w.name==="Longsword"))')==='STR');
ok('STR 16 gives +3',  E('weaponAtkBonus(WEAPONS.find(w=>w.name==="Longsword"))')===3);
ok('ranged uses DEX',  E('weaponAbility(WEAPONS.find(w=>/Ranged/.test(w.cat)))')==='DEX');
E('S.attr.STR=10; S.attr.DEX=18;');
ok('finesse takes the better attribute', E('weaponAbility(WEAPONS.find(w=>/Finesse/i.test(w.props||"")))')==='DEX');
E('S.attr.STR=16; S.attr.DEX=10;');

console.log('SHEET — the panel');
E('S.inv.push({id:"tw1",kind:"weapon",name:"Longsword",worn:true,dur:{cur:8,max:8}});');
E('S.inv.push({id:"tw2",kind:"weapon",name:"Dagger",worn:false,dur:{cur:4,max:4}});');
E('UI.view="sheet"; renderAll();');
const eqBtn=$$('[data-sheetsec]').find(b=>/equip/i.test(b.textContent));
ok('Equipment section tab found', !!eqBtn);
if(eqBtn) click(eqBtn);
ok('wielded weapon offers an attack button', !!$('[data-atkopen="tw1"]'));
ok('stowed weapon does not', !$('[data-atkopen="tw2"]'));
click($('[data-atkopen="tw1"]'));
ok('panel opens', !!$('.atkp'));
ok('bonus pre-filled from STR', $('[data-atkbonus]').value==='3', 'got '+($('[data-atkbonus]')||{}).value);
ok('AC starts blank', $('[data-atkac]').value==='');
click($('[data-atkopen="tw1"]'));
ok('clicking again closes it', !$('.atkp') && E('atk')===null);
click($('[data-atkopen="tw1"]'));

console.log('FOCUS RULE — typing must not re-render');
setField('[data-atkac]','5');
ok('AC field keeps its value while typing', $('[data-atkac]').value==='5');
ok('state took the value', E('atk.ac')==='5');
setField('[data-atkrider]','1d6 fi');
ok('rider field survives mid-word', $('[data-atkrider]').value==='1d6 fi');
setField('[data-atkrider]','');

console.log('RESOLVE — AC as damage reduction');
/* Longsword 1d8: roll a 6, +3 STR = 9, minus AC 5 -> 4 through */
seed([[6,8]]); click($('[data-atkroll]')); unseed();
let r=res();
ok('base rolled', r.base===6, 'base='+r.base);
ok('bonus applied', r.bonus===3);
ok('total = base + bonus', r.total===9);
ok('AC subtracted from the total', r.dealt===4, 'dealt='+r.dealt);
ok('1 or more through is a hit', r.hit===true);
ok('no crit on a non-max die', r.crits===0);
ok('damage shown in the verdict', $('.atkp-dmg').firstChild.textContent==='4', JSON.stringify($('.atkp-dmg').textContent));
ok('roll reached the dice-tray history', E('diceLog.length')>0);

console.log('RESOLVE — turned aside');
setField('[data-atkac]','20');
seed([[2,8]]); click($('[data-atkroll]')); unseed();
r=res();
ok('0 or less is turned aside', r.hit===false, 'hit='+r.hit);
ok('no damage dealt', r.dealt===0);
ok('miss wording shown', /turned aside/i.test($('.atkp-dmg').textContent));

console.log('RESOLVE — riders');
setField('[data-atkac]','5'); setField('[data-atkrider]','2d6 fire');
/* weapon d8 explodes 8 -> 2 (base 10, +3 = 13, -5 AC = 8 through)
   then the rider draws exactly 2 d6 and must NOT explode even on a 6 */
seed([[8,8],[2,8],[6,6],[6,6]]);
click($('[data-atkroll]'));
const remaining=left(); unseed();
r=res();
ok('weapon die exploded', JSON.stringify(r.chains)==='[[8,2]]', JSON.stringify(r.chains));
ok('crit counted', r.crits===1);
ok('rider rolled exactly its own dice', r.rider && r.rider.rolls.length===2, JSON.stringify(r.rider));
ok('rider did NOT explode on a 6', remaining===0 && r.rider.rolls.join()==='6,6', 'left='+remaining);
ok('rider added after AC', r.dealt===8+12, 'dealt='+r.dealt);
ok('rider type kept', r.rider.type==='fire');

console.log('RESOLVE — rider only on a hit');
setField('[data-atkac]','50');
seed([[2,8]]);
click($('[data-atkroll]'));
const leftover=left(); unseed();
r=res();
ok('miss rolls no rider dice', r.rider===null && leftover===0, 'rider='+JSON.stringify(r.rider)+' left='+leftover);

console.log('NO TARGET');
setField('[data-atkac]','');
seed([[5,8]]); click($('[data-atkroll]')); unseed();
r=res();
ok('blank AC just totals the dice', r.ac===null && r.total===8, JSON.stringify({ac:r.ac,total:r.total}));
ok('no hit verdict without a target', r.hit===null);
ok('panel says so', /no target Armor Class/i.test($('.atkp-math').textContent));

console.log('REGRESSION');
ok('still no jsdom errors', errs.length===0, errs[0]);
ok('sheet still renders vitals', !!$('#sheetView') && $('#sheetView').innerHTML.length>500);
E('UI.view="build"; renderAll();');
ok('build view still renders', (w.document.querySelector('#tlist')||{}).innerHTML.length>500);
ok('save/load round-trips with a panel open', (()=>{ try{ E('save(); load(); migrate(); renderAll();'); return errs.length===0; }catch(e){ return false; } })());
ok('atk state is not persisted', !/\"atk\"/.test(w.localStorage.getItem('dyop_character_v2')||''));

console.log('\n'+(fail?'FAILED':'ALL PASS')+'  —  '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
