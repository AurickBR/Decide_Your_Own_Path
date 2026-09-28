/* Layout on real screens — the things jsdom cannot see because it does no layout.
 *
 * Three regressions this guards, all found on 2026-09-22 by booting the pages in Chromium:
 *   1. No page may scroll sideways, at phone or desktop width, in any builder tab or any
 *      compendium section. (The builder was 500 px wide at 375; the compendium's 18-tab row
 *      was 2,137 px wide at 1280.)
 *   2. When the builder's header wraps, only its last row stays pinned once you scroll, and
 *      the sticky build tabs sit below it instead of hiding behind it.
 *   3. On a touch screen every small control answers a tap anywhere in a 24 px box around its
 *      centre (SAVE toggles, "roll it", the dice log's "clear", the temp-HP steppers…).
 *   4. Text is readable: at least 4.5:1 against what is actually behind it (3:1 for large
 *      text). Added 2026-09-27, when the white-on-green active buttons measured 3.7:1 and the
 *      rust used for negatives and unmet requirements 4.47:1.
 *
 * SKIPPING IS NORMAL, exactly as in xss-browser.test.js: without Playwright this reports zero
 * assertions and passes. To run it:
 *
 *     npm i -D playwright && npx playwright install chromium
 *     node test/layout-browser.test.js        (or: npm run test:browser)
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

const PAGES=['index.html','character-builder-2.html','journal.html','compendium-and-bestiary.html',
             'encounter-control.html','dm-loom.html','legal.html'];
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

/* Elements that push the page sideways: past the viewport's right edge, not fixed, and not
   inside something that clips or scrolls horizontally. */
const OVERFLOW=()=>{
  const de=document.documentElement, cw=de.clientWidth, out=[];
  for(const e of document.querySelectorAll('body *')){
    const r=e.getBoundingClientRect(); if(r.width===0 || r.right<=cw+1) continue;
    let a=e.parentElement, clipped=false;
    while(a && a!==document.body){ if(getComputedStyle(a).overflowX!=='visible'){ clipped=true; break; } a=a.parentElement; }
    if(!clipped && getComputedStyle(e).position!=='fixed')
      out.push(e.tagName.toLowerCase()+'.'+String(e.className).split(' ')[0]+' → '+Math.round(r.right)+'px');
  }
  return {extra:de.scrollWidth-cw, who:out.slice(0,3).join(', ')};
};

/* Every visible small control must own all four points 11.5 px from its centre. */
const TAPS=()=>{
  const vis=e=>{const s=getComputedStyle(e); return s.display!=='none' && s.visibility!=='hidden' && e.offsetParent!==null;};
  const bad=[];
  for(const e of document.querySelectorAll('button,a[href],label.avail-toggle')){
    if(!vis(e) || e.closest('.dyop-legal,.dyop-build,.dyop-nav')) continue;
    let r=e.getBoundingClientRect(); if(!(r.width>0 && (r.width<24 || r.height<24))) continue;
    e.scrollIntoView({block:'center', inline:'nearest'}); r=e.getBoundingClientRect();
    const cx=r.left+r.width/2, cy=r.top+r.height/2;
    const top=document.elementFromPoint(cx,cy);
    if(!top || !(top===e || e.contains(top))) continue;          /* covered by an open overlay: not reachable anyway */
    const miss=[[0,-11.5],[0,11.5],[-11.5,0],[11.5,0]].filter(([dx,dy])=>{
      const t=document.elementFromPoint(cx+dx,cy+dy); return !(t && (t===e || e.contains(t)));
    });
    if(miss.length) bad.push((String(e.className).split(' ')[0]||e.tagName)+' "'+e.textContent.trim().slice(0,12)+'" '+Math.round(r.width)+'x'+Math.round(r.height));
  }
  return bad;
};

/* Text below WCAG AA contrast, compositing translucent backgrounds up the tree. Elements over a
   gradient or image are skipped (no single background colour to measure against). */
const CONTRAST=()=>{
  const parse=c=>{const m=c.match(/rgba?\(([^)]+)\)/); if(!m) return null; const v=m[1].split(/[, /]+/).filter(Boolean).map(Number); return {r:v[0],g:v[1],b:v[2],a:v.length>3?v[3]:1};};
  const lum=({r,g,b})=>{const f=x=>{x/=255; return x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4);}; return .2126*f(r)+.7152*f(g)+.0722*f(b);};
  const over=(t,u)=>({r:t.r*t.a+u.r*(1-t.a), g:t.g*t.a+u.g*(1-t.a), b:t.b*t.a+u.b*(1-t.a), a:1});
  const bgOf=e=>{const st=[]; for(let a=e; a; a=a.parentElement){ const cs=getComputedStyle(a), c=parse(cs.backgroundColor);
      if(c && c.a>0) st.push(c); if(cs.backgroundImage!=='none' && a!==document.body && a!==document.documentElement) return null; if(c && c.a>=1) break; }
    let base={r:20,g:22,b:31,a:1}; for(let i=st.length-1;i>=0;i--) base=over(st[i],base); return base;};
  const vis=e=>{const s=getComputedStyle(e); return s.display!=='none' && s.visibility!=='hidden' && e.offsetParent!==null && +s.opacity>0.2;};
  const bad={};
  for(const e of document.querySelectorAll('body *')){
    if(!vis(e) || ![...e.childNodes].some(n=>n.nodeType===3 && n.textContent.trim().length>1)) continue;
    if(e.closest('button:disabled,[disabled],.dyop-build')) continue;
    const cs=getComputedStyle(e); let fg=parse(cs.color); const bg=bgOf(e); if(!fg || !bg) continue;
    if(fg.a<1) fg=over(fg,bg);
    const L1=lum(fg), L2=lum(bg), ratio=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);
    const px=parseFloat(cs.fontSize), large=px>=24 || (px>=18.66 && +cs.fontWeight>=700);
    if(ratio < (large?3:4.5)){ const k=cs.color+' on '+[bg.r,bg.g,bg.b].map(Math.round).join(',')+' = '+ratio.toFixed(2); bad[k]=bad[k]||((String(e.className).split(' ')[0]||e.tagName)+' "'+e.textContent.trim().slice(0,16)+'"'); }
  }
  return Object.entries(bad).map(([k,v])=>v+' — '+k);
};

(async()=>{
  const {s,base}=await serve();
  const browser=await chromium.launch();
  async function open(file,w,touch){
    const ctx=await browser.newContext({viewport:{width:w,height:800}, hasTouch:!!touch, isMobile:!!touch});
    const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r=>r.abort());   /* offline-safe, deterministic */
    await page.goto(base+file,{waitUntil:'load'}); await page.waitForTimeout(150);
    return {ctx,page,errs};
  }

  console.log('NO PAGE SCROLLS SIDEWAYS');
  for(const w of [320,375,1280]){
    for(const f of PAGES){
      const {ctx,page,errs}=await open(f,w);
      const o=await page.evaluate(OVERFLOW);
      ok(f+' @'+w+'px: no sideways scroll', o.extra<=0, o.who);
      ok(f+' @'+w+'px: boots without errors', errs.length===0, errs[0]);
      if(f==='character-builder-2.html'){
        for(const sub of ['species','skills','talents','spellbook','equipment']){
          await page.evaluate(s=>document.querySelector('.bt[data-sub="'+s+'"]').click(), sub); await page.waitForTimeout(80);
          const r=await page.evaluate(OVERFLOW); ok(f+' @'+w+'px build/'+sub+': no sideways scroll', r.extra<=0, r.who);
        }
        await page.evaluate(()=>document.querySelector('.vt[data-view="sheet"]').click()); await page.waitForTimeout(120);
        const r=await page.evaluate(OVERFLOW); ok(f+' @'+w+'px sheet: no sideways scroll', r.extra<=0, r.who);
      }
      if(f==='compendium-and-bestiary.html'){
        const secs=await page.$$eval('.secnav-tab', t=>t.map(x=>x.dataset.section));
        const wide=[];
        for(const sec of secs){
          await page.evaluate(s=>document.querySelector('.secnav-tab[data-section="'+s+'"]').click(), sec); await page.waitForTimeout(60);
          const r=await page.evaluate(OVERFLOW); if(r.extra>0) wide.push(sec+': '+r.who);
        }
        ok(f+' @'+w+'px: all '+secs.length+' sections fit', wide.length===0, wide.slice(0,2).join(' | '));
        if(w>=1024){
          const hidden=await page.$$eval('.secnav-tab', t=>t.filter(x=>x.getBoundingClientRect().right>innerWidth).length);
          ok(f+' @'+w+'px: every section tab is on screen', hidden===0, hidden+' off-screen');
        }
      }
      await ctx.close();
    }
  }

  console.log('THE BUILDER HEADER KEEPS ONLY ITS LAST ROW PINNED');
  for(const w of [375,768,1024,1280]){
    const {ctx,page}=await open('character-builder-2.html',w);
    const full=await page.evaluate(()=>document.querySelector('.masthead').offsetHeight);
    await page.evaluate(()=>window.scrollTo(0,1200)); await page.waitForTimeout(120);
    const r=await page.evaluate(()=>{
      const m=document.querySelector('.masthead').getBoundingClientRect(),
            l=document.querySelector('.masthead .ledger').getBoundingClientRect(),
            b=document.querySelector('.build-tabs').getBoundingClientRect();
      return {pinned:Math.round(m.bottom), ledger:Math.round(l.top), tabs:Math.round(b.top)};
    });
    ok('@'+w+'px: the Build/Sheet + ledger row stays on screen', r.ledger>=0, JSON.stringify(r));
    ok('@'+w+'px: the sticky build tabs sit below the header, not behind it', r.tabs>=r.pinned, JSON.stringify(r));
    ok('@'+w+'px: a wrapped header shrinks to ≤ 90 px once scrolled', full<=90 || r.pinned<=90, 'full '+full+', pinned '+r.pinned);
    await ctx.close();
  }

  console.log('SMALL CONTROLS ARE EASY TO TAP ON A PHONE');
  {
    const {ctx,page}=await open('character-builder-2.html',375,true);
    const views=[['build/attributes',null],['build/talents','talents'],['build/spellbook','spellbook'],['build/equipment','equipment']];
    for(const [label,sub] of views){
      if(sub){ await page.evaluate(s=>document.querySelector('.bt[data-sub="'+s+'"]').click(), sub); await page.waitForTimeout(80); }
      const bad=await page.evaluate(TAPS); ok('builder '+label+': every control has a 24 px target', bad.length===0, bad.join(' | '));
    }
    await page.evaluate(()=>document.querySelector('.vt[data-view="sheet"]').click()); await page.waitForTimeout(120);
    let bad=await page.evaluate(TAPS); ok('builder sheet: every control has a 24 px target', bad.length===0, bad.join(' | '));
    await page.click('#diceFab'); await page.waitForTimeout(250);
    bad=await page.evaluate(TAPS); ok('builder dice tray: every control has a 24 px target', bad.length===0, bad.join(' | '));
    await ctx.close();
  }
  {
    const {ctx,page}=await open('encounter-control.html',375,true);
    const fab=await page.$('#diceFab, .dice-fab'); if(fab){ await fab.click(); await page.waitForTimeout(250); }
    const bad=await page.evaluate(TAPS); ok('The Fray dice tray: every control has a 24 px target', bad.length===0, bad.join(' | '));
    await ctx.close();
  }
  {
    /* mid-fight on a phone: the controls a DM taps most (±, hit / heal / temp, "roll +N") */
    const {ctx,page,errs}=await open('encounter-control.html',375,true);
    page.on('dialog',d=>d.accept().catch(()=>{}));
    const n=await page.evaluate(()=>{ const F=window.__fray; if(!F) return 0;
      [0,5,40].forEach(i=>{ if(F.BESTIARY[i]) F.addTemplate(i,2,'foe'); }); F.renderAll(); return F.S.cs.length; });
    ok('The Fray: combatants added through the local hook', n>=4, 'combatants: '+n);
    let bad=await page.evaluate(TAPS); ok('The Fray roster: every control has a 24 px target', bad.length===0, bad.join(' | '));
    await page.click('#btnRoll'); await page.click('#btnStart'); await page.waitForTimeout(200);
    const o=await page.evaluate(OVERFLOW); ok('The Fray mid-fight @375px: no sideways scroll', o.extra<=0, o.who);
    bad=await page.evaluate(TAPS); ok('The Fray mid-fight: every control has a 24 px target', bad.length===0, bad.join(' | '));
    ok('The Fray mid-fight: no errors', errs.length===0, errs[0]);
    await ctx.close();
  }

  console.log('TEXT IS READABLE');
  for(const f of PAGES){
    const {ctx,page}=await open(f,1280);
    await page.addStyleTag({content:'*,*::before,*::after{transition:none !important; animation:none !important}'});
    let bad=await page.evaluate(CONTRAST); ok(f+': all text meets AA contrast', bad.length===0, bad.slice(0,3).join(' | '));
    if(f==='character-builder-2.html'){
      await page.evaluate(()=>{ S.level=8; S.budget=40; S.attr.INT=16; S.talents["Mana"]={level:3,choices:[]}; renderAll(); });
      for(const sub of ['talents','spellbook','equipment']){
        await page.evaluate(s=>document.querySelector('.bt[data-sub="'+s+'"]').click(), sub); await page.waitForTimeout(60);
        bad=await page.evaluate(CONTRAST); ok(f+' build/'+sub+': all text meets AA contrast', bad.length===0, bad.slice(0,3).join(' | '));
      }
      await page.evaluate(()=>document.querySelector('.vt[data-view="sheet"]').click()); await page.waitForTimeout(80);
      bad=await page.evaluate(CONTRAST); ok(f+' sheet: all text meets AA contrast', bad.length===0, bad.slice(0,3).join(' | '));
    }
    if(f==='encounter-control.html'){
      page.on('dialog',d=>d.accept().catch(()=>{}));
      await page.evaluate(()=>{ const F=window.__fray; [0,5,40].forEach(i=>F.addTemplate(i,2,'foe')); F.renderAll(); });
      await page.click('#btnRoll'); await page.click('#btnStart'); await page.waitForTimeout(120);
      bad=await page.evaluate(CONTRAST); ok(f+' mid-fight: all text meets AA contrast', bad.length===0, bad.slice(0,3).join(' | '));
    }
    if(f==='compendium-and-bestiary.html'){
      const secs=await page.$$eval('.secnav-tab', t=>t.map(x=>x.dataset.section)); const worst=[];
      for(const sec of secs){ await page.evaluate(s=>document.querySelector('.secnav-tab[data-section="'+s+'"]').click(), sec);
        const b=await page.evaluate(CONTRAST); if(b.length) worst.push(sec+': '+b[0]); }
      ok(f+': all '+secs.length+' sections meet AA contrast', worst.length===0, worst.slice(0,3).join(' | '));
    }
    await ctx.close();
  }

  await browser.close(); s.close();
  console.log('\n'+(fail?'FAILED':'ALL PASS')+'  —  '+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(e=>{ console.log('  FAIL: suite crashed   ['+e.message+']'); console.log('\n  '+pass+' passed, '+(fail+1)+' failed'); process.exit(1); });
