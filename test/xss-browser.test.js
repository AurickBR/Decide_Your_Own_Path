/* The stored-XSS payloads, replayed in a real browser.
 *
 * Every other suite here runs in jsdom, which fetches nothing and runs no inline handler — so an
 * `<img onerror>` would not fire there even if it WERE injected. Those suites therefore assert
 * structurally: no element was created, no attribute starts with "on". That is good evidence and
 * not proof, and `claude/PROJECT_REVIEW.md` §3.3 says so in as many words: the original audit
 * proved execution in headless Chromium, and re-running it against these files "would be the
 * stronger confirmation". This is that run.
 *
 * The method matters more than the payload list. Each case first proves the canary is LIVE — the
 * same payload, injected deliberately with innerHTML, really does execute in this browser — and
 * only then feeds it through the tool's own render path and asserts it does not. Without the
 * control, "nothing fired" could just mean the canary was broken.
 *
 * SKIPPING IS NORMAL. Playwright is not a dependency of this project; it is not worth making
 * `npm install` download a browser for one suite. Without it this suite reports zero assertions
 * and passes, so `npm test` stays runnable anywhere. To actually run it:
 *
 *     npm i -D playwright && npx playwright install chromium
 *     node test/xss-browser.test.js
 */
const fs=require('fs'), path=require('path'), http=require('http');
const ROOT=path.join(__dirname,'..');
let pass=0,fail=0; const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL: '+n+(d?'   ['+d+']':'')));};

let chromium=null;
try{ ({chromium}=require('playwright')); }catch(e){}
if(!chromium){
  console.log('SKIPPED — playwright is not installed (see the header of this file).');
  console.log('\n  0 passed, 0 failed');
  process.exit(0);
}

/* The payloads. Each sets window.__XSS if it ever executes. Two shapes on purpose: one needs a
   failed resource load, the other fires on its own — so a browser quirk in one cannot hide the
   other. (`<svg onload>` is deliberately NOT used: Chromium does not fire it for markup inserted
   through innerHTML, so it would look harmless for the wrong reason. The control block below is
   what caught that.) */
const IMG='<img src=nope.png onerror="window.__XSS=1">';
const TOG='<details open ontoggle="window.__XSS=1">x</details>';
const BREAK='"><details open ontoggle="window.__XSS=1">x</details>';

/* Serve the repo over 127.0.0.1: the tools' local-only hooks are exposed on localhost, and a real
   origin avoids file:// storage restrictions. */
const TYPES={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'};
function serve(){
  return new Promise(res=>{
    const s=http.createServer((rq,rs)=>{
      const p=path.join(ROOT, decodeURIComponent(rq.url.split('?')[0]));
      if(!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()){ rs.writeHead(404); rs.end(); return; }
      rs.writeHead(200,{'Content-Type':TYPES[path.extname(p)]||'application/octet-stream'});
      fs.createReadStream(p).pipe(rs);
    });
    s.listen(0,'127.0.0.1',()=>res({s, base:'http://127.0.0.1:'+s.address().port+'/'}));
  });
}

(async()=>{
  const {s,base}=await serve();
  const browser=await chromium.launch();

  async function open(file, seed){
    const ctx=await browser.newContext();
    const page=await ctx.newPage();
    const errs=[]; page.on('pageerror',e=>errs.push(e.message));
    if(seed) await page.addInitScript(([k,v])=>{ try{ localStorage.setItem(k,v); }catch(e){} }, seed);
    await page.goto(base+file,{waitUntil:'load'});
    return {ctx, page, errs};
  }
  /* Proof the canary is live in THIS browser, on THIS page, under its CSP. */
  async function controlFires(page, payload){
    return page.evaluate(async p=>{
      delete window.__XSS;
      const d=document.createElement('div'); d.style.display='none';
      document.body.appendChild(d);
      d.innerHTML=p;
      await new Promise(r=>setTimeout(r,120));
      const fired=window.__XSS===1;
      d.remove(); delete window.__XSS;
      return fired;
    }, payload);
  }
  const fired=page=>page.evaluate(async()=>{ await new Promise(r=>setTimeout(r,120)); return window.__XSS===1; });

  /* ---------------------------------------------------------------- The Fray */
  console.log('THE COMBAT RECORD (encounter-control.html)');
  {
    const {ctx,page,errs}=await open('encounter-control.html');
    ok('the Fray boots clean', errs.length===0, errs[0]);
    ok('the local-only hook is exposed on 127.0.0.1', await page.evaluate(()=>!!window.__fray));

    ok('the canary fires when injected deliberately (onerror)', await controlFires(page, IMG));
    ok('the canary fires when injected deliberately (ontoggle)', await controlFires(page, TOG));

    /* 1. a restored backup whose log parts carry markup */
    await page.evaluate(([img,tog])=>{
      window.__fray.hydrate({cs:[], log:[{r:1,p:[img,{b:tog}],k:''}]});
      window.__fray.renderAll();
    },[IMG,TOG]);
    ok('a hostile log part does not execute', !(await fired(page)));
    ok('the record really did render the line', await page.evaluate(()=>
      document.querySelectorAll('.logbox .logline').length===1),
      await page.evaluate(()=>document.querySelectorAll('.logbox .logline').length));
    ok('and creates no element', await page.evaluate(()=>
      document.querySelectorAll('.logbox img, .logbox details, .logbox svg').length===0));
    ok('it is shown as text instead', await page.evaluate(([img])=>
      document.body.innerText.indexOf(img)>-1, [IMG]));

    /* 2. a legacy {m:html} entry from an old backup */
    await page.evaluate(([img])=>{
      window.__fray.hydrate({cs:[], log:[{r:1,m:'<b>bold</b> '+img,k:''}]});
      window.__fray.renderAll();
    },[IMG]);
    ok('a legacy {m:html} entry does not execute', !(await fired(page)));
    ok('and is stripped to plain text', await page.evaluate(()=>
      document.querySelectorAll('.logbox img, .logbox b, .logbox details').length===0));

    /* 3. a hostile combatant name, which reaches attributes as well as text */
    await page.evaluate(([img,brk])=>{
      window.__fray.hydrate({cs:[{id:'a',name:img,side:'foe',ac:10,hp:{c:5,m:5},
                                  cond:[{n:brk,r:null}], note:brk}], started:false});
      window.__fray.renderAll();
    },[IMG,BREAK]);
    ok('a hostile combatant name does not execute', !(await fired(page)));
    ok('nor does a hostile condition chip', await page.evaluate(()=>
      document.querySelectorAll('img[onerror], details[ontoggle], [ontoggle], [onerror]').length===0));
    ok('no inline handler reached the document', await page.evaluate(()=>
      [...document.querySelectorAll('*')].every(e=>![...e.attributes].some(a=>/^on/i.test(a.name)))));

    /* 4. through the attack path, which writes its own log line */
    await page.evaluate(([img])=>{
      const F=window.__fray;
      F.hydrate({cs:[{id:'a',name:img,side:'foe',ac:10,hp:{c:9,m:9},
                      blk:{attr:{},atk:[{n:img,d:'1d6'}],tr:[],senses:'',note:'',pb:0,sp:'',sec:'x'}},
                     {id:'t',name:'Kesh',side:'pc',ac:1,hp:{c:20,m:20}}], started:true, activeId:'a'});
      F.ui.atk={cid:'a',ai:0,target:'t',bonus:0,rider:'',result:null};
      F.resolveAttack();
    },[IMG]);
    ok('an attack by a hostile name does not execute', !(await fired(page)));
    ok('and the combat record still rendered', await page.evaluate(()=>!!document.querySelector('.logbox')));
    await ctx.close();
  }

  /* ---------------------------------------------------------------- The Journal */
  console.log('THE JOURNAL (journal.html)');
  {
    const save=JSON.stringify({name:'Kesh', location:[
      {id:'a"onmouseover="window.__XSS=1', name:IMG, kind:BREAK, desc:'see @['+IMG+'] and '+TOG}],
      npc:[], quest:[], general:[]});
    const {ctx,page,errs}=await open('journal.html',['dyop_journal_v1',save]);
    ok('the Journal boots clean', errs.length===0, errs[0]);
    ok('the canary is live here too', await controlFires(page, IMG));
    ok('a hostile entry does not execute', !(await fired(page)));
    ok('no element was created from it', await page.evaluate(()=>
      document.querySelectorAll('#list img, #list details').length===0));
    ok('the hostile id never reached an attribute', await page.evaluate(()=>
      document.querySelectorAll('[id^="entry-"]').length===1 &&
      /^entry-[A-Za-z0-9_-]{1,32}$/.test(document.querySelector('[id^="entry-"]').id)));
    ok('no inline handler reached the document', await page.evaluate(()=>
      [...document.querySelectorAll('*')].every(e=>![...e.attributes].some(a=>/^on/i.test(a.name)))));
    ok('the payload is readable as text', await page.evaluate(([img])=>
      document.body.innerText.indexOf(img)>-1, [IMG]));
    await ctx.close();
  }

  /* ---------------------------------------------------------------- The Loom */
  console.log('THE LOOM (dm-loom.html)');
  {
    const save=JSON.stringify({view:'codex', codex:{cat:'all', entries:[
      {id:'a"onmouseover="window.__XSS=1', cat:'npc', title:IMG, summary:BREAK,
       body:'see @['+IMG+'] and '+TOG, ts:1}]}});
    const {ctx,page,errs}=await open('dm-loom.html',['dyop_dm_forge_v3',save]);
    ok('the Loom boots clean', errs.length===0, errs[0]);
    ok('the canary is live here too', await controlFires(page, TOG));
    ok('a hostile codex entry does not execute', !(await fired(page)));
    ok('no element was created from it', await page.evaluate(()=>
      document.querySelectorAll('#wrap img, #wrap details').length===0));
    ok('the hostile id never reached an attribute', await page.evaluate(()=>
      document.querySelectorAll('[id^="cx-"]').length===1 &&
      /^cx-[A-Za-z0-9_-]{1,32}$/.test(document.querySelector('[id^="cx-"]').id)));
    ok('no inline handler reached the document', await page.evaluate(()=>
      [...document.querySelectorAll('*')].every(e=>![...e.attributes].some(a=>/^on/i.test(a.name)))));
    await ctx.close();
  }

  await browser.close();
  s.close();
  console.log('\n  %d passed, %d failed', pass, fail);
  process.exit(fail?1:0);
})().catch(e=>{ console.log('  FAIL: the browser run threw   ['+e.message+']');
                console.log('\n  %d passed, %d failed', pass, fail+1); process.exit(1); });
