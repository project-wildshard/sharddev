// MU3: real Playwright processes, explicit CI-only browser proof (outside hooks).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {join,resolve,basename,dirname} from 'node:path';
import {webkit} from 'playwright';
import {launchPreparationBrowser} from '../../scripts/preparation-browser.mjs';

const root=resolve(import.meta.dirname,'../..');
function refusal(hang){
  const parent=join(root,'tmp/codex-netlag');mkdirSync(parent,{recursive:true});
  const dir=mkdtempSync(join(parent,'launch-'));
  try{
    const candidate=join(dir,'candidate'),browsers=join(dir,'browsers'),cache=join(dir,'client');
    mkdirSync(candidate);mkdirSync(browsers);
    const original='{"sdk":"0.2","untouched":true}\n';
    writeFileSync(join(candidate,'shard.json'),original);
    const pidFile=join(dir,'browser.pid');
    if(hang){
      const folder=join(browsers,basename(dirname(webkit.executablePath())));mkdirSync(folder);
      writeFileSync(join(folder,'pw_run.sh'),`#!/bin/sh\nprintf '%s' "$$" > "$F30_PID"\nexec "${process.execPath}" -e 'setInterval(()=>{},1000)'\n`,{mode:0o755});
    }
    const at=Date.now();
    const run=spawnSync(process.execPath,[join(root,'bin/wildshard.mjs'),'prepare',candidate],{cwd:dir,encoding:'utf8',timeout:65000,env:{...process.env,PLAYWRIGHT_BROWSERS_PATH:browsers,WILDSHARD_DEV_CLIENT_CACHE:cache,F30_PID:pidFile}});
    assert.equal(run.error,undefined);
    assert.equal(run.status,1);
    assert.equal(run.stdout,'');
    assert.equal(run.stderr.trim().split('\n').length,1);
    assert.match(run.stderr,/Phone WebKit .*Playwright .*pnpm dlx playwright@.* install webkit.*another macOS\/Linux machine.*Candidate left as a draft/u);
    assert.doesNotMatch(run.stderr,/at |fetching|TimeoutError|node:internal/u);
    assert.equal(readFileSync(join(candidate,'shard.json'),'utf8'),original);
    assert.equal(existsSync(cache),false);
    if(hang){
      assert.match(run.stderr,/within 20 seconds/u);
      // Playwright allows a further 30 seconds to gracefully close a stuck
      // process before force-killing it. Bound the complete user-visible wait.
      assert.ok(Date.now()-at<60000);
      const pid=Number(readFileSync(pidFile,'utf8'));
      assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
}
test('missing WebKit refuses before downloading and leaves the draft untouched',()=>refusal(false));
test('unresponsive WebKit is killed at the bounded launch and emits one fallback',{timeout:70000},()=>refusal(true));
test('installed headless WebKit opens an isolated phone page',{timeout:35000},async()=>{
  const browser=await launchPreparationBrowser();
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    try{const page=await context.newPage();await page.setContent('<p>phone preparation</p>');assert.equal(await page.locator('p').textContent(),'phone preparation');}
    finally{await context.close();}
  }finally{await browser.close();}
});
