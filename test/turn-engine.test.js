/* The Fray's turn engine — initiative order, the rotating queue, and condition expiry.
 *
 * This is the code an evening of play runs hundreds of times and nothing has ever checked. The
 * parts that can go wrong quietly:
 *
 *   - `sortCs()` is a four-level comparator (init, initMod, DEX, name). A wrong level only shows
 *     up on a tie, which is exactly when the table is watching.
 *   - `S.cs` is kept in initiative order while the roster is DRAWN as a rotating queue, so the
 *     active creature's index moves whenever anything re-sorts. `S.activeId` is an id precisely
 *     so that re-sorting mid-fight does not hand the turn to someone else — asserted below.
 *   - `tickConditions()` runs on the creature whose turn is BEGINNING, and mutates `cd.r` in
 *     place. An off-by-one there means a condition lasts one round too long, every time.
 *
 * Run:  npm install   (once)
 *       node test/turn-engine.test.js
 */
const fs=require('fs'), path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
const ROOT=path.join(__dirname,'..');
let pass=0,fail=0; const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL: '+n+(d?'   ['+d+']':'')));};

const SRC=fs.readFileSync(path.join(ROOT,'encounter-control.html'),'utf8');
function boot(){
  const vc=new VirtualConsole(); const errs=[]; vc.on('jsdomError',e=>errs.push(e.message));
  const dom=new JSDOM(SRC,{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
    url:'file:///encounter-control.html'});     /* __fray is local-only, by design */
  return {w:dom.window, errs, F:dom.window.__fray};
}
/* A combatant with everything the engine reads and nothing it doesn't. */
const C=(id,name,init,o)=>Object.assign({id,name,side:'foe',ac:12,initMod:0,init,
  hp:{c:10,m:10}, thp:0, tp:{c:0,m:0}, mana:{c:0,m:0}, cond:[], note:'', blk:null}, o||{});
const dex=n=>({blk:{attr:{DEX:n},atk:[],tr:[],senses:'',note:'',pb:0,sp:'',sec:'x'}});

const B=boot();
const F=B.F;
const names=()=>F.S.cs.map(c=>c.name).join(' ');
const active=()=>{ const c=F.byId(F.S.activeId); return c?c.name:null; };
function setup(cs, extra){ F.hydrate(Object.assign({cs, started:false, round:1, activeId:null}, extra||{})); }

console.log('IT BOOTS WITH THE HOOK IT NEEDS');
ok('the Fray boots clean', B.errs.length===0, B.errs[0]);
ok('the local-only hook is there', !!F);
for(const n of ['sortCs','startEncounter','nextTurn','prevTurn','endEncounter',
                'tickConditions','isDown','activeIdx','firstLive','dexOf','displayOrder'])
  ok('__fray exposes '+n, typeof F[n]==='function', typeof F[n]);

console.log('INITIATIVE ORDER');
{
  setup([C('a','Ash',12), C('b','Brand',20), C('c','Cinder',7)]);
  F.sortCs();
  ok('highest initiative first', names()==='Brand Ash Cinder', names());
}
{
  setup([C('a','Ash',12,{initMod:1}), C('b','Brand',12,{initMod:5})]);
  F.sortCs();
  ok('a tie breaks on the initiative modifier', names()==='Brand Ash', names());
}
{
  setup([C('a','Ash',12,Object.assign({initMod:2},dex(10))), C('b','Brand',12,Object.assign({initMod:2},dex(18)))]);
  F.sortCs();
  ok('then on DEX', names()==='Brand Ash', names());
  ok('dexOf defaults to 10 without a stat block', F.dexOf({})===10, F.dexOf({}));
  ok('and reads the block when there is one', F.dexOf(F.S.cs[0])===18, F.dexOf(F.S.cs[0]));
}
{
  setup([C('b','Brand',12), C('a','Ash',12)]);
  F.sortCs();
  ok('then alphabetically', names()==='Ash Brand', names());
}
{
  setup([C('a','Ash',null), C('b','Brand',3)]);
  F.sortCs();
  ok('an unrolled combatant sorts last', names()==='Brand Ash', names());
}
{
  setup([C('a','Ash',12)]);
  F.sortCs();
  ok('sorting one combatant is harmless', names()==='Ash');
  setup([]);
  F.sortCs();
  ok('sorting an empty roster is harmless', F.S.cs.length===0);
}

console.log('THE FIGHT STARTS');
{
  setup([C('a','Ash',12), C('b','Brand',20), C('c','Cinder',7)]);
  F.startEncounter();
  ok('it is round 1', F.S.round===1, F.S.round);
  ok('the fight is on', F.S.started===true);
  ok('the roster is in initiative order', names()==='Brand Ash Cinder', names());
  ok('the highest roll acts first', active()==='Brand', active());
  ok('and heads the queue', F.displayOrder()[0].name==='Brand');
}
{
  setup([]);
  F.startEncounter();
  ok('an empty roster cannot start a fight', F.S.started===false);
}

console.log('GOING ROUND');
{
  setup([C('a','Ash',12), C('b','Brand',20), C('c','Cinder',7)]);
  F.startEncounter();
  F.nextTurn(); ok('the turn passes down the order', active()==='Ash', active());
  F.nextTurn(); ok('and again', active()==='Cinder', active());
  ok('still round 1', F.S.round===1, F.S.round);
  F.nextTurn();
  ok('the last turn wraps to the top', active()==='Brand', active());
  ok('and that is round 2', F.S.round===2, F.S.round);
  ok('the queue rotates with it', F.displayOrder().map(c=>c.name).join(' ')==='Brand Ash Cinder');
  F.nextTurn();
  ok('the queue puts whoever is acting at the head',
     F.displayOrder().map(c=>c.name).join(' ')==='Ash Cinder Brand',
     F.displayOrder().map(c=>c.name).join(' '));
}
{
  setup([C('a','Ash',12), C('b','Brand',20)]);
  F.startEncounter();
  F.nextTurn(); F.nextTurn();
  ok('a full round returns to the first combatant', active()==='Brand');
  F.prevTurn();
  ok('stepping back goes to the previous combatant', active()==='Ash', active());
  ok('and gives back the round', F.S.round===1, F.S.round);
  F.prevTurn(); F.prevTurn();
  ok('the round never falls below 1', F.S.round===1, F.S.round);
}
{
  setup([C('a','Ash',12)]);
  F.startEncounter();
  F.nextTurn();
  ok('a lone combatant still advances the round', F.S.round===2, F.S.round);
  ok('and is still the one acting', active()==='Ash');
}
{
  setup([C('a','Ash',12)]);
  ok('nextTurn does nothing before the fight starts',
     (F.nextTurn(), F.S.activeId===null), F.S.activeId);
  ok('nor does prevTurn', (F.prevTurn(), F.S.activeId===null));
}

console.log('THE FALLEN ARE SKIPPED');
{
  setup([C('a','Ash',12), C('b','Brand',20), C('c','Cinder',7)]);
  F.byId('a').hp.c = 0;                      /* Ash drops; in initiative order that is Brand Ash Cinder */
  F.startEncounter();
  ok('a downed combatant reads as down', F.isDown(F.byId('a'))===true);
  ok('a standing one does not', F.isDown(F.byId('b'))===false);
  ok('skipDown is on by default', F.S.skipDown===true);
  ok('the fight starts on someone standing', active()==='Brand', active());
  F.nextTurn();
  ok('the downed combatant is skipped', active()==='Cinder', active());
  F.nextTurn();
  ok('and the round still turns over', F.S.round===2 && active()==='Brand', active()+' r'+F.S.round);
}
{
  setup([C('a','Ash',12), C('b','Brand',20)]);
  F.S.cs.forEach(c=>c.hp.c=0);
  F.startEncounter();
  ok('when everyone is down the fight does not freeze', active()!==null, active());
  const first=active();
  F.nextTurn();
  ok('turns keep passing', active()!==first, active());
}
{
  setup([C('a','Ash',12), C('b','Brand',20), C('c','Cinder',7)], {skipDown:false});
  F.S.cs.find(c=>c.name==='Ash').hp.c = 0;
  F.startEncounter();
  F.nextTurn();
  ok('with skipDown off a downed combatant still gets its turn', active()==='Ash', active());
}
{
  setup([C('a','Ash',12,{hp:{c:0,m:0}})]);
  ok('a 0-max combatant is not "down" — it has no hit points to lose',
     F.isDown(F.S.cs[0])===false);
}

console.log('THE ACTIVE COMBATANT SURVIVES A RE-SORT');
{
  setup([C('a','Ash',12), C('b','Brand',20), C('c','Cinder',7)]);
  F.startEncounter();
  F.nextTurn();
  ok('Ash is acting, second in the order', active()==='Ash' && F.activeIdx()===1, F.activeIdx());
  F.byId('c').init = 99;                     /* Cinder rolls again mid-fight and leaps to the top */
  F.sortCs();
  ok('the order changed', names()==='Cinder Brand Ash', names());
  ok('but the same creature is still acting', active()==='Ash', active());
  ok('its index moved', F.activeIdx()===2, F.activeIdx());
  ok('and the queue still heads on it', F.displayOrder()[0].name==='Ash');
  F.nextTurn();
  ok('the next turn follows the NEW order', active()==='Cinder' && F.S.round===2,
     active()+' r'+F.S.round);
}

console.log('CONDITIONS COUNT DOWN ON THE TURN THEY BEGIN');
{
  setup([C('a','Ash',12,{cond:[{n:'Prone',r:2},{n:'Charmed',r:null}]}), C('b','Brand',20)]);
  F.startEncounter();                        /* Brand acts first, so Ash is untouched */
  ok('a condition on someone else is untouched', F.byId('a').cond[0].r===2, F.byId('a').cond[0].r);
  F.nextTurn();                              /* Ash's turn begins */
  ok('the counter drops on their turn', F.byId('a').cond[0].r===1, F.byId('a').cond[0].r);
  ok('it has not expired yet', F.byId('a').cond.some(c=>c.n==='Prone'));
  F.nextTurn(); F.nextTurn();                /* round 2, Ash again */
  ok('and on the next turn it ends', !F.byId('a').cond.some(c=>c.n==='Prone'),
     JSON.stringify(F.byId('a').cond));
  ok('an open-ended condition never expires', F.byId('a').cond.some(c=>c.n==='Charmed'));
  ok('the end was written to the combat record',
     F.S.log.some(l=>F.partsText(l.p).indexOf('Prone ends')>-1),
     F.S.log.slice(-3).map(l=>F.partsText(l.p)).join(' | '));
}
{
  setup([C('a','Ash',12,{cond:[{n:'Stunned',r:1}]})]);
  F.startEncounter();
  ok('a 1-round condition ends as the bearer\'s first turn begins',
     F.byId('a').cond.length===0, JSON.stringify(F.byId('a').cond));
}
{
  setup([C('a','Ash',12,{cond:[{n:'Prone',r:3}]})]);
  F.startEncounter();                        /* starting the fight ticks the first combatant: 3 → 2 */
  ok('starting the fight ticks whoever acts first', F.byId('a').cond[0].r===2, F.byId('a').cond[0].r);
  F.prevTurn();
  ok('stepping backwards does not tick a condition', F.byId('a').cond[0].r===2,
     F.byId('a').cond[0].r);
}
{
  setup([C('a','Ash',12)]);
  F.tickConditions('no-such-id');
  ok('ticking an id that is not there is harmless', true);
  F.tickConditions(null);
  ok('and so is ticking nothing', true);
}

console.log('LEAVING THE FRAY');
{
  setup([C('a','Ash',12), C('b','Brand',20), C('c','Cinder',7)]);
  F.startEncounter(); F.nextTurn();
  const wasActive=F.S.activeId;
  F.S.cs = F.S.cs.filter(c=>c.id!=='c');     /* Cinder is removed, not the one acting */
  ok('removing someone else leaves the turn alone', F.S.activeId===wasActive);
  ok('and the order is still sane', F.activeIdx()>-1, F.activeIdx());
}
{
  setup([C('a','Ash',12), C('b','Brand',20)]);
  F.startEncounter();
  F.endEncounter();
  ok('ending the fight clears the active combatant', F.S.activeId===null);
  ok('and resets the round', F.S.round===1);
  ok('and stops the fight', F.S.started===false);
  ok('but keeps the roster', F.S.cs.length===2, F.S.cs.length);
}

console.log('\n  %d passed, %d failed', pass, fail);
process.exit(fail?1:0);
