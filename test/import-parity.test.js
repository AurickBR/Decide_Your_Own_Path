/* Character import parity — the Builder and The Fray must agree on the numbers.
 *
 * `charDerived()` in encounter-control.html is 56 lines whose own comment says it "mirrors the
 * builder: hpMax / manaMax / tpMax / armorAC". That is TWO IMPLEMENTATIONS OF THE SAME FORMULAS.
 * Change armorAC() in the builder — add a talent, tweak Medium Armor Master — and a player's
 * imported sheet silently shows different numbers on the DM's screen, with nothing to catch it.
 *
 * This suite builds characters in the builder, exports them exactly as the Export button does,
 * feeds them through charDerived(), and asserts every number matches. It also checks the Fray's
 * GEAR table against the builder's ARMORS / SHIELDS / ACCESSORIES, since that is the other way
 * the two can drift: a new armor in the builder that GEAR has never heard of computes a wrong AC.
 *
 * If this suite fails, one of the two tools has moved and the other has not. Fix the mirror, do
 * not adjust the test.
 *
 * Run:  npm install   (once)
 *       node test/import-parity.test.js
 */
const fs=require('fs'), path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
const ROOT=path.join(__dirname,'..');
let pass=0,fail=0; const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL: '+n+(d?'   ['+d+']':'')));};

function boot(file){
  const vc=new VirtualConsole(); const errs=[]; vc.on('jsdomError',e=>errs.push(e.message));
  const dom=new JSDOM(fs.readFileSync(path.join(ROOT,file),'utf8'),
    {runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,url:'https://localhost/'});
  return {w:dom.window, errs};
}
const B=boot('character-builder-2.html');          // not IIFE-wrapped: eval reaches internals
const Fr=boot('encounter-control.html');
const E=c=>B.w.eval(c);
const F=Fr.w.__fray;

console.log('BOOT');
ok('builder boots clean', B.errs.length===0, B.errs[0]);
ok('fray boots clean', Fr.errs.length===0, Fr.errs[0]);
ok('charDerived reachable', typeof F.charDerived==='function');
ok('GEAR reachable', !!F.GEAR && !!F.GEAR.armor);

console.log('THE GEAR TABLES MATCH');
const ARM=E('JSON.stringify(ARMORS)'), SH=E('JSON.stringify(SHIELDS)'), ACC=E('JSON.stringify(ACCESSORIES)');
const armors=JSON.parse(ARM), shields=JSON.parse(SH), accs=JSON.parse(ACC);
let armMiss=[], armBad=[];
for(const a of armors){
  const g=F.GEAR.armor[a.n];
  if(!g){ armMiss.push(a.n); continue; }
  if(g[0]!==a.ac || g[1]!==a.maxDex || g[2]!==a.cat) armBad.push(a.n+': '+JSON.stringify(g)+' vs '+JSON.stringify([a.ac,a.maxDex,a.cat]));
}
ok('every armor the builder offers exists in GEAR', armMiss.length===0, armMiss.join(', '));
ok('and with identical ac / maxDex / category', armBad.length===0, armBad.slice(0,3).join(' | '));
ok('GEAR has no armor the builder does not',
   Object.keys(F.GEAR.armor).every(n=>armors.some(a=>a.n===n)),
   Object.keys(F.GEAR.armor).filter(n=>!armors.some(a=>a.n===n)).join(', '));

const shBad=shields.filter(s=>F.GEAR.shield[s.n]!==parseInt(String(s.bonus).replace('+',''),10));
ok('every shield matches its bonus', shBad.length===0,
   shBad.map(s=>s.n+': '+F.GEAR.shield[s.n]+' vs '+s.bonus).join(' | '));
ok('shield count matches', Object.keys(F.GEAR.shield).length===shields.length,
   Object.keys(F.GEAR.shield).length+' vs '+shields.length);

const acWorth=accs.filter(a=>+a.ac>0);
const accBad=acWorth.filter(a=>(F.GEAR.acc[a.n]||0)!==+a.ac);
ok('every AC-granting accessory matches', accBad.length===0,
   accBad.map(a=>a.n+': '+(F.GEAR.acc[a.n]||0)+' vs '+a.ac).join(' | '));

console.log('THE DERIVED NUMBERS MATCH');
const armorNamed = cat => (armors.find(a=>a.cat===cat)||{}).n;
const lightArmor=armorNamed('light'), medArmor=armors.find(a=>a.cat==='medium'&&a.maxDex!=null).n,
      heavyArmor=armorNamed('heavy'), shieldName=shields[0].n,
      accName=(acWorth[0]||{}).n;

const SCENARIOS=[
  ['plain level 1', {}],
  ['high level and budget', {level:17, budget:60, attr:{STR:10,DEX:14,CON:16,INT:10,WIS:10,CHA:10}}],
  ['rolled hit dice', {level:5, hpDice:[8,5,7,3,6], attr:{STR:10,DEX:10,CON:16,INT:10,WIS:10,CHA:10}}],
  ['average hp fallback', {level:6, hpDice:null, attr:{STR:10,DEX:10,CON:18,INT:10,WIS:10,CHA:10}}],
  ['negative CON', {level:4, attr:{STR:10,DEX:10,CON:6,INT:10,WIS:10,CHA:10}}],
  ['Toughness', {level:7, talents:{Toughness:{level:1,choices:[]}}, attr:{STR:10,DEX:10,CON:14,INT:10,WIS:10,CHA:10}}],
  ['Draconic Resilience', {level:9, talents:{"Draconic Resilience":{level:1,choices:[]}}}],
  ['Mana 7', {level:9, budget:40, talents:{Mana:{level:7,choices:[]}}}],
  ['Mana 20', {level:20, budget:60, talents:{Mana:{level:20,choices:[]}}}],
  ['light armor', {level:3, attr:{STR:10,DEX:18,CON:10,INT:10,WIS:10,CHA:10},
                   inv:[{id:'a1',kind:'armor',name:lightArmor,worn:true}]}],
  ['medium armor, dex capped', {level:3, attr:{STR:10,DEX:18,CON:10,INT:10,WIS:10,CHA:10},
                   inv:[{id:'a2',kind:'armor',name:medArmor,worn:true}]}],
  ['medium armor + Medium Armor Master', {level:3, attr:{STR:10,DEX:18,CON:10,INT:10,WIS:10,CHA:10},
                   talents:{"Medium Armor Master":{level:1,choices:[]}},
                   inv:[{id:'a3',kind:'armor',name:medArmor,worn:true}]}],
  ['heavy armor', {level:3, attr:{STR:10,DEX:16,CON:10,INT:10,WIS:10,CHA:10},
                   inv:[{id:'a4',kind:'armor',name:heavyArmor,worn:true}]}],
  ['armor + shield', {level:3, inv:[{id:'a5',kind:'armor',name:lightArmor,worn:true},
                                    {id:'s1',kind:'shield',name:shieldName,worn:true}]}],
  ['accessory with AC', {level:3, inv:accName?[{id:'x1',kind:'accessory',name:accName,worn:true}]:[]}],
  ['magical item AC', {level:3, items:[{id:'m1',name:'Ward',base:'',rarity:'Rare',ac:2,durBonus:0,dmg:'',notes:'',actions:[]}]}],
  ['Dual Wielder, two weapons', {level:3, talents:{"Dual Wielder":{level:1,choices:[]}},
                   inv:[{id:'w1',kind:'weapon',name:'Dagger',worn:true},{id:'w2',kind:'weapon',name:'Dagger',worn:true}]}],
  ['Combat Style Defensive', {level:3, talents:{"Combat Style":{level:1,choices:['Defensive']}},
                   inv:[{id:'a6',kind:'armor',name:lightArmor,worn:true}]}],
  ['Armor is for the Weak, unarmored', {level:3, attr:{STR:10,DEX:12,CON:14,INT:10,WIS:16,CHA:10},
                   talents:{"Armor is for the Weak":{level:1,choices:[]}}}],
  ['Alertness 2 — initiative', {level:5, budget:30, attr:{STR:10,DEX:16,CON:10,INT:10,WIS:10,CHA:10},
                   talents:{Alertness:{level:2,choices:[]}}}],
  ['everything at once', {level:14, budget:45,
                   attr:{STR:12,DEX:16,CON:18,INT:12,WIS:14,CHA:10},
                   hpDice:[8,6,4,7,5,8,3,6,5,7,4,8,6,5],
                   talents:{Toughness:{level:1,choices:[]}, Mana:{level:9,choices:[]},
                            "Combat Style":{level:1,choices:['Defensive']},
                            "Medium Armor Master":{level:1,choices:[]}},
                   inv:[{id:'a7',kind:'armor',name:medArmor,worn:true},
                        {id:'s2',kind:'shield',name:shieldName,worn:true}],
                   items:[{id:'m2',name:'Amulet',base:'',rarity:'Rare',ac:1,durBonus:0,dmg:'',notes:'',actions:[]}]}],
];

for(const [label,scn] of SCENARIOS){
  E('Object.assign(S, blankChar());');
  E('Object.assign(S, '+JSON.stringify(scn)+'); migrate();');
  const mine={
    prof: E('profBonus()'), hp: E('hpMax()'), mana: E('manaMax()'),
    tp: E('tpMax()'), ac: E('armorAC()'),
  };
  const exported=JSON.parse(E('JSON.stringify(S)'));      // exactly what Export writes
  const theirs=F.charDerived(exported);
  ok(label+' — proficiency', mine.prof===theirs.prof, mine.prof+' vs '+theirs.prof);
  ok(label+' — hit points', mine.hp===theirs.hp, mine.hp+' vs '+theirs.hp);
  if(!(scn.hpDice && scn.hpDice.length)){
    /* Resolved 2026-09-13: with no rolled hit dice BOTH tools use the average. The builder used
       to use hpStats().max here, which quoted a ceiling as a total and disagreed with the DM's
       import. Assert the fallback explicitly so it cannot drift back. */
    const st=JSON.parse(E('JSON.stringify(hpStats())'));
    ok(label+' — unrolled hp is the average, not the max',
       mine.hp===st.avg && (st.avg===st.max || mine.hp!==st.max),
       'builder '+mine.hp+' · avg '+st.avg+' · max '+st.max);
  }
  ok(label+' — mana',        mine.mana===theirs.mana, mine.mana+' vs '+theirs.mana);
  ok(label+' — talent points', mine.tp===theirs.tp,   mine.tp+' vs '+theirs.tp);
  ok(label+' — armor class', mine.ac===theirs.ac,     mine.ac+' vs '+theirs.ac);
}

console.log('INITIATIVE FOLLOWS THE SAME RULE');
E('Object.assign(S, blankChar()); S.level=5; S.budget=30; S.attr.DEX=16; migrate();');
let exp=JSON.parse(E('JSON.stringify(S)'));
ok('plain: initMod is the Dex modifier', F.charDerived(exp).initMod===E('mod(S.attr.DEX)'),
   F.charDerived(exp).initMod+' vs '+E('mod(S.attr.DEX)'));
E('S.talents["Alertness"]={level:2,choices:[]};');
exp=JSON.parse(E('JSON.stringify(S)'));
ok('Alertness 2 adds proficiency', F.charDerived(exp).initMod===E('mod(S.attr.DEX)+profBonus()'),
   F.charDerived(exp).initMod+' vs '+E('mod(S.attr.DEX)+profBonus()'));
E('S.talents["Alertness"]={level:1,choices:[]};');
exp=JSON.parse(E('JSON.stringify(S)'));
ok('Alertness 1 does not', F.charDerived(exp).initMod===E('mod(S.attr.DEX)'));

console.log('A REAL IMPORT LANDS THOSE NUMBERS');
E('Object.assign(S, blankChar()); S.name="Vaelis"; S.level=8; S.budget=35; S.attr.CON=16; S.attr.DEX=14;');
E('S.talents={Toughness:{level:1,choices:[]}, Mana:{level:5,choices:[]}};');
E('S.inv=[{id:"ai",kind:"armor",name:'+JSON.stringify(lightArmor)+',worn:true}]; migrate();');
const sheet=JSON.parse(E('JSON.stringify(S)'));
F.S.cs.length=0; F.S.party.length=0;
const added=F.importCharacter(sheet,'vaelis.dyop.json');
ok('import reports success', added!==false);
const p=F.S.party[0];
ok('a party member was created', !!p, JSON.stringify(F.S.party));
if(p){
  ok('name carried', p.name==='Vaelis', p.name);
  ok('HP matches the sheet', p.hp===E('hpMax()'), p.hp+' vs '+E('hpMax()'));
  ok('AC matches the sheet', p.ac===E('armorAC()'), p.ac+' vs '+E('armorAC()'));
  ok('mana matches the sheet', p.mana===E('manaMax()'), p.mana+' vs '+E('manaMax()'));
  ok('talent points match', p.tp===E('tpMax()'), p.tp+' vs '+E('tpMax()'));
}

console.log('\n'+(fail?'FAILED':'ALL PASS')+'  —  '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
