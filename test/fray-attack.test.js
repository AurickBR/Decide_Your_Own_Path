/* Attack resolution in The Fray — the DM's half of the house rule.
 *
 * `test/attack.test.js` covers the Character Builder's panel, which is a PORT of this code. This
 * suite covers the original. Both have to agree, because the table watches both at once: the
 * player rolls on their sheet, the DM rolls the monster in here, and a divergence is the kind of
 * thing that gets argued about rather than noticed.
 *
 * The rule (claude/ATTACK_RULE.md): no to-hit roll — the damage roll IS the attack. Each weapon
 * die explodes independently on its own maximum, flat bonuses are added, and the target's AC is
 * subtracted as damage reduction. Dice riding on the weapon roll only on a hit, and never explode.
 *
 * What only exists on this side: the target picker (`eligibleTargets`), which lets a charmed
 * creature swing at its own side, and `applyAttack`, which commits damage through the normal path
 * so temporary hit points are spent first.
 *
 * Run:  npm install   (once)
 *       node test/fray-attack.test.js
 */
const fs=require('fs'), path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
const ROOT=path.join(__dirname,'..');
let pass=0,fail=0; const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL: '+n+(d?'   ['+d+']':'')));};

const vc=new VirtualConsole(); const errs=[]; vc.on('jsdomError',e=>errs.push(e.message));
const dom=new JSDOM(fs.readFileSync(path.join(ROOT,'encounter-control.html'),'utf8'),
  {runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,url:'file:///encounter-control.html'});
const w=dom.window, F=w.__fray;

/* Seed exact die faces. rollDie(N) = 1+floor(random()*N), so to force v on a dN return (v-1)/N.
   Each entry carries its own die size, so mixed d6/d8 draws work. Math.random is always restored:
   uid() depends on it, and a stubbed one poisons every later block. */
let queue=[]; const realRandom=w.Math.random;
const seed=p=>{ queue=p.slice(); w.Math.random=()=>{ const e=queue.shift();
  if(!e) throw new Error('dice queue exhausted'); return (e[0]-1)/e[1]; }; };
const left=()=>queue.length;
const unseed=()=>{ w.Math.random=realRandom; queue=[]; };

const atkOf=d=>({n:'Claw', d});
const C=(id,name,side,o)=>Object.assign({id,name,side,ac:12,initMod:0,init:10,
  hp:{c:20,m:20}, thp:0, tp:{c:0,m:0}, mana:{c:0,m:0}, cond:[], note:'', blk:null}, o||{});
const withAtk=d=>({blk:{attr:{},atk:[atkOf(d)],tr:[],senses:'',note:'',pb:0,sp:'',sec:'x'}});
function roster(cs){ F.hydrate({cs, started:true, round:1, activeId:cs[0]&&cs[0].id}); }
function attack(cid, opts){
  F.ui.atk=Object.assign({cid, ai:0, target:null, bonus:0, rider:'', result:null}, opts||{});
  F.resolveAttack();
  return F.ui.atk.result;
}

console.log('BOOT');
ok('the Fray boots clean', errs.length===0, errs[0]);
for(const n of ['explodeDie','rollExploding','parseDmg','parseRider','resolveAttack',
                'applyAttack','eligibleTargets','isCharmed','damage'])
  ok('__fray exposes '+n, typeof F[n]==='function', typeof F[n]);

console.log('THE DICE');
{
  seed([[3,6]]);
  ok('an ordinary die is a chain of one', JSON.stringify(F.explodeDie(6))==='[3]');
  ok('and draws once', left()===0);

  seed([[6,6],[2,6]]);
  ok('a maximum explodes', JSON.stringify(F.explodeDie(6))==='[6,2]');

  seed([[6,6],[6,6],[6,6],[1,6]]);
  ok('and keeps exploding while it maxes', JSON.stringify(F.explodeDie(6))==='[6,6,6,1]');

  seed([[6,6],[3,6],[4,6]]);
  const chains=F.rollExploding(2,6);
  ok('each die of a multi-die weapon explodes on its own',
     JSON.stringify(chains)==='[[6,3],[4]]', JSON.stringify(chains));
  ok('the second die was not dragged into the first\'s chain', chains[1].length===1);

  seed(Array.from({length:40},()=>[6,6]));
  const runaway=F.explodeDie(6);
  ok('a runaway chain is capped at 30', runaway.length===30, runaway.length);
  ok('the cap left dice unspent rather than looping forever', left()>0);

  seed([[1,1]]);
  ok('a d1 never explodes', JSON.stringify(F.explodeDie(1))==='[1]');
  unseed();
}

console.log('READING A DAMAGE LINE');
{
  const P=s=>JSON.parse(JSON.stringify(F.parseDmg(s)));
  ok('"2d6 +3" parses', JSON.stringify(P('2d6 +3'))==='{"qty":2,"sides":6,"mod":3}', JSON.stringify(P('2d6 +3')));
  ok('a minus is kept', F.parseDmg('1d8 -1').mod===-1, F.parseDmg('1d8 -1').mod);
  ok('no modifier is zero', F.parseDmg('4d6').mod===0);
  ok('spaces around the d are tolerated', F.parseDmg('2 d 10').sides===10);
  ok('a huge quantity is clamped', F.parseDmg('99d6').qty===20, F.parseDmg('99d6').qty);
  ok('junk parses to nothing', F.parseDmg('a sharp stick')===null);
  ok('an empty string parses to nothing', F.parseDmg('')===null);
  ok('null parses to nothing', F.parseDmg(null)===null);

  ok('a rider keeps its damage type', F.parseRider('1d6 fire').type==='fire', F.parseRider('1d6 fire').type);
  ok('and its modifier', F.parseRider('2d4 +1 necrotic').mod===1);
  ok('a typeless rider has no type', F.parseRider('1d6').type==='');
  ok('the die notation is not mistaken for a type', F.parseRider('2d6').type==='');
  ok('junk is not a rider', F.parseRider('nothing')===null);
}

console.log('THE MATHS, WITH NO TARGET');
{
  roster([C('a','Gnasher','foe',withAtk('2d6 +3'))]);
  seed([[4,6],[2,6]]);
  const r=attack('a',{bonus:3});
  ok('the base is the sum of the dice', r.base===6, r.base);
  ok('the bonus is added', r.total===9, r.total);
  ok('nothing is a hit or a miss without a target', r.hit===null && r.ac===null);
  ok('and nothing is dealt', r.dealt===null);
  ok('no target is named', r.targetId===null);
  ok('the dice are all spent', left()===0);
  unseed();
}

console.log('AC IS DAMAGE REDUCTION');
{
  roster([C('a','Gnasher','foe',withAtk('2d6 +3')), C('t','Kesh','pc',{ac:5})]);
  seed([[4,6],[2,6]]);
  let r=attack('a',{bonus:3,target:'t'});
  ok('the target\'s AC comes off the total', r.dealt===4, r.dealt);      /* 6 + 3 − 5 */
  ok('it is a hit', r.hit===true);
  ok('the AC used is the target\'s', r.ac===5, r.ac);
  ok('the target is named', r.targetName==='Kesh');
  unseed();

  roster([C('a','Gnasher','foe',withAtk('1d6')), C('t','Kesh','pc',{ac:5})]);
  seed([[5,6]]);
  r=attack('a',{bonus:1,target:'t'});
  ok('exactly one point through is a hit', r.hit===true && r.dealt===1, r.dealt);
  unseed();

  seed([[4,6]]);
  r=attack('a',{bonus:1,target:'t'});
  ok('exactly equalling the AC is turned aside', r.hit===false, r.dealt);
  ok('and deals nothing', r.dealt===0, r.dealt);
  unseed();

  seed([[1,6]]);
  r=attack('a',{bonus:0,target:'t'});
  ok('a total under the AC never goes negative', r.dealt===0, r.dealt);
  unseed();

  roster([C('a','Gnasher','foe',withAtk('1d6')), C('t','Kesh','pc',{ac:5})]);
  seed([[6,6],[6,6],[3,6]]);
  r=attack('a',{bonus:0,target:'t'});
  ok('a weapon that cannot out-roll the AC can still crit through',
     r.hit===true && r.dealt===10, r.dealt);                            /* 6+6+3 − 5 */
  ok('the chain is recorded', r.deepest===3, r.deepest);
  ok('and counted as a critical', r.crits===1, r.crits);
  unseed();
}

console.log('DICE ON A HIT');
{
  roster([C('a','Gnasher','foe',withAtk('1d6')), C('t','Kesh','pc',{ac:2})]);
  seed([[5,6],[6,6]]);                       /* weapon 5, rider maxes — and must NOT explode */
  let r=attack('a',{bonus:0,target:'t',rider:'1d6 fire'});
  ok('the rider was rolled', !!r.rider);
  ok('it rolled its maximum', r.rider.rolls[0]===6, JSON.stringify(r.rider.rolls));
  ok('and did NOT explode', r.rider.rolls.length===1, JSON.stringify(r.rider.rolls));
  ok('no extra die was drawn for it', left()===0, left());
  ok('the rider is added to the damage', r.dealt===9, r.dealt);         /* 5 − 2 + 6 */
  ok('the rider keeps its type', r.rider.type==='fire', r.rider.type);
  unseed();

  seed([[1,6]]);
  r=attack('a',{bonus:0,target:'t',rider:'1d6 fire'});
  ok('a miss rolls no rider at all', r.rider===null, JSON.stringify(r.rider));
  ok('and draws no die for it', left()===0);
  unseed();

  roster([C('a','Gnasher','foe',withAtk('1d6')), C('t','Kesh','pc',{ac:1})]);
  seed([[5,6],[2,4],[3,4]]);
  r=attack('a',{bonus:0,target:'t',rider:'2d4 +1 necrotic'});
  ok('a multi-die rider rolls every die', r.rider.rolls.length===2, JSON.stringify(r.rider.rolls));
  ok('and adds its own modifier', r.rider.sum===6, r.rider.sum);        /* 2+3+1 */
  unseed();

  seed([[5,6]]);
  r=attack('a',{bonus:0,target:'t',rider:'no dice here'});
  ok('an unreadable rider is simply ignored', r.rider===null);
  unseed();
}

console.log('WHO MAY BE SWUNG AT');
{
  roster([C('f1','Gnasher','foe'), C('f2','Biter','foe'),
          C('p1','Kesh','pc'), C('a1','Hound','ally')]);
  const names=l=>l.map(x=>x.c.name).sort().join(' ');
  let list=F.eligibleTargets(F.byId('f1'));
  ok('a monster sees the party and its allies', names(list)==='Hound Kesh', names(list));
  ok('it does not see itself', !list.some(x=>x.c.id==='f1'));
  ok('nor its own side', !list.some(x=>x.c.id==='f2'));
  ok('and nothing is marked turned', list.every(x=>!x.turned));

  list=F.eligibleTargets(F.byId('p1'));
  ok('a player sees the monsters', names(list)==='Biter Gnasher', names(list));
  ok('and not their own ally', !list.some(x=>x.c.side==='ally'));

  F.byId('f1').cond=[{n:'Charmed',r:null}];
  list=F.eligibleTargets(F.byId('f1'));
  ok('a charmed monster may also swing at its own side',
     names(list)==='Biter Hound Kesh', names(list));
  ok('the extra target is marked turned',
     list.find(x=>x.c.id==='f2').turned===true);
  ok('the ordinary ones are not',
     list.filter(x=>x.c.id!=='f2').every(x=>!x.turned));
  ok('and it still cannot hit itself', !list.some(x=>x.c.id==='f1'));

  F.byId('p1').cond=[{n:'Charmed',r:3}];
  list=F.eligibleTargets(F.byId('p1'));
  ok('a charmed player may swing at their own party',
     names(list)==='Biter Gnasher Hound', names(list));
  ok('including their own ally', list.some(x=>x.c.id==='a1' && x.turned===true));

  ok('isCharmed reads the condition', F.isCharmed({cond:[{n:'Charmed'}]})===true);
  ok('it matches however the chip is written', F.isCharmed({cond:[{n:'charmed by the bard'}]})===true);
  ok('and is false without it', F.isCharmed({cond:[{n:'Prone'}]})===false);
  ok('a combatant with no conditions is not charmed', F.isCharmed({})===false);
}

console.log('NOTHING MOVES UNTIL APPLY');
{
  roster([C('a','Gnasher','foe',withAtk('1d6')), C('t','Kesh','pc',{ac:1,hp:{c:20,m:20},thp:4})]);
  seed([[5,6]]);
  const r=attack('a',{bonus:0,target:'t'});
  ok('the roll is resolved', r.dealt===4, r.dealt);
  ok('but the target is untouched', F.byId('t').hp.c===20 && F.byId('t').thp===4);
  unseed();

  F.applyAttack();
  ok('applying spends temporary hit points first', F.byId('t').thp===0, F.byId('t').thp);
  ok('and the rest comes off real hit points', F.byId('t').hp.c===20, F.byId('t').hp.c);
  ok('the result is marked applied', F.ui.atk.result.applied===true);

  F.applyAttack();
  ok('applying twice does nothing', F.byId('t').hp.c===20 && F.byId('t').thp===0);
}
{
  roster([C('a','Gnasher','foe',withAtk('2d6')), C('t','Kesh','pc',{ac:1,hp:{c:20,m:20},thp:2})]);
  seed([[5,6],[4,6]]);
  attack('a',{bonus:0,target:'t'});
  unseed();
  F.applyAttack();
  /* 5 + 4 = 9, less AC 1 = 8 through; 2 is soaked by the temporary pool, 6 reaches hit points. */
  ok('damage past the temporary pool reaches hit points', F.byId('t').hp.c===14, F.byId('t').hp.c);
  ok('and the temporary pool is gone', F.byId('t').thp===0);
}
{
  roster([C('a','Gnasher','foe',withAtk('1d6')), C('t','Kesh','pc',{ac:20,hp:{c:20,m:20}})]);
  seed([[2,6]]);
  attack('a',{bonus:0,target:'t'});
  unseed();
  F.applyAttack();
  ok('a miss applies nothing', F.byId('t').hp.c===20);
}

console.log('IT IS WRITTEN DOWN');
{
  roster([C('a','<img src=x onerror=alert(1)>','foe',withAtk('1d6')), C('t','Kesh','pc',{ac:1})]);
  seed([[5,6]]);
  attack('a',{bonus:0,target:'t'});
  unseed();
  const last=F.S.log[0];
  ok('the attack reached the combat record', !!last);
  ok('it is stored as parts, not markup', Array.isArray(last.p));
  ok('the hostile name is a plain string part',
     F.partsText(last.p).indexOf('<img src=x onerror=alert(1)>')>-1);
  ok('rendering it creates no element',
     (()=>{ const d=w.document.createElement('div'); d.innerHTML=F.renderParts(last.p);
            return d.querySelectorAll('img').length===0; })());
  ok('the roller\'s history kept a line too', F.diceLog.length>0);
  ok('with the attack labelled', /Claw/.test(F.diceLog[0].label), F.diceLog[0].label);
}

console.log('BOTH SIDES OF THE SCREEN AGREE');
{
  /* The whole point of porting the engine was that the player's sheet and the DM's tracker
     resolve the same swing the same way. Same seeded dice into both, same numbers out. */
  const berrs=[]; const bvc=new VirtualConsole(); bvc.on('jsdomError',e=>berrs.push(e.message));
  const bdom=new JSDOM(fs.readFileSync(path.join(ROOT,'character-builder-2.html'),'utf8'),
    {runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:bvc,url:'https://localhost/'});
  const bw=bdom.window, BE=c=>bw.eval(c);
  ok('the builder boots clean', berrs.length===0, berrs[0]);

  const bReal=bw.Math.random;
  const seedBoth=p=>{ const qa=p.slice(), qb=p.slice();
    w.Math.random =()=>{ const e=qa.shift(); if(!e) throw new Error('fray queue exhausted');  return (e[0]-1)/e[1]; };
    bw.Math.random=()=>{ const e=qb.shift(); if(!e) throw new Error('builder queue exhausted'); return (e[0]-1)/e[1]; }; };
  const unseedBoth=()=>{ w.Math.random=realRandom; bw.Math.random=bReal; };

  for(const chain of [[[3,6]], [[6,6],[2,6]], [[6,6],[6,6],[6,6],[4,6]], [[8,8],[1,8]]]){
    seedBoth(chain);
    const a=JSON.stringify(F.explodeDie(chain[0][1]));
    const b=BE('JSON.stringify(explodeDie('+chain[0][1]+'))');
    ok('the same die explodes the same way: '+a, a===b, a+' vs '+b);
    unseedBoth();
  }
  seedBoth([[6,6],[3,6],[4,6]]);
  {
    const a=JSON.stringify(F.rollExploding(2,6)), b=BE('JSON.stringify(rollExploding(2,6))');
    ok('and a multi-die weapon rolls the same', a===b, a+' vs '+b);
  }
  unseedBoth();

  for(const s of ['2d6 +3','1d8 -1','4d6','99d6','a sharp stick']){
    const a=JSON.stringify(F.parseDmg(s)), b=BE('JSON.stringify(parseDmg('+JSON.stringify(s)+'))');
    ok('both read '+JSON.stringify(s)+' the same', a===b, a+' vs '+b);
  }
  for(const s of ['1d6 fire','2d4 +1 necrotic','1d6']){
    const a=JSON.stringify(F.parseRider(s)), b=BE('JSON.stringify(parseRider('+JSON.stringify(s)+'))');
    ok('both read the rider '+JSON.stringify(s)+' the same', a===b, a+' vs '+b);
  }
  ok('and both cap a runaway chain at the same length',
     F.explodeDie.toString().indexOf('EXPLODE_CAP')>-1 && BE('ATK_EXPLODE_CAP')===30,
     BE('ATK_EXPLODE_CAP'));
  bw.close();
}

console.log('\n  %d passed, %d failed', pass, fail);
process.exit(fail?1:0);
