#!/usr/bin/env node
/* Run every suite in test/ and report once.
 *
 *   npm test                 all suites
 *   node test/run.js spell   only suites whose name matches
 *
 * Each suite is a standalone script that exits non-zero on failure, so this runner just spawns
 * them, tallies, and fails the build if any did. Output from a passing suite is swallowed; a
 * failing one is printed in full, because that is the moment you want the detail.
 */
const fs=require('fs'), path=require('path'), {spawnSync}=require('child_process');

const DIR=__dirname;
const filter=process.argv.slice(2).filter(a=>!a.startsWith('-'))[0];
let files=fs.readdirSync(DIR).filter(f=>f.endsWith('.test.js')).sort();
if(filter) files=files.filter(f=>f.includes(filter));

if(!files.length){
  console.error(filter ? `no suite matches "${filter}"` : 'no suites found in test/');
  process.exit(1);
}

try{ require('jsdom'); }
catch(e){
  console.error('jsdom is not installed.  Run:  npm install\n');
  process.exit(1);
}

const t0=Date.now();
let totalPass=0, totalFail=0, broken=0;
const rows=[];

for(const f of files){
  const started=Date.now();
  const r=spawnSync(process.execPath,[path.join(DIR,f)],{encoding:'utf8'});
  const out=(r.stdout||'')+(r.stderr||'');
  const last=out.trim().split('\n').pop()||'';
  const m=last.match(/(\d+)\s+passed,\s+(\d+)\s+failed/);
  const p=m?+m[1]:0, fl=m?+m[2]:0;
  totalPass+=p; totalFail+=fl;
  const secs=((Date.now()-started)/1000).toFixed(1);

  if(r.status===0 && m){
    rows.push(['ok  ', f, p+' passed', secs+'s']);
  }else if(m){
    rows.push(['FAIL', f, p+' passed, '+fl+' failed', secs+'s']);
    console.log('\n' + '─'.repeat(64) + '\n' + f + '\n' + '─'.repeat(64));
    console.log(out.trim());
  }else{
    broken++;
    rows.push(['ERR ', f, 'did not report', secs+'s']);
    console.log('\n' + '─'.repeat(64) + '\n' + f + ' — did not finish\n' + '─'.repeat(64));
    console.log(out.trim().split('\n').slice(-25).join('\n'));
  }
}

const w=Math.max(...rows.map(r=>r[1].length));
console.log('');
for(const [tag,name,res,secs] of rows)
  console.log('  %s %s  %s  %s', tag, name.padEnd(w), res.padEnd(18), secs);

const bad=totalFail+broken;
console.log('\n  %s — %d assertions across %d suites in %ss%s\n',
  bad ? 'FAILED' : 'ALL PASS', totalPass+totalFail, files.length,
  ((Date.now()-t0)/1000).toFixed(1),
  bad ? `  (${totalFail} failed${broken?`, ${broken} did not finish`:''})` : '');

process.exit(bad?1:0);
