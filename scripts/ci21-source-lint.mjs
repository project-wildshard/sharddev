// C2 source originals keep full case/body and file membership outside hooks.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {titles} from './ci21-test-declarations.mjs';
import {lintEnvironment} from '../kit/scripts/bin-tools.mjs';
const manifest=JSON.parse(readFileSync('test/ci21-source/manifest.json','utf8'));
const files=manifest.files.map(row=>row.targetPath);
assert.equal(new Set(files).size,files.length,'Every source port is recorded once');
assert.deepEqual(readdirSync('test/ci21-source').filter(file=>file.endsWith('.source.ts')||file.endsWith('.draft.ts')).map(file=>`test/ci21-source/${file}`).sort(),[...files].sort(),'No unrecorded or missing source port');
for(const row of manifest.files){
 assert.match(row.sourceBlob,/^[a-f0-9]{40}$/u);
 assert.deepEqual(titles(row.targetPath),row.targetTests,'Every admitted executable declaration, no skip/todo/alias');
 for(const title of row.originalTests){
  if((row.delegatedOriginalTests??[]).includes(title)){
   assert.equal(row.partial,true,'Delegated originals remain partial');
   assert.equal(row.engineRemovalAllowed,false,'A partial original cannot grant removal credit');
   assert.ok(row.outstandingOwnerProofs?.length>0,'Every delegated part names its owner debt');
  }else assert.ok(row.targetTests.includes(title),`Original case missing: ${title}`);
 }
 assert.equal(createHash('sha256').update(readFileSync(row.targetPath)).digest('hex'),row.targetSha256,'Reviewed source body changed; refresh its integrity record');
}
const run=spawnSync('pnpm',['exec','oxlint','--type-aware','--tsconfig','test/ci21-source/tsconfig.json','-c','.oxlintrc.author.json','--deny-warnings',...files],{stdio:'inherit',env:lintEnvironment()});
if(run.error!==undefined)throw run.error;
process.exitCode=run.status??1;
