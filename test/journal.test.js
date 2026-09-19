/* The Adventure Journal — the @mention engine and the id guard.
 *
 * `SECURITY_AUDIT.md` §5 singled out `linkify()` as "a genuinely solid design": it walks the text
 * a character at a time and escapes everything it does not itself emit, instead of running a
 * replace over user text. Solid, and until now protected by nothing. This suite is that protection.
 *
 * The sharp edge is `mentionAnchor()`, which interpolates an entry id into an HTML attribute
 * WITHOUT escaping it — `data-goto="${e.cat}|${e.id}"`. That is safe only because `fixIds()`
 * replaces any id that does not match `SAFE_ID` before anything renders. The two have to stay
 * together: if the guard is ever weakened, the ATTRIBUTE block below fails.
 *
 * Run:  npm install   (once)
 *       node test/journal.test.js
 */
const fs=require('fs'), path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
const ROOT=path.join(__dirname,'..');
let pass=0,fail=0; const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL: '+n+(d?'   ['+d+']':'')));};

const SRC=fs.readFileSync(path.join(ROOT,'journal.html'),'utf8');
function boot(seed){
  const vc=new VirtualConsole(); const errs=[]; vc.on('jsdomError',e=>errs.push(e.message));
  const dom=new JSDOM(SRC,{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
    url:'https://aurickbr.github.io/Decide_Your_Own_Path/journal.html',
    beforeParse(w){ if(seed!=null) try{ w.localStorage.setItem('dyop_journal_v1',seed); }catch(e){} }});
  return {w:dom.window, d:dom.window.document, errs, E:c=>dom.window.eval(c)};
}
/* Two entries with overlapping names, so the greedy match has something to get wrong. */
const SEED={name:'Kesh', location:[{id:'gate01',name:'Ashen Gate',kind:'Ruin',desc:'cold stone'}],
            npc:[{id:'ash01',name:'Ash',city:'Rivenmoor',desc:'a smith'},
                 {id:'nil01',name:'',city:'',desc:'nameless'}],
            quest:[], general:[{id:'gen01',title:'',text:'an untitled note'}]};

console.log('IT BOOTS');
{
  const b=boot();
  ok('journal boots clean', b.errs.length===0, b.errs[0]);
  ok('it starts empty', b.E('ORDER.every(c=>J[c].length===0)'));
  ok('four categories', b.E('ORDER.length')===4, b.E('JSON.stringify(ORDER)'));
  ok('the storage key is the documented one', b.E('LS')==='dyop_journal_v1', b.E('LS'));
}

console.log('ESCAPING');
{
  const {E}=boot();
  ok('esc covers all six characters',
     E('esc("&<>\\"\'`")')==='&amp;&lt;&gt;&quot;&#39;&#96;', E('esc("&<>\\"\'`")'));
  ok('esc survives null', E('esc(null)')==='');
  ok('esc survives undefined', E('esc(undefined)')==='');
  ok('esc stringifies a number', E('esc(12)')==='12');
}

console.log('A HOSTILE SAVE FILE');
{
  const b=boot(JSON.stringify({name:'x', location:[{id:'ok_id-1',name:'fine'}], npc:'not an array'}));
  ok('a non-array category is coerced', b.E('Array.isArray(J.npc)')===true);
  ok('a good id is left alone', b.E('J.location[0].id')==='ok_id-1');
  ok('the adventurer name survives', b.E('J.name')==='x');
}
{
  const b=boot('{ this is not json');
  ok('unparseable storage leaves a blank journal', b.E('ORDER.every(c=>J[c].length===0)'));
  ok('and does not throw on boot', b.errs.length===0, b.errs[0]);
}
{
  const b=boot(JSON.stringify({location:[{id:'a"onmouseover="alert(1)',name:'Trap'}]}));
  ok('an id that breaks out of an attribute is replaced on load',
     b.E('J.location[0].id')!=='a"onmouseover="alert(1)', b.E('J.location[0].id'));
  ok('and the replacement is a safe id', b.E('SAFE_ID.test(J.location[0].id)')===true);
  ok('the entry itself survives', b.E('J.location[0].name')==='Trap');
}
{
  const b=boot(JSON.stringify({"__proto__":{polluted:1}, general:[{id:'g1',title:'t',body:'b'}]}));
  ok('safeParse drops __proto__', b.E('({}).polluted===undefined'));
  ok('the rest of the file still loads', b.E('J.general.length')===1);
  ok('safeParse drops constructor too',
     b.E('JSON.stringify(safeParse(\'{"constructor":1,"a":2}\'))')==='{"a":2}');
}

console.log('THE ID GUARD');
{
  const {E}=boot();
  const bad=['a"b', "a'b", 'a<b', 'a b', '', 'x'.repeat(33), 'a|b'];
  for(const id of bad){
    E('J.location=[{id:'+JSON.stringify(id)+',name:"n"}]; fixIds();');
    ok('fixIds rejects '+JSON.stringify(id), E('J.location[0].id')!==id, E('J.location[0].id'));
  }
  for(const id of ['abc','A-9_z','x'.repeat(32)]){
    E('J.location=[{id:'+JSON.stringify(id)+',name:"n"}]; fixIds();');
    ok('fixIds keeps '+JSON.stringify(id), E('J.location[0].id')===id);
  }
  E('J.location=[null, {id:"ok1",name:"n"}]; fixIds();');
  ok('fixIds steps over a null entry', E('J.location[1].id')==='ok1');
  ok('a generated id is always safe', E('Array.from({length:50},()=>SAFE_ID.test(uid())).every(Boolean)'));
}

console.log('THE MENTION GRAMMAR');
{
  const {E}=boot();
  E('J='+JSON.stringify(SEED)+'; fixIds();');
  const L=t=>E('linkify('+JSON.stringify(t)+')');

  ok('a bare @Name becomes a link', /<a class="mention" data-goto="npc\|ash01">@Ash<\/a>/.test(L('met @Ash')));
  ok('the longest title wins', /data-goto="location\|gate01">@Ashen Gate</.test(L('at @Ashen Gate')));
  ok('and the short one still matches when it is the whole word',
     /data-goto="npc\|ash01">@Ash<\/a> waited/.test(L('@Ash waited')));
  ok('a trailing letter blocks the match', L('@Ashley').indexOf('<a')===-1, L('@Ashley'));
  ok('a trailing digit blocks it too', L('@Ash2').indexOf('<a')===-1);
  ok('trailing punctuation does not', L('@Ash, then').indexOf('<a')===0);
  ok('the match is case-insensitive', L('@ash').indexOf('<a')===0, L('@ash'));
  ok('the bracket form handles spaces', /data-goto="location\|gate01"/.test(L('@[Ashen Gate]')));
  ok('the bracket form is case-insensitive', /data-goto="location\|gate01"/.test(L('@[ashen gate]')));
  ok('an unknown name is left as text', L('@[Nobody]')==='@[Nobody]');
  ok('an unknown bare name is left as text', L('@Nobody')==='@Nobody');
  ok('an unclosed bracket is left as text', L('@[Ashen')==='@[Ashen');
  ok('a lone @ at the end survives', L('what about @')==='what about @');
  ok('an empty string maps to an empty string', L('')==='');
  /* Only `general` entries have no placeholder title, so they are the only ones the index's
     `if(title && title.trim())` guard can actually exclude. The other three types are indexed
     under their placeholder — a nameless NPC really is reachable as "@Unknown figure". */
  ok('an untitled note is not in the index',
     E('mentionIndex().some(e=>e.id==="gen01")')===false);
  ok('but a nameless NPC is, under its placeholder',
     E('mentionIndex().find(e=>e.id==="nil01").title')==='Unknown figure',
     E('JSON.stringify(mentionIndex().find(e=>e.id==="nil01"))'));
  ok('the index is longest-first',
     E('mentionIndex().map(e=>e.title).join("|")')==='Unknown figure|Ashen Gate|Ash',
     E('mentionIndex().map(e=>e.title).join("|")'));
  ok('two mentions in one line both link',
     (L('@Ash at @[Ashen Gate]').match(/<a /g)||[]).length===2);
}

console.log('EVERYTHING ELSE IS ESCAPED');
{
  const {E}=boot();
  E('J='+JSON.stringify(SEED)+'; fixIds();');
  const L=t=>E('linkify('+JSON.stringify(t)+')');
  ok('markup in the surrounding text is escaped',
     L('<img src=x onerror=alert(1)>')==='&lt;img src=x onerror=alert(1)&gt;');
  ok('quotes and backticks are escaped', L('"\'`')==='&quot;&#39;&#96;');
  ok('an ampersand is escaped', L('a & b')==='a &amp; b');
  ok('escaping happens around a mention too',
     L('<b>@Ash</b>').startsWith('&lt;b&gt;') && L('<b>@Ash</b>').endsWith('&lt;/b&gt;'));

  /* A title is attacker-controlled the moment a journal is imported from someone else. */
  E('J.npc[0].name = "<img src=x onerror=alert(1)>";');
  const out=L('@[<img src=x onerror=alert(1)>]');
  ok('a hostile title is escaped inside the anchor', out.indexOf('<img')===-1, out.slice(0,90));
  ok('and it still links', out.indexOf('<a class="mention"')===0);
}

console.log('RENDERED, NOTHING EXECUTES');
{
  const b=boot(JSON.stringify({name:'Kesh', location:[
      {id:'a"onmouseover="alert(1)', name:'<img src=x onerror=alert(1)>', kind:'"><script>bad()</script>',
       desc:'see @[<img src=x onerror=alert(1)>]'}], npc:[], quest:[], general:[]}));
  b.E('render()');
  const list=b.d.getElementById('list');
  ok('no image element was created', list.querySelectorAll('img').length===0);
  ok('no script element was created', list.querySelectorAll('script').length===0);
  ok('nothing carries an inline handler',
     [...list.querySelectorAll('*')].every(e=>![...e.attributes].some(a=>/^on/i.test(a.name))));
  ok('the hostile name is visible as text', /<img src=x onerror=alert\(1\)>/.test(list.textContent));
  ok('the card id is a safe one',
     /^entry-[A-Za-z0-9_-]{1,32}$/.test(list.querySelector('[id^=entry-]').id),
     list.querySelector('[id^=entry-]') && list.querySelector('[id^=entry-]').id);
  ok('the page still has one card', list.querySelectorAll('[id^=entry-]').length===1);
  ok('rendering threw nothing', b.errs.length===0, b.errs[0]);
}

console.log('IT SAVES WHAT IT LOADS');
{
  const b=boot();
  b.E('J='+JSON.stringify(SEED)+'; fixIds(); save();');
  const raw=b.w.localStorage.getItem('dyop_journal_v1');
  ok('save writes to the documented key', !!raw);
  const back=JSON.parse(raw);
  ok('every category round-trips', ['location','npc','quest','general'].every(c=>Array.isArray(back[c])));
  ok('the entries survive', back.location[0].name==='Ashen Gate' && back.npc.length===2);
  ok('the adventurer name survives', back.name==='Kesh');

  const b2=boot(raw);
  ok('and a fresh boot reads it back', b2.E('J.location[0].id')==='gate01');
  ok('with the same mention index', b2.E('mentionIndex().length')===3, b2.E('mentionIndex().length'));
}

console.log('\n  %d passed, %d failed', pass, fail);
process.exit(fail?1:0);
