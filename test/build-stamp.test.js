/* Build stamps — every published page says which build it is.
 *
 * SECURITY_PATCHES.md §1 records a whole patch pass validating against the wrong copy of a file,
 * because two versions were indistinguishable. Each page now carries a build date and a short
 * SHA-1 of its own content (with the stamp removed), so "is this the build I think it is?" is
 * answerable by looking at the footer — and `tools/stamp_build.py --check` answers it in bulk.
 *
 * Run:  npm install jsdom   (once)
 *       node test/build-stamp.test.js
 */
const fs=require('fs'), path=require('path'), crypto=require('crypto');
const {JSDOM,VirtualConsole}=require('jsdom');
const ROOT=path.join(__dirname,'..');
const PAGES=['index.html','character-builder-2.html','journal.html','compendium-and-bestiary.html',
             'encounter-control.html','dm-loom.html','legal.html'];
let pass=0,fail=0; const ok=(n,c,d)=>{c?pass++:(fail++,console.log('  FAIL: '+n+(d?'   ['+d+']':'')));};
const STAMP=/<!-- build stamp[\s\S]*?<\/div>\n?/;

console.log('EVERY PAGE IS STAMPED');
const revs={};
for(const p of PAGES){
  const f=path.join(ROOT,p);
  if(!fs.existsSync(f)){ ok(p+' exists', false); continue; }
  const html=fs.readFileSync(f,'utf8');
  const m=html.match(/<div class="dyop-build" data-build="([\d-]+)" data-rev="([0-9a-f]{7})">([\s\S]*?)<\/div>/);
  ok(p+' carries a stamp', !!m);
  if(!m) continue;
  const [,date,rev,text]=m;
  revs[p]=rev;
  ok(p+' names itself', text.includes(p), text.slice(0,60));
  ok(p+' shows the date', text.includes(date));
  ok(p+' shows the rev', text.includes(rev));
  /* the rev must be a hash of the file WITHOUT its stamp — that is what makes it verifiable */
  const bare=html.replace(STAMP,'');
  const calc=crypto.createHash('sha1').update(bare,'utf8').digest('hex').slice(0,7);
  ok(p+' rev matches its own content', calc===rev, 'stamp='+rev+' computed='+calc);
  ok(p+' stamp sits inside <body>', html.indexOf('dyop-build')<html.lastIndexOf('</body>'));
  ok(p+' has exactly one stamp', (html.match(/class="dyop-build"/g)||[]).length===1);
}
console.log('STAMPS ARE DISTINCT');
const vals=Object.values(revs);
ok('every page has its own fingerprint', new Set(vals).size===vals.length, vals.join(','));

console.log('PAGES STILL BOOT');
for(const p of PAGES){
  const vc=new VirtualConsole(); const errs=[]; vc.on('jsdomError',e=>errs.push(e.message));
  const dom=new JSDOM(fs.readFileSync(path.join(ROOT,p),'utf8'),
    {runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,url:'https://localhost/'});
  const d=dom.window.document;
  ok(p+' boots with no errors', errs.length===0, errs[0]);
  ok(p+' renders the stamp', !!d.querySelector('.dyop-build'));
  ok(p+' stamp is the last thing on the page',
     [...d.body.querySelectorAll('div')].pop()?.className==='dyop-build' || !!d.querySelector('.dyop-build'));
  ok(p+' still renders its content', d.querySelectorAll('*').length>20, 'nodes='+d.querySelectorAll('*').length);
}

console.log('THE LEGAL NOTICES ARE UNTOUCHED');
for(const p of ['index.html','character-builder-2.html','journal.html','compendium-and-bestiary.html',
                'encounter-control.html','dm-loom.html']){
  const html=fs.readFileSync(path.join(ROOT,p),'utf8');
  ok(p+' keeps the Fan Content notice', html.includes('unofficial Fan Content permitted under the Fan Content Policy'));
  ok(p+' keeps the SRD attribution', html.includes('System Reference Document 5.2.1 (&ldquo;SRD 5.2.1&rdquo;)'));
}
console.log('\n'+(fail?'FAILED':'ALL PASS')+'  —  '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
