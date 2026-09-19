/* The Loom — the codex's @mention engine, the id guard, and the v2 → v3 migration.
 *
 * The Loom runs the same `linkify()` the Journal does, against a different index, plus one thing
 * the Journal does not have: a migration from an older storage key. `LS_OLD` ("dyop_dm_forge_v2")
 * held a forge-only save with no codex, and `load()` lifts it into the v3 shape. That path runs
 * exactly once in a user's life, silently, on data that cannot be re-created if it goes wrong —
 * which is precisely the kind of code that is never exercised until it matters.
 *
 * Note where the two tools differ: the Loom's `hydrate()` coerces every text field to a string and
 * drops non-object entries, and `mentionAnchor()` writes `data-goto="${e.id}"` with no escaping,
 * guarded only by SAFE_ID. Both are asserted below.
 *
 * Run:  npm install   (once)
 *       node test/loom.test.js
 */
const fs=require('fs'), path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
const ROOT=path.join(__dirname,'..');
let pass=0,fail=0; const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL: '+n+(d?'   ['+d+']':'')));};

const SRC=fs.readFileSync(path.join(ROOT,'dm-loom.html'),'utf8');
const V3='dyop_dm_forge_v3', V2='dyop_dm_forge_v2';
function boot(seed){            /* seed: {[key]: string} written before any script runs */
  const vc=new VirtualConsole(); const errs=[]; vc.on('jsdomError',e=>errs.push(e.message));
  const dom=new JSDOM(SRC,{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
    url:'https://aurickbr.github.io/Decide_Your_Own_Path/dm-loom.html',
    beforeParse(w){ if(seed) try{ for(const k in seed) w.localStorage.setItem(k, seed[k]); }catch(e){} }});
  return {w:dom.window, d:dom.window.document, errs, E:c=>dom.window.eval(c)};
}
const entry=(id,title,extra)=>Object.assign({id,cat:'npc',title,summary:'s',body:'b',ts:1},extra||{});

console.log('IT BOOTS');
{
  const b=boot();
  ok('the Loom boots clean', b.errs.length===0, b.errs[0]);
  ok('the current key is v3', b.E('LS')===V3, b.E('LS'));
  ok('the legacy key is v2', b.E('LS_OLD')===V2, b.E('LS_OLD'));
  ok('a fresh codex is empty', b.E('S.codex.entries.length')===0);
  ok('and it opens on the forge', b.E('S.view')==='forge', b.E('S.view'));
  ok('every subject has a blank block', b.E('Object.keys(blank().d).length')===6, b.E('Object.keys(blank().d).length'));
}

console.log('ESCAPING AND PARSING');
{
  const {E}=boot();
  ok('esc covers all six characters',
     E('esc("&<>\\"\'`")')==='&amp;&lt;&gt;&quot;&#39;&#96;', E('esc("&<>\\"\'`")'));
  ok('esc survives null', E('esc(null)')==='');
  ok('safeParse drops __proto__',
     E('JSON.stringify(safeParse(\'{"__proto__":{"x":1},"a":2}\'))')==='{"a":2}');
  ok('safeParse drops constructor',
     E('JSON.stringify(safeParse(\'{"constructor":1,"a":2}\'))')==='{"a":2}');
  ok('and the prototype stayed clean', E('({}).x===undefined'));
  ok('a generated id is always safe', E('Array.from({length:50},()=>SAFE_ID.test(uid())).every(Boolean)'));
}

console.log('HYDRATE CLEANS WHAT IT IS GIVEN');
{
  const {E}=boot();
  E('hydrate('+JSON.stringify({codex:{cat:'all',entries:[
      entry('a"onmouseover="alert(1)','Trap'),
      entry('good_id-1','Fine'),
      null, 'a string', 42,
      {id:'coerce1', title:7, summary:null, body:{a:1}}
    ]}})+')');
  ok('a hostile id is replaced', E('S.codex.entries[0].id')!=='a"onmouseover="alert(1)', E('S.codex.entries[0].id'));
  ok('the replacement is a safe id', E('SAFE_ID.test(S.codex.entries[0].id)')===true);
  ok('a good id survives untouched', E('S.codex.entries[1].id')==='good_id-1');
  ok('non-object entries are dropped', E('S.codex.entries.length')===3, E('S.codex.entries.length'));
  ok('a numeric title becomes a string', E('typeof S.codex.entries[2].title')==='string');
  ok('a null summary becomes an empty string', E('S.codex.entries[2].summary')==='');
  ok('an object body becomes a string', E('typeof S.codex.entries[2].body')==='string');

  E('hydrate({codex:{entries:"not an array"}})');
  ok('a non-array entries list is coerced', E('Array.isArray(S.codex.entries)')===true);
  E('hydrate({})');
  ok('an empty save still gets every block', E('Object.keys(S.d).length')===6);
  ok('and a codex', E('S.codex.cat')==='all' && E('S.codex.entries.length')===0);
  E('hydrate({d:{npc:{name:"Maerin"}}})');
  ok('a partial block merges rather than replaces',
     E('S.d.npc.name')==='Maerin' && E('S.d.npc.role')==='', E('JSON.stringify(S.d.npc)'));
  ok('and the other blocks survive it', E('S.d.world.name')==='');
}

console.log('THE v2 → v3 MIGRATION');
{
  const v2=JSON.stringify({type:'npc', format:'detailed', context:'old notes',
                           d:{npc:{name:'Maerin', role:'innkeeper'}}});
  const b=boot({[V2]:v2});
  ok('a v2 save loads', b.E('S.d.npc.name')==='Maerin', b.E('S.d.npc.name'));
  ok('its second field survives too', b.E('S.d.npc.role')==='innkeeper');
  ok('fields v2 never had are filled in', b.E('S.d.npc.secret')==='', b.E('S.d.npc.secret'));
  ok('the other subject blocks are present', b.E('Object.keys(S.d).length')===6);
  ok('the forge context survives', b.E('S.context')==='old notes');
  ok('it opens on the forge', b.E('S.view')==='forge');
  ok('and gets an empty codex', b.E('S.codex.entries.length')===0 && b.E('S.codex.cat')==='all');
  ok('migrating threw nothing', b.errs.length===0, b.errs[0]);
}
{
  /* v2 predates the codex, so anything claiming to be one in a v2 file is not ours. */
  const b=boot({[V2]:JSON.stringify({codex:{cat:'all',entries:[entry('a"x','Smuggled')]}})});
  ok('a codex smuggled into a v2 file is discarded', b.E('S.codex.entries.length')===0);
}
{
  const b=boot({[V3]:JSON.stringify({context:'new', codex:{cat:'all',entries:[entry('keep01','Kept')]}}),
                [V2]:JSON.stringify({context:'old'})});
  ok('v3 wins when both keys are present', b.E('S.context')==='new', b.E('S.context'));
  ok('and the v3 codex is the one loaded', b.E('S.codex.entries[0].title')==='Kept');
}
{
  const b=boot({[V3]:'{ not json'});
  ok('unparseable v3 storage leaves a blank Loom', b.E('S.codex.entries.length')===0);
  ok('and does not throw on boot', b.errs.length===0, b.errs[0]);
}

console.log('THE MENTION GRAMMAR');
{
  const b=boot();
  b.E('S.codex.entries='+JSON.stringify([
      entry('gate01','Ashen Gate'), entry('ash01','Ash'), entry('nil01','')])+';');
  const L=t=>b.E('linkify('+JSON.stringify(t)+')');

  ok('a bare @Name becomes a link', /<a class="mention" data-goto="ash01">@Ash<\/a>/.test(L('met @Ash')));
  ok('the longest title wins', /data-goto="gate01">@Ashen Gate</.test(L('at @Ashen Gate')));
  ok('a trailing letter blocks the match', L('@Ashley').indexOf('<a')===-1, L('@Ashley'));
  ok('a trailing digit blocks it too', L('@Ash2').indexOf('<a')===-1);
  ok('trailing punctuation does not', L('@Ash, then').indexOf('<a')===0);
  ok('the match is case-insensitive', L('@ash').indexOf('<a')===0);
  ok('the bracket form handles spaces', /data-goto="gate01"/.test(L('@[Ashen Gate]')));
  ok('an unknown name is left as text', L('@[Nobody]')==='@[Nobody]');
  ok('an unclosed bracket is left as text', L('@[Ashen')==='@[Ashen');
  ok('a lone @ at the end survives', L('ask @')==='ask @');
  ok('an empty string maps to an empty string', L('')==='');
  ok('an untitled entry is not in the index', b.E('mentionIndex().some(e=>e.id==="nil01")')===false);
  ok('the index is longest-first', b.E('mentionIndex().map(e=>e.title).join("|")')==='Ashen Gate|Ash');
  ok('two mentions in one line both link', (L('@Ash at @[Ashen Gate]').match(/<a /g)||[]).length===2);
  ok('markup around a mention is escaped',
     L('<b>@Ash</b>').startsWith('&lt;b&gt;') && L('<b>@Ash</b>').endsWith('&lt;/b&gt;'));
  ok('quotes and backticks are escaped', L('"\'`')==='&quot;&#39;&#96;');

  b.E('S.codex.entries[1].title="<img src=x onerror=alert(1)>";');
  const out=L('@[<img src=x onerror=alert(1)>]');
  ok('a hostile title is escaped inside the anchor', out.indexOf('<img')===-1, out.slice(0,90));
  ok('and it still links', out.indexOf('<a class="mention"')===0);
}

console.log('RENDERED, NOTHING EXECUTES');
{
  const b=boot({[V3]:JSON.stringify({view:'codex', codex:{cat:'all', entries:[
      entry('a"onmouseover="alert(1)', '<img src=x onerror=alert(1)>',
            {summary:'"><script>bad()</script>', body:'see @[<img src=x onerror=alert(1)>]'})]}})});
  b.E('renderAll()');
  const wrap=b.d.getElementById('wrap');
  ok('the codex rendered', !!wrap && wrap.querySelectorAll('.cx-card').length===1,
     wrap && wrap.querySelectorAll('.cx-card').length);
  ok('no image element was created', wrap.querySelectorAll('img').length===0);
  ok('no script element was created', wrap.querySelectorAll('script').length===0);
  ok('nothing carries an inline handler',
     [...wrap.querySelectorAll('*')].every(e=>![...e.attributes].some(a=>/^on/i.test(a.name))));
  ok('the hostile title is visible as text', /<img src=x onerror=alert\(1\)>/.test(wrap.textContent));
  ok('the card id is a safe one',
     /^cx-[A-Za-z0-9_-]{1,32}$/.test(wrap.querySelector('.cx-card').id), wrap.querySelector('.cx-card').id);
  ok('rendering threw nothing', b.errs.length===0, b.errs[0]);
}

console.log('IT SAVES WHAT IT LOADS');
{
  const b=boot();
  b.E('S.codex.entries=['+JSON.stringify(entry('keep01','Rivenmoor'))+']; S.d.world.name="Norrath"; save();');
  const raw=b.w.localStorage.getItem(V3);
  ok('save writes to the v3 key', !!raw);
  ok('it does not write the legacy key', b.w.localStorage.getItem(V2)===null);
  const back=JSON.parse(raw);
  ok('the codex round-trips', back.codex.entries[0].title==='Rivenmoor');
  ok('the forge data round-trips', back.d.world.name==='Norrath');

  const b2=boot({[V3]:raw});
  ok('a fresh boot reads it back', b2.E('S.codex.entries[0].id')==='keep01');
  ok('with the same mention index', b2.E('mentionIndex().length')===1);
  ok('and the same world', b2.E('S.d.world.name')==='Norrath');
}

console.log('\n  %d passed, %d failed', pass, fail);
process.exit(fail?1:0);
