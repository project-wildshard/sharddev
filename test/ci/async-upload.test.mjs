import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {text} from 'node:stream/consumers';
import {after,before,test} from 'node:test';
import {installWildshard} from '../../src/test/helpers/install.ts';
import {REPORT,TARBALL,openApi} from './async-upload-fixture.mjs';

const SCRATCH=resolve('tmp/codex-wire');
await mkdir(SCRATCH,{recursive:true});
let CLI,installed;
before(async()=>{
  installed=await mkdtemp(join(SCRATCH,'api-installed-'));
  CLI=installWildshard(installed);
});
after(async()=>{if(installed!==undefined)await rm(installed,{recursive:true,force:true});});

async function runCli(context,fixture,file){
  const child=spawn(process.execPath,[CLI,'upload',file,'--server',fixture.url,
    '--version','0.1.0','--commit','a'.repeat(40),'--channel','staging'],{
    env:{PATH:process.env.PATH,WILDSHARD_API_KEY:fixture.apiKey},
    stdio:['ignore','pipe','pipe'],
  });
  context.after(()=>{if(child.exitCode===null)child.kill('SIGTERM');});
  const stdout=text(child.stdout),stderr=text(child.stderr);
  await once(child,'close');
  return {code:child.exitCode,stdout:await stdout,stderr:await stderr};
}

for(const mode of ['live','refused','stalled']){
  test(`SP21 actual API/PGlite ${mode} reaches the CLI with the same upload id`,
    {timeout:30_000},async context=>{
      const dir=await mkdtemp(join(SCRATCH,'api-contract-'));
      context.after(()=>rm(dir,{recursive:true,force:true}));
      const file=join(dir,'shard.tar');
      await writeFile(file,TARBALL);
      const fixture=await openApi(context,mode);
      const done=await runCli(context,fixture,file);
      assert.ok(fixture.id,done.stderr);
      assert.equal(done.code,mode==='live'?0:3,done.stderr);
      assert.ok(done.stdout.includes(`upload ${fixture.id}: ${mode}`),done.stdout);
      const status=await fixture.catalogue.uploads.byHash(fixture.hash);
      assert.equal(status.status,mode);
      const pointers=await fixture.sql.query("select name,pointers from channels order by name");
      const playing=pointers.rows.filter(row=>Object.values(row.pointers).includes(fixture.hash));
      if(mode==='live'){
        assert.deepEqual(fixture.states,['cooking','staged','live']);
        assert.equal(playing.length,2);
        assert.match(done.stdout,/placed at/u);
        assert.match(done.stdout,/committed: async-sdk-isle 0.1.0 catalogue number 1/u);
      }else{
        assert.deepEqual(fixture.states,[mode]);
        assert.equal(playing.length,0);
        assert.doesNotMatch(done.stdout,/placed at|committed:/u);
      }
      if(mode==='refused'){
        assert.deepEqual(status.report,REPORT);
        const printed=done.stdout.slice(done.stdout.indexOf('{\n')).trim();
        assert.deepEqual(JSON.parse(printed),REPORT);
      }
    });
}
