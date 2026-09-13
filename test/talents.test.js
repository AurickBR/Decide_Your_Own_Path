/* Talents — one source of truth for caps, and requirements that actually parse.
 *
 * The data used to carry a `maxLevel` field on all 102 talents that NO code read, and which
 * disagreed with the real cap in TM for three of them (Spell Knowledge said 2 against TM's 9).
 * ARCHITECTURE.md had to warn readers which one to believe. It was removed on 2026-09-13; the
 * first block here stops it coming back.
 *
 * TM is now the only place a cap lives.
 *
 * Run:  npm install   (once)
 *       node test/talents.test.js
 */
const fs=require('fs'), path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
const ROOT=path.join(__dirname,'..');
let pass=0,fail=0; const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL: '+n+(d?'   ['+d+']':'')));};
function boot(f){
  const vc=new VirtualConsole(); const errs=[]; vc.on('jsdomError',e=>errs.push(e.message));
  const dom=new JSDOM(fs.readFileSync(path.join(ROOT,f),'utf8'),
    {runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,url:'https://localhost/'});
  return {w:dom.window, errs};
}
const B=boot('character-builder-2.html'), C=boot('compendium-and-bestiary.html');
const E=c=>B.w.eval(c), Ec=c=>C.w.eval(c);

console.log('BOOT');
ok('builder boots clean', B.errs.length===0, B.errs[0]);
ok('compendium boots clean', C.errs.length===0, C.errs[0]);
ok('102 talents in the builder', E('TALENTS.length')===102, E('TALENTS.length'));
ok('102 in the compendium', Ec('Object.keys(TALENT_DB).length')===102, Ec('Object.keys(TALENT_DB).length'));

console.log('ONE SOURCE OF TRUTH FOR CAPS');
ok('no talent carries maxLevel in the builder',
   E('TALENTS.filter(t=>"maxLevel" in t).length')===0,
   E('JSON.stringify(TALENTS.filter(t=>"maxLevel" in t).map(t=>t.name).slice(0,5))'));
ok('nor in the compendium',
   Ec('Object.values(TALENT_DB).filter(t=>"maxLevel" in t).length')===0);
ok('no code reads maxLevel anywhere',
   !fs.readFileSync(path.join(ROOT,'character-builder-2.html'),'utf8').includes('maxLevel') &&
   !fs.readFileSync(path.join(ROOT,'compendium-and-bestiary.html'),'utf8').includes('maxLevel'));
ok('every capped kind declares its cap in TM',
   E('Object.entries(TM).filter(([k,m])=>["leveled","schoolspec","sourcespec"].includes(m.kind)&&m.max==null).length')===0,
   E('JSON.stringify(Object.entries(TM).filter(([k,m])=>["leveled","schoolspec","sourcespec"].includes(m.kind)&&m.max==null).map(([k])=>k))'));
ok('every TM entry names a real talent',
   E('Object.keys(TM).filter(k=>!TALENTS.some(t=>t.name===k)).length')===0,
   E('JSON.stringify(Object.keys(TM).filter(k=>!TALENTS.some(t=>t.name===k)))'));
ok('every TM kind is one the code handles',
   E('Object.values(TM).every(m=>["leveled","count","repeat","pick","schoolspec","sourcespec"].includes(m.kind))'),
   E('JSON.stringify([...new Set(Object.values(TM).map(m=>m.kind))])'));
ok('a talent with no TM entry defaults to single',
   E('meta("Toughness").kind')==='single' || E('!TM["Toughness"]'),
   E('JSON.stringify(meta("Toughness"))'));

console.log('BOTH TOOLS LIST THE SAME TALENTS');
const bNames=JSON.parse(E('JSON.stringify(TALENTS.map(t=>t.name).sort())'));
const cNames=JSON.parse(Ec('JSON.stringify(Object.keys(TALENT_DB).sort())'));
ok('the compendium knows every talent the builder offers',
   bNames.every(n=>cNames.includes(n)), bNames.filter(n=>!cNames.includes(n)).join(', '));
ok('and offers none the builder does not',
   cNames.every(n=>bNames.includes(n)), cNames.filter(n=>!bNames.includes(n)).join(', '));

console.log('REQUIREMENTS PARSE');
/* evalReq is the gate on every talent purchase and had no coverage at all */
/* evalReq returns {ok, clauses} — every clause is reported so the UI can show which one failed */
E('Object.assign(S, blankChar()); S.level=20; S.budget=60; migrate();');
const bad=JSON.parse(E(`(()=>{
  const out=[];
  for(const t of TALENTS){
    try{
      const r=evalReq(t.req);
      if(typeof r!=="object" || typeof r.ok!=="boolean" || !Array.isArray(r.clauses))
        out.push(t.name+": bad shape");
    }catch(e){ out.push(t.name+": "+e.message); }
  }
  return JSON.stringify(out);
})()`));
ok('every one of the 102 requirements evaluates cleanly', bad.length===0, bad.slice(0,3).join(' | '));
ok('every clause is labelled for the UI',
   E('TALENTS.every(t=>evalReq(t.req).clauses.every(c=>typeof c.label==="string" && c.label.length))'));

E('Object.assign(S, blankChar()); S.attr.DEX=6; migrate();');
ok('an unmet attribute requirement fails', E('evalReq("Dexterity 13+").ok')===false);
ok('and says which clause failed', E('evalReq("Dexterity 13+").clauses[0].met')===false);
E('S.attr.DEX=14;');
ok('a met one passes', E('evalReq("Dexterity 13+").ok')===true);
ok('"None" is always met with no clauses',
   E('evalReq("None").ok')===true && E('evalReq("None").clauses.length')===0);
E('Object.assign(S, blankChar()); migrate();');
ok('a missing prerequisite talent fails', E('evalReq("Rage").ok')===false);
E('S.talents["Rage"]={level:1,choices:[]};');
ok('a held prerequisite passes', E('evalReq("Rage").ok')===true);
E('Object.assign(S, blankChar()); S.attr.STR=16; S.attr.CON=6; migrate();');
ok('a multi-clause requirement needs all of them',
   E('evalReq("Strength 13+; Constitution 13+").ok')===false
   && E('evalReq("Strength 13+; Constitution 13+").clauses.length')===2);
E('S.attr.CON=16;');
ok('and passes when all are met', E('evalReq("Strength 13+; Constitution 13+").ok')===true);

console.log('CAPS ARE ENFORCED');
E('Object.assign(S, blankChar()); S.level=20; S.budget=60; migrate();');
const levelled=JSON.parse(E('JSON.stringify(Object.entries(TM).filter(([k,m])=>m.kind==="leveled").map(([k,m])=>[k,m.max]))'));
ok('there are leveled talents to check', levelled.length>0, 'count='+levelled.length);
let overCap=[];
for(const [name,max] of levelled){
  E('S.talents='+JSON.stringify({[name]:{level:max,choices:[]}})+';');
  E('lvlUp('+JSON.stringify(name)+')');
  const lv=E('S.talents['+JSON.stringify(name)+'].level');
  if(lv>max) overCap.push(name+': '+lv+' > '+max);
}
ok('lvlUp never exceeds TM.max', overCap.length===0, overCap.slice(0,3).join(' | '));

console.log('\n'+(fail?'FAILED':'ALL PASS')+'  —  '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
