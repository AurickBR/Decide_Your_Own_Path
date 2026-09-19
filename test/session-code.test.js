/* Session codes — the line that carries damage from the DM's screen to the player's sheet.
 *
 * Item 11 of `claude/PROJECT_REVIEW.md`: the DM applies damage in The Fray and the player types
 * the same number into their builder, twice, all evening. The table plays remotely, so the two
 * browsers can never reach each other and the carrier is a line of text pasted into chat.
 *
 * That makes the format a contract between two files, which is the drift hazard this project has
 * paid for before — so the codec is generated into both by `tools/build_session_code.py` and the
 * first block below asserts the two copies are byte-identical. The rest tests the three things
 * that would actually hurt at the table:
 *
 *   - a code mangled in transit being applied as if it were fine (checksum),
 *   - one player applying another player's numbers (name matching),
 *   - an update silently overwriting a maximum the sheet computes itself (clamping and warnings).
 *
 * Run:  npm install   (once)
 *       node test/session-code.test.js
 */
const fs=require('fs'), path=require('path'), {execFileSync}=require('child_process');
const {JSDOM,VirtualConsole}=require('jsdom');
const ROOT=path.join(__dirname,'..');
let pass=0,fail=0; const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL: '+n+(d?'   ['+d+']':'')));};

const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const OPEN='<!-- DYOP-SESSION start', CLOSE='<!-- DYOP-SESSION end -->';
function boot(f,url){
  const vc=new VirtualConsole(); const errs=[]; vc.on('jsdomError',e=>errs.push(e.message));
  const dom=new JSDOM(read(f),{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,url});
  return {w:dom.window, errs, E:c=>dom.window.eval(c)};
}

console.log('ONE CODEC, TWO FILES');
{
  const blocks={};
  for(const f of ['encounter-control.html','character-builder-2.html']){
    const html=read(f);
    ok(f+' carries exactly one codec block', html.split(OPEN).length-1===1);
    const a=html.indexOf(OPEN), b=html.indexOf(CLOSE,a);
    blocks[f]=html.slice(a,b+CLOSE.length);
  }
  ok('the two copies are byte-identical',
     blocks['encounter-control.html']===blocks['character-builder-2.html']);
  let checkOk=true, out='';
  try{ execFileSync('python3',[path.join(ROOT,'tools','build_session_code.py'),'--check'],{encoding:'utf8'}); }
  catch(e){ checkOk=false; out=(e.stdout||'')+(e.stderr||''); }
  ok('tools/build_session_code.py --check passes', checkOk, out.trim().split('\n').pop());
  ok('the codec sits before the build stamp', ['encounter-control.html','character-builder-2.html']
     .every(f=>read(f).indexOf(OPEN) < read(f).indexOf('<!-- build stamp')));
}

const F=boot('encounter-control.html','file:///encounter-control.html');
const B=boot('character-builder-2.html','https://localhost/');
const SC=F.w.DYOP_SESSION;
const TS=1789786816230;
const FULL={name:'Kesh', hp:{c:14,m:20}, thp:2, tp:{c:1,m:3}, mana:{c:6,m:12}, exh:3, cond:['Prone','Grappled']};

console.log('THE CODE ITSELF');
{
  ok('the Fray boots clean', F.errs.length===0, F.errs[0]);
  ok('the builder boots clean', B.errs.length===0, B.errs[0]);
  ok('both expose the codec', !!SC && !!B.w.DYOP_SESSION);

  const code=SC.encode(FULL,TS);
  ok('it is one line', code.indexOf('\n')===-1);
  ok('it is short enough to paste anywhere', code.length<200, code.length);
  ok('it announces its version', code.indexOf('DYOP1|')===0, code.slice(0,12));
  ok('it is readable at a glance', /\|hp:14\/20\|/.test(code), code);

  const r=SC.decode(code);
  ok('it decodes', r.ok===true, r.err);
  ok('the name survives', r.v.name==='Kesh');
  ok('hit points survive', r.v.hp.c===14 && r.v.hp.m===20);
  ok('temporary hit points survive', r.v.thp===2);
  ok('talent points survive', r.v.tp.c===1 && r.v.tp.m===3);
  ok('mana survives', r.v.mana.c===6 && r.v.mana.m===12);
  ok('exhaustion survives', r.v.exh===3);
  ok('conditions survive, in order', r.v.cond.join('|')==='Prone|Grappled');
  ok('the timestamp survives', r.v.ts===Math.floor(TS/1000), r.v.ts);
  ok('decoding is repeatable', JSON.stringify(SC.decode(code))===JSON.stringify(r));
}

console.log('POOLS THE CHARACTER DOES NOT HAVE ARE ABSENT');
{
  const code=SC.encode({name:'Brann', hp:{c:9,m:9}, thp:0, tp:{c:0,m:0}, mana:{c:0,m:0}, exh:0, cond:[]},TS);
  ok('no talent-point field', code.indexOf('|tp:')===-1, code);
  ok('no mana field', code.indexOf('|mana:')===-1, code);
  const v=SC.decode(code).v;
  ok('and the decoder reports them as not sent', v.tp===null && v.mana===null);
  ok('an empty condition list round-trips as empty', Array.isArray(v.cond) && v.cond.length===0);
  ok('zero is still sent when the pool exists', v.thp===0 && v.exh===0);
}

console.log('A CODE DAMAGED IN TRANSIT IS REFUSED');
{
  const code=SC.encode(FULL,TS);
  const bad=[['a changed digit', code.replace('hp:14','hp:19')],
             ['a truncated tail', code.slice(0,-1)],
             ['a lost field', code.replace('|exh:3','')],
             ['an extra character', code+'x'],
             ['a swapped name', code.replace('Kesh','Brann')]];
  for(const [what,c] of bad){
    const r=SC.decode(c);
    ok('rejects '+what, r.ok===false, JSON.stringify(r).slice(0,80));
    if(!r.ok) ok('and says so in plain words: '+what, /damaged|malformed|incomplete|not a session/.test(r.err), r.err);
  }
  ok('an empty string is refused', SC.decode('').ok===false);
  ok('a sentence is refused', SC.decode('hi there').ok===false);
  ok('a wrong version is refused', SC.decode('DYOP9|Kesh|hp:1/1|cond:|ts:1|abcd').ok===false);
  ok('a very long string is refused rather than parsed',
     SC.decode('DYOP1|'+'x'.repeat(500)).ok===false);
  ok('null is refused', SC.decode(null).ok===false);
}

console.log('NOTHING CAN BREAK OUT OF A FIELD');
{
  const nasty='Ke|sh:<img src=x onerror=alert(1)> "\'`';
  const code=SC.encode({name:nasty, hp:{c:1,m:2}, cond:['a,b','<svg onload=1>']},TS);
  ok('the separators are encoded away', code.split('|').length===6, code);
  const v=SC.decode(code).v;
  ok('the hostile name round-trips exactly', v.name===nasty, v.name);
  ok('a condition containing a comma survives', v.cond[0]==='a,b', JSON.stringify(v.cond));
  ok('and one containing markup', v.cond[1]==='<svg onload=1>');
  ok('no raw angle bracket rides in the code', code.indexOf('<')===-1, code);
}

console.log('FORWARD COMPATIBILITY');
{
  /* A newer Fray may add a field. An older sheet must ignore it, not choke — the checksum still
     covers the whole line, so this cannot be used to smuggle anything past the check. */
  const parts=['DYOP1','Kesh','hp:5/9','speed:25','cond:'];
  const body=parts.join('|');
  const code=body+'|'+SC.sum(body);
  const r=SC.decode(code);
  ok('an unknown field is ignored', r.ok===true, r.err);
  ok('and the known ones still decode', r.ok && r.v.hp.c===5);
  ok('but a bad checksum with an unknown field still fails', SC.decode(body+'|zzzz').ok===false);
}

console.log('PICKING ONE LINE OUT OF A BLOCK');
{
  const kesh=SC.encode({name:'Kesh',  hp:{c:14,m:20}, cond:[]},TS);
  const bran=SC.encode({name:'Brann', hp:{c:3,m:11},  cond:[]},TS);
  const block='Party after round 3:\n'+kesh+'\n'+bran+'\nsee you next week';

  let r=SC.pick(kesh,'Kesh');
  ok('a single line matches its own name', r.ok===true, r.err);
  r=SC.pick(block,'Brann');
  ok('a block finds the right line', r.ok && r.v.hp.c===3, r.ok?r.v.hp.c:r.err);
  ok('and reports who else was in it', r.names.join(',')==='Kesh,Brann', (r.names||[]).join(','));
  ok('surrounding chatter is ignored', SC.pick(block,'Kesh').v.hp.c===14);
  ok('matching ignores case', SC.pick(block,'kesh').ok===true);
  ok('matching ignores stray spaces', SC.pick(block,'  Kesh ').ok===true);

  r=SC.pick(block,'Nobody');
  ok('a name that is not there is refused', r.ok===false);
  ok('and the refusal names the alternatives', (r.names||[]).length===2, JSON.stringify(r.names));
  ok('plain chat is refused', SC.pick('hello everyone','Kesh').ok===false);
  ok('a damaged line does not hide a good one',
     SC.pick(kesh.slice(0,-1)+'\n'+bran,'Brann').ok===true);
  ok('a block of only damaged lines reports the damage',
     /damaged/.test(SC.pick(kesh.slice(0,-1),'Kesh').err||''), SC.pick(kesh.slice(0,-1),'Kesh').err);
}

console.log('BOTH TOOLS SPEAK IT IDENTICALLY');
{
  const a=SC.encode(FULL,TS), b=B.w.DYOP_SESSION.encode(FULL,TS);
  ok('the same payload gives the same code', a===b, a+' vs '+b);
  ok('the sheet decodes what the Fray wrote',
     JSON.stringify(B.w.DYOP_SESSION.decode(a))===JSON.stringify(SC.decode(a)));
  ok('and the checksums agree', SC.sum('x|y')===B.w.DYOP_SESSION.sum('x|y'));
}

console.log('THE FRAY BUILDS ONE FROM A COMBATANT');
{
  const fray=F.w.__fray;
  fray.hydrate({cs:[
    {id:'p1',name:'Kesh',side:'pc',ac:14,hp:{c:14,m:20},thp:2,tp:{c:1,m:3},mana:{c:6,m:12},exh:3,cond:[{n:'Prone',r:2}]},
    {id:'p2',name:'Brann',side:'pc',ac:16,hp:{c:3,m:11}},
    {id:'f1',name:'Gnasher',side:'foe',ac:12,hp:{c:5,m:9}},
    {id:'a1',name:'Hound',side:'ally',ac:11,hp:{c:6,m:6}}], started:false});
  fray.renderAll();
  const d=F.w.document;

  const p=fray.updatePayload(fray.byId('p1'));
  ok('the payload carries the vitals', p.hp.c===14 && p.thp===2 && p.mana.c===6);
  ok('and the exhaustion level', p.exh===3);
  ok('and the condition names only', p.cond.join()==='Prone', JSON.stringify(p.cond));
  ok('the code decodes back to the same numbers', (()=>{
    const v=SC.decode(fray.updateCode(fray.byId('p1'))).v;
    return v.hp.c===14 && v.exh===3 && v.cond[0]==='Prone';
  })());

  ok('every player character offers an update', d.querySelectorAll('[data-sendupd]').length===2,
     d.querySelectorAll('[data-sendupd]').length);
  ok('the monster does not', !d.querySelector('[data-sendupd="f1"]'));
  ok('nor does an NPC ally', !d.querySelector('[data-sendupd="a1"]'));
  ok('there is a button for the whole party', !!d.querySelector('#btnSendParty'));

  const block=[fray.byId('p1'),fray.byId('p2')].map(fray.updateCode).join('\n');
  ok('a party block is one line per player', block.split('\n').length===2);
  ok('and each player finds their own line',
     SC.pick(block,'Brann').v.hp.c===3 && SC.pick(block,'Kesh').v.hp.c===14);

  fray.hydrate({cs:[{id:'f1',name:'Gnasher',side:'foe',ac:12,hp:{c:5,m:9}}]});
  fray.renderAll();
  ok('with no players there is no party button', !F.w.document.querySelector('#btnSendParty'));
}

console.log('THE SHEET READS IT');
const E=B.E;
function sheet(name, level, play, conds){
  E('S.name='+JSON.stringify(name)+'; S.level='+level+'; S.play='+JSON.stringify(play||{})+
    '; S.conds='+JSON.stringify(conds||{})+'; UI.view="sheet"; renderAll();');
}
{
  sheet('Kesh',5,{});
  const maxHP=E('hpMax()');
  const code=SC.encode({name:'Kesh', hp:{c:4,m:maxHP}, thp:2, exh:3, cond:['Prone']},TS);
  E('upd.open=true; upd.text='+JSON.stringify(code)+'; updRead();');
  ok('a matching code is read', E('!!upd.v')===true, E('upd.err'));
  ok('with no error', E('upd.err')==='');

  const d=JSON.parse(E('JSON.stringify(updDiff(upd.v))'));
  ok('hit points are a row', d.rows.some(r=>r.k==='hp' && r.to===4), JSON.stringify(d.rows));
  ok('temporary hit points are a row', d.rows.some(r=>r.k==='thp' && r.to===2));
  ok('exhaustion is a row', d.rows.some(r=>r.k==='exh' && r.to===3));
  ok('the condition is listed as added', d.added.join()==='Prone', JSON.stringify(d.added));
  ok('nothing is removed', d.removed.length===0);
  ok('no warning when the maxima agree', d.warn.length===0, JSON.stringify(d.warn));

  E('updApply()');
  ok('applying writes hit points', E('curHP()')===4, E('curHP()'));
  ok('and temporary hit points', E('curTHP()')===2);
  ok('and exhaustion', E('curExh()')===3);
  ok('and the condition', E('JSON.stringify(condsOn())')==='["Prone"]', E('JSON.stringify(condsOn())'));
  ok('the panel closes itself', E('upd.open')===false && E('upd.v')===null);
  ok('and it remembers when the update was from', E('S.play.lastUpd')===Math.floor(TS/1000));
}

console.log('THE SHEET OWNS ITS MAXIMA');
{
  sheet('Kesh',5,{hp:3});                 /* wounded, so a clamp to the maximum is a real change */
  const mine=E('hpMax()');
  const code=SC.encode({name:'Kesh', hp:{c:999,m:mine+40}, cond:[]},TS);
  E('upd.text='+JSON.stringify(code)+'; updRead();');
  const d=JSON.parse(E('JSON.stringify(updDiff(upd.v))'));
  ok('a current above the sheet maximum is clamped to it',
     d.rows.find(r=>r.k==='hp').to===mine, JSON.stringify(d.rows));
  ok('and the disagreement is reported, not silently applied',
     d.warn.some(w=>/maximum hit points/.test(w)), JSON.stringify(d.warn));
  E('updApply()');
  ok('the sheet keeps its own maximum', E('hpMax()')===mine);
  ok('and hit points land on it', E('curHP()')===mine);
}

console.log('AN UPDATE THAT CHANGES NOTHING SAYS SO');
{
  sheet('Kesh',5,{});
  const code=SC.encode({name:'Kesh', hp:{c:E('curHP()'),m:E('hpMax()')}, cond:[]},TS+1000);
  E('upd.text='+JSON.stringify(code)+'; updRead();');
  const d=JSON.parse(E('JSON.stringify(updDiff(upd.v))'));
  ok('the diff is empty', d.empty===true, JSON.stringify(d.rows));
  ok('and the panel offers to dismiss it', /Dismiss/.test(E('updWrapHTML()')));
}

console.log('OUT OF ORDER, AND OUT OF SCOPE');
{
  sheet('Kesh',5,{lastUpd:Math.floor(TS/1000)});
  const older=SC.encode({name:'Kesh', hp:{c:1,m:E('hpMax()')}, cond:[]},TS-600000);
  E('upd.text='+JSON.stringify(older)+'; updRead();');
  const d=JSON.parse(E('JSON.stringify(updDiff(upd.v))'));
  ok('an older code is flagged', d.warn.some(w=>/older/.test(w)), JSON.stringify(d.warn));
  ok('but still applies if the player insists', (E('updApply()'), E('curHP()'))===1, E('curHP()'));

  sheet('Kesh',5,{});
  const other=SC.encode({name:'Brann', hp:{c:1,m:9}, cond:[]},TS);
  E('upd.text='+JSON.stringify(other)+'; updRead();');
  ok('another character\'s update is refused', E('upd.v')===null);
  ok('and the refusal explains itself', /not for this character/.test(E('upd.err')), E('upd.err'));
  ok('naming who it was for', /Brann/.test(E('JSON.stringify(upd.names)')), E('JSON.stringify(upd.names)'));
  ok('the sheet is untouched', E('curHP()')===E('hpMax()'));
}

console.log('CONDITIONS: REPLACED, NOT MERGED');
{
  sheet('Kesh',5,{},{Prone:{note:'until dawn'},Charmed:{note:''}});
  const code=SC.encode({name:'Kesh', cond:['Prone','Poisoned']},TS);
  E('upd.text='+JSON.stringify(code)+'; updRead();');
  const d=JSON.parse(E('JSON.stringify(updDiff(upd.v))'));
  ok('the new one is added', d.added.join()==='Poisoned', JSON.stringify(d.added));
  ok('the missing one is removed', d.removed.join()==='Charmed', JSON.stringify(d.removed));
  E('updApply()');
  ok('the set matches the code', E('JSON.stringify(condsOn())')==='["Poisoned","Prone"]', E('JSON.stringify(condsOn())'));
  ok('a note the player wrote survives', E('S.conds.Prone.note')==='until dawn', E('S.conds.Prone.note'));
}
{
  sheet('Kesh',5,{},{});
  const code=SC.encode({name:'Kesh', cond:['Prone','Bewildered']},TS);
  E('upd.text='+JSON.stringify(code)+'; updRead();');
  const d=JSON.parse(E('JSON.stringify(updDiff(upd.v))'));
  ok('a condition this sheet does not know is not applied', d.added.join()==='Prone', JSON.stringify(d.added));
  ok('and it is reported', d.warn.some(w=>/Bewildered/.test(w)), JSON.stringify(d.warn));
  E('updApply()');
  ok('only the known one landed', E('JSON.stringify(condsOn())')==='["Prone"]');
}

console.log('APPLYING TWICE IS HARMLESS');
{
  sheet('Kesh',5,{});
  const code=SC.encode({name:'Kesh', hp:{c:7,m:E('hpMax()')}, cond:['Prone']},TS);
  E('upd.text='+JSON.stringify(code)+'; updRead(); updApply();');
  const first=E('curHP()');
  E('upd.open=true; upd.text='+JSON.stringify(code)+'; updRead(); updApply();');
  ok('the second application changes nothing', E('curHP()')===first && first===7, E('curHP()'));
  ok('and the conditions are unchanged', E('JSON.stringify(condsOn())')==='["Prone"]');
}

console.log('IGNORING IT');
{
  sheet('Kesh',5,{});
  const before=E('curHP()');
  const code=SC.encode({name:'Kesh', hp:{c:1,m:E('hpMax()')}, cond:[]},TS);
  E('upd.open=true; upd.text='+JSON.stringify(code)+'; updRead();');
  ok('it is staged', E('!!upd.v')===true);
  E('updClear(); renderSheetView();');
  ok('ignoring drops it', E('upd.v')===null && E('upd.text')==='');
  ok('and the sheet is untouched', E('curHP()')===before);
}

console.log('NOTHING FROM A CODE REACHES THE PAGE AS MARKUP');
{
  sheet('Kesh',5,{});
  const nasty=SC.encode({name:'<img src=x onerror=alert(1)>', hp:{c:1,m:9},
                         cond:['<svg onload=alert(1)>']},TS);
  E('upd.open=true; upd.text='+JSON.stringify(nasty)+'; updRead();');
  ok('a code for someone else is refused before anything renders', E('upd.v')===null);
  const html=E('updWrapHTML()');
  ok('the refusal escapes the hostile name', html.indexOf('<img')===-1, html.slice(0,200));

  /* and the same payload addressed to this character, so it reaches the diff */
  E('S.name="<img src=x onerror=alert(1)>"; renderAll(); upd.open=true; upd.text='+JSON.stringify(nasty)+'; updRead();');
  ok('now it is accepted', E('!!upd.v')===true, E('upd.err'));
  const html2=E('updWrapHTML()');
  ok('the name is escaped in the panel', html2.indexOf('<img')===-1);
  ok('the condition warning is escaped too', html2.indexOf('<svg')===-1);
  E('renderSheetView()');
  const doc=B.w.document;
  ok('no image element was created', doc.querySelectorAll('.upd-wrap img').length===0);
  ok('no inline handler reached the panel', (()=>{
    const w=doc.querySelector('.upd-wrap');
    return !w || [...w.querySelectorAll('*')].every(e=>![...e.attributes].some(a=>/^on/i.test(a.name)));
  })());
  ok('the builder never threw', B.errs.length===0, B.errs[0]);
}

console.log('\n  %d passed, %d failed', pass, fail);
process.exit(fail?1:0);
