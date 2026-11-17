// C2 source originals keep full case/body and file membership outside hooks.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {titles} from './ci21-test-declarations.mjs';
import {lintEnvironment} from '../../../kit/scripts/bin-tools.mjs';
const manifest=JSON.parse(readFileSync('test/ci21-source/manifest.json','utf8'));
const files=manifest.files.map(row=>row.targetPath);
assert.equal(new Set(files).size,files.length,'Every source port is recorded once');
assert.deepEqual(readdirSync('test/ci21-source').filter(file=>file.endsWith('.source.ts')||file.endsWith('.draft.ts')).map(file=>`test/ci21-source/${file}`).sort(),[...files].sort(),'No unrecorded or missing source port');
for(const row of manifest.files){
 assert.match(row.sourceBlob,/^[a-f0-9]{40}$/u);
 assert.deepEqual(titles(row.targetPath),row.targetTests,'Every admitted executable declaration, no skip/todo/alias');
 for(const title of row.originalTests){
  if((row.delegatedOriginalTests??[]).includes(title)){
   if(row.partial){
    assert.equal(row.engineRemovalAllowed,false,'A partial original cannot grant removal credit');
    assert.ok(row.outstandingOwnerProofs?.length>0,'Every delegated part names its owner debt');
   }else{
    assert.equal(row.sourcePath,'test/map-source-inputs.test.ts','Only the complete recorded map split is admitted');
    assert.equal(row.engineRemovalAllowed,true);
    assert.deepEqual(row.outstandingOwnerProofs,[]);
    const owners=['brasscap-mesa','driftwood-isle','far-reach','nalati-grasslands','nine-dragon-stack','open-plots','pine-hollow','sunscar-dunes'];
    assert.deepEqual(row.ownerProofs.map(proof=>proof.owner).sort(),owners.sort(),'Every original owner component has exactly one disposition');
    for(const proof of row.ownerProofs){
     assert.match(proof.repository,/^project-wildshard\/shard-[a-z-]+$/u);
     assert.match(proof.revision,/^[a-f0-9]{40}$/u); assert.match(proof.targetBlob,/^[a-f0-9]{40}$/u);
     assert.ok(Number.isSafeInteger(proof.run)&&proof.run>0);
     assert.ok(Array.isArray(proof.cases)&&proof.cases.length>0);
     if(proof.owner==='brasscap-mesa'){
      assert.equal(proof.outcome,'retired-case-component'); assert.equal(proof.decision,'J232/J342');
      assert.ok(proof.reason.length>40);
     }else assert.equal(proof.outcome,'landed','Every live owner retains the actual original assertions');
    }
    assert.equal(row.ownerProofs.find(proof=>proof.owner==='nine-dragon-stack').cases.length,2,'Nine retains all extra roots');
   }
  }else assert.ok(row.targetTests.includes(title),`Original case missing: ${title}`);
 }
 assert.equal(createHash('sha256').update(readFileSync(row.targetPath)).digest('hex'),row.targetSha256,'Reviewed source body changed; refresh its integrity record');
}
const run=spawnSync('pnpm',['exec','oxlint','--type-aware','--tsconfig','test/ci21-source/tsconfig.json','-c','.oxlintrc.author.json','--deny-warnings',...files],{stdio:'inherit',env:lintEnvironment(new URL('../../..',import.meta.url).pathname)});
if(run.error!==undefined)throw run.error;
process.exitCode=run.status??1;
