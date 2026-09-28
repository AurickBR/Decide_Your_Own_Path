/* Species and lineages — the checks from claude/SPECIES_EVALUATION.md §5, committed.
 *
 * The species work was verified on 2026-09-21 with 31 lineage checks, 33 species checks and a
 * cross-file HP comparison, all run by hand and never committed. This suite is those checks,
 * so the next edit to SPECIES, evalReq() or migrate() is caught by `npm test`.
 * (The HP parity with The Fray lives in import-parity.test.js alongside the other scenarios.)
 *
 * Run:  npm install   (once)
 *       node test/species.test.js
 */
const fs=require('fs'), path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
const ROOT=path.join(__dirname,'..');
let pass=0,fail=0; const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL: '+n+(d?'   ['+d+']':'')));};

const vc=new VirtualConsole(); const errs=[]; vc.on('jsdomError',e=>errs.push(e.message));
const dom=new JSDOM(fs.readFileSync(path.join(ROOT,'character-builder-2.html'),'utf8'),
  {runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,url:'https://localhost/'});
const E=c=>dom.window.eval(c);
const fresh=(extra)=>E('Object.assign(S, blankChar()); S.level=10; S.budget=40; '+(extra||'')+' migrate(); renderAll();');
const req=n=>E('evalReq(TALENTS.find(t=>t.name==='+JSON.stringify(n)+').req, '+JSON.stringify(n)+').ok');
const held=n=>!!E('S.talents['+JSON.stringify(n)+']');

console.log('BOOT');
ok('builder boots clean', errs.length===0, errs[0]);

console.log('THE DATA');
ok('nine species', E('SPECIES.length')===9, E('SPECIES.map(s=>s.name).join(",")'));
const split=E('SPECIES.map(s=>s.name+":"+(s.lineages||[]).length).join(" ")');
ok('24 lineages, split Dragonborn 10 · Elf 3 · Gnome 2 · Goliath 6 · Tiefling 3',
   split==='Dragonborn:10 Dwarf:0 Elf:3 Gnome:2 Goliath:6 Halfling:0 Human:0 Orc:0 Tiefling:3', split);
ok('every lineage is a generated talent',
   E('SPECIES.every(s=>(s.lineages||[]).every(l=>TALENTS.some(t=>t.name==="Lineage - "+l.n)))'));
ok('the Lineage tag covers exactly 24 talents', E('TALENTS.filter(t=>(t.tags||[]).includes("Lineage")).length')===24);
ok('the Species tag covers exactly 33', E('TALENTS.filter(t=>(t.tags||[]).includes("Species")).length')===33);
const levelled=E('Object.keys(TM).filter(k=>k.startsWith("Lineage - ")&&TM[k].kind==="leveled"&&TM[k].max===3).sort().join(",")');
ok('only the six Elf and Tiefling lineages are leveled 1–3',
   levelled==='Lineage - Abyssal,Lineage - Chthonic,Lineage - Drow,Lineage - High Elf,Lineage - Infernal,Lineage - Wood Elf', levelled);
ok('a blank character has no species and no S.lineage field',
   E('blankChar().species')===null && !E('"lineage" in blankChar()'));

console.log('COSTS AND LOCKS');
fresh();
const r0=E('remaining()'); E('setSpecies("Elf")');
ok('picking a species costs nothing', E('remaining()')===r0, r0+' → '+E('remaining()'));
fresh();
ok('Lineage - Drow is locked with no species', req('Lineage - Drow')===false);
E('setSpecies("Elf")');
ok('and unlocked as an Elf', req('Lineage - Drow')===true);
ok('a draconic ancestry stays locked for an Elf', req('Lineage - Red')===false);
const r1=E('remaining()'); E('addTalent("Lineage - Wood Elf")');
ok('a lineage costs 1 point', held('Lineage - Wood Elf') && E('remaining()')===r1-1, r1+' → '+E('remaining()'));
E('lvlUp("Lineage - Wood Elf"); lvlUp("Lineage - Wood Elf"); lvlUp("Lineage - Wood Elf");');
ok('and stops at level 3', E('S.talents["Lineage - Wood Elf"].level')===3 && E('remaining()')===r1-3,
   'level '+E('S.talents["Lineage - Wood Elf"].level')+', remaining '+E('remaining()'));
E('addTalent("Lineage - Drow")');
ok('a second Elf lineage cannot be added while one is held', !held('Lineage - Drow'));
ok('and shows as locked', req('Lineage - Drow')===false);

console.log('DERIVED NUMBERS');
fresh(); E('setSpecies("Elf"); addTalent("Lineage - Drow");');
ok('Drow sees 120 ft', E('darkvisionFt()')===120, E('darkvisionFt()'));
fresh(); E('setSpecies("Elf"); addTalent("Lineage - Wood Elf");');
ok('Wood Elf walks 35 ft', E('baseSpeed()')===35, E('baseSpeed()'));
E('setSpecies("Dwarf")');
ok('switching species drops the lineage from the derived stats',
   E('curLineage()')===null && E('baseSpeed()')===30 && E('darkvisionFt()')===120,
   JSON.stringify([E('curLineage()'),E('baseSpeed()'),E('darkvisionFt()')]));
ok('the orphaned lineage talent is still held but reports its requirement unmet (the red "req!" chip)',
   held('Lineage - Wood Elf') && req('Lineage - Wood Elf')===false);
fresh(); E('setSpecies("Goliath")');
ok('Goliath walks 35 ft', E('baseSpeed()')===35);
fresh(); E('setSpecies("Halfling")');
ok('Halfling is Small', E('charSize()')==='Small');
fresh();
ok('no species: Medium, 30 ft, no darkvision',
   E('charSize()')==='Medium' && E('baseSpeed()')===30 && E('darkvisionFt()')===0);

console.log('BREATH WEAPON NEEDS AN ANCESTRY');
fresh(); E('setSpecies("Dragonborn")');
ok('Breath Weapon is locked before an ancestry', req('Breath Weapon')===false);
E('addTalent("Lineage - Red")');
ok('and unlocks once one is taken', held('Lineage - Red') && req('Breath Weapon')===true);
ok('the ancestry text names its own damage type',
   /fire/i.test(E('TALENTS.find(t=>t.name==="Lineage - Red").html')));

console.log('MIGRATING OLDER SAVES');
fresh('S.species="Elf"; S.talents["Elven Lineage"]={level:2,choices:[]}; S.lineage="Wood Elf";');
ok('Elven Lineage 2 + lineage "Wood Elf" becomes Lineage - Wood Elf at level 2',
   held('Lineage - Wood Elf') && E('S.talents["Lineage - Wood Elf"].level')===2 && !held('Elven Lineage'),
   JSON.stringify(E('JSON.stringify(S.talents)')));
ok('keeps the 35 ft speed', E('baseSpeed()')===35);
ok('and loses the stray S.lineage field', !E('"lineage" in S'));
fresh('S.species="Dragonborn"; S.lineage="Silver";');
ok('a Dragonborn with a free lineage "Silver" gains Lineage - Silver', held('Lineage - Silver'));
fresh('S.species="Warforged";');
ok('an unknown species is scrubbed to null', E('S.species')===null);
fresh('delete S.species; delete S.specSize;');
ok('a pre-species save loads at 30 ft and Medium', E('baseSpeed()')===30 && E('charSize()')==='Medium');

console.log('ROUND TRIP');
fresh(); E('setSpecies("Tiefling"); addTalent("Lineage - Infernal");');
const saved=E('JSON.stringify(S)');
fresh(); E('Object.assign(S, JSON.parse('+JSON.stringify(saved)+')); migrate(); renderAll();');
ok('species and lineage survive an export → import', E('S.species')==='Tiefling' && E('curLineage()')==='Infernal');

ok('no errors along the way', errs.length===0, errs[0]);
console.log('\n'+(fail?'FAILED':'ALL PASS')+'  —  '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
