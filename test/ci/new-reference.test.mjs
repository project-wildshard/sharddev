// Ring 2: the real default project generates a complete procedural world,
// then walks through its real door and restores its save. Full bakes exceed
// J186's quick-case budget; this test never joins hook discovery.
import '@wildshard/engine/scripts/sim-node-loader.mjs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {createHash} from 'node:crypto';
import {brotliCompressSync, brotliDecompressSync, constants} from 'node:zlib';
import {after, test} from 'node:test';
import {installWildshard} from '../../src/test/helpers/install.ts';

const parent=process.env.WS_PROOF_SCRATCH??tmpdir();
mkdirSync(parent,{recursive:true});
const root=mkdtempSync(join(parent,'new-reference-'));
after(()=>rmSync(root,{recursive:true,force:true}));
const bin=installWildshard(root), app=join(root,'app'), source=join(app,'first-island'), output=join(app,'product');
let referenceDoor;
const doorSegments=[
 {id:'distant-door',ticks:1,commands:[{kind:'interact',id:'template.door.use'}]},
 {id:'approach',ticks:130,commands:[{kind:'player',moveX:0,moveZ:-1,yaw:0}]},
 {id:'open-door',ticks:1,commands:[{kind:'interact',id:'template.door.use'}]},
 {id:'door-status',ticks:2,commands:[]},
 {id:'cross-door',ticks:80,commands:[{kind:'player',moveX:0,moveZ:-1,yaw:0}]},
 {id:'settle',ticks:20,commands:[]},
];
const doorOutcomes=observations=>observations.map(({id,position,grounded,flags})=>({id,position,grounded,flags}));
function cli(args, success=true) {
 const done=spawnSync(process.execPath,[bin,...args],{cwd:app,encoding:'utf8',timeout:90_000,
  env:{...process.env,WILDSHARD_GEN_CACHE:join(root,'generation'),WILDSHARD_SHARDFILE_CACHE:join(root,'compiler')}});
 assert.ifError(done.error);
 if(success) assert.equal(done.status,0,`${done.stdout}\n${done.stderr}`);
 else assert.notEqual(done.status,0,'Existing author work must not be overwritten');
}
test('default new builds an independently named playable reference', {timeout:120_000},()=>{
 cli(['new',source,'first-island']);
 cli(['new',source,'first-island'],false);
 cli(['build',source,output,'--product-only']);
});
test('the new author opens and crosses the real door, then resumes', {timeout:60_000},async()=>{
 const {loadHeadlessProduct}=await import('@wildshard/engine/host/headlessProduct');
 const {HeadlessSimulation}=await import('@wildshard/engine/host/headless');
 const {productHeadlessSections}=await import('@wildshard/engine/host/headlessSections');
 const {outputDescriptor}=await import('@wildshard/engine/game/shardfile/outputDescriptor');
 const product=await loadHeadlessProduct(output), shard=product.shardfile, descriptor=outputDescriptor(shard);
 assert.equal(shard.identity.slug,'first-island');
 const assets=new Map(descriptor.index.files.map(file=>[file.commons===true?`commons:${file.hash}`:file.hash,readFileSync(join(output,file.path))]));
 const worlds=[];
 const create=async snapshot=>{const world=await HeadlessSimulation.create(shard,assets,snapshot,{deadline:'advisory',sections:productHeadlessSections(product)});worlds.push(world);return world;};
 try {
  const world=await create();
  let last; const observations=[];
  for(const segment of doorSegments){last=await world.verbTapePart({version:1,observe:[],segments:[segment]});observations.push(...last.report.observations);}
  assert.ok(!observations[0].flags.includes('template.door-open'),'A distant use must not open the real door');
  assert.ok(observations.at(-1).flags.includes('template.door-open'),'The author must physically reach and open the door');
  assert.ok(observations.at(-1).position[2]<-10,'The open panel must allow actual movement into the hut');
  const resumed=await create(last.commit.snapshot);
  const suffix={version:1,observe:[],segments:[{id:'resume',ticks:5,commands:[]}]};
  const a=await world.verbTapePart(suffix),b=await resumed.verbTapePart(suffix);
  assert.equal(a.commit.snapshot,b.commit.snapshot); assert.deepEqual(a.commit.effects,b.commit.effects); assert.deepEqual(a.report,b.report);
  referenceDoor=doorOutcomes(observations);
 } finally {for(const world of worlds)await world.dispose();}
});

// SD-19, Ring 2: fetch and hash-check the complete public Template 1 tar
// named by engine v0.1.1's pin, then run the same physical input journey.
// This is an immutable external product, not an engine test/source import.
// Measured 12.96 s locally including the cold download and real worker.
test('the engine Template 1 pin agrees with the newly authored real door journey',{timeout:120_000},async()=>{
 const hash='b8380a16f5da7824736480c03295ec26e4ad758435dac98cb5ff6d94d770dd44';
 let bytes;
 for(const url of [`https://github.com/project-wildshard/engine/releases/download/pins/${hash}.tar`,`https://api.wildshard.io/api/shardfiles/${hash}`]){
  const response=await fetch(url,{signal:AbortSignal.timeout(20_000)}).catch(()=>undefined);
  if(response?.ok!==true)continue;
  bytes=new Uint8Array(await response.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,'A mirror must serve the exact pin');break;
 }
 assert.ok(bytes,'The mirror or API must hold the immutable engine pin');
 const tar=join(root,'engine-template.tar'),folder=join(root,'engine-template');
 writeFileSync(tar,bytes);mkdirSync(folder);
 const extracted=spawnSync('tar',['-xf',tar,'-C',folder],{encoding:'utf8',timeout:10_000});
 assert.ifError(extracted.error);assert.equal(extracted.status,0,extracted.stderr);
 const {loadHeadlessProduct}=await import('@wildshard/engine/host/headlessProduct');
 const {HeadlessSimulation}=await import('@wildshard/engine/host/headless');
 const {productHeadlessSections}=await import('@wildshard/engine/host/headlessSections');
 const {outputDescriptor}=await import('@wildshard/engine/game/shardfile/outputDescriptor');
 const product=await loadHeadlessProduct(folder),shard=product.shardfile,descriptor=outputDescriptor(shard);
 assert.equal(shard.identity.slug,'template');assert.equal(shard.identity.revision,2);
 const assets=new Map(descriptor.index.files.map(file=>[file.commons===true?`commons:${file.hash}`:file.hash,readFileSync(join(folder,file.path))]));
 const world=await HeadlessSimulation.create(shard,assets,undefined,{deadline:'advisory',sections:productHeadlessSections(product)});
 try{
  const observations=[];
  for(const segment of doorSegments){const part=await world.verbTapePart({version:1,observe:[],segments:[segment]});observations.push(...part.report.observations);}
  assert.ok(referenceDoor,'The newly built author must establish its real control journey');
  assert.deepEqual(doorOutcomes(observations),referenceDoor,'Pinned and newly authored door play must agree');
  console.log(`engine Template 1 pin ${hash}: ${bytes.length} bytes; actual door journey agrees`);
 }finally{await world.dispose();}
});

// Ring 2: cold q11 part encoding and a complete procedural product cannot
// fit a quick case. This is a real cook, with its own encoder and workers.
test('the installed author cooks its complete tar and admits cooked server sections', {timeout:240_000},async()=>{
 const tar=join(root,'reference.tar'),cooked=join(root,'cooked'),unpacked=join(root,'server-files');
 cli(['pack',output,'--out',tar]);
 const previous=process.env.WILDSHARD_SPAWN_PART_CACHE;
 process.env.WILDSHARD_SPAWN_PART_CACHE=join(root,'cold-parts');
 try {
  const {cookShard,servedAsIs}=await import('@wildshard/engine/game/shardCook');
  const {readServerPackBook,serverPackFile}=await import('@wildshard/engine/game/shardfile/serverPack');
  const {loadHeadlessProduct}=await import('@wildshard/engine/host/headlessProduct');
  const {productHeadlessSections}=await import('@wildshard/engine/host/headlessSections');
  const report=await cookShard(readFileSync(tar),cooked,{now:()=>performance.now(),
   wireBytes:(url,bytes)=>servedAsIs(url,bytes)?bytes.length:brotliCompressSync(bytes,{params:{[constants.BROTLI_PARAM_QUALITY]:4}}).length});
  assert.equal(report.slug,'first-island');assert.equal(report.manifests.length,4);assert.ok(report.parts.count>0);
  for(const row of report.manifests){
   const manifest=JSON.parse(readFileSync(join(cooked,row.url),'utf8'));assert.equal(manifest.shard,report.slug);
   for(const part of manifest.parts??[]){
    const body=brotliDecompressSync(readFileSync(join(cooked,part.url)));
    assert.equal(body.length,part.bytes);assert.equal(createHash('sha256').update(body).digest('hex'),part.hash);
    for(const [index,offset] of part.members){const file=manifest.files[index],bytes=body.subarray(offset,offset+file.bytes);
     assert.equal(createHash('sha256').update(bytes).digest('hex'),file.hash);}
   }
  }
  const raw=JSON.parse(readFileSync(join(cooked,report.server.index),'utf8'));
  const pack=readServerPackBook({book:'server',build:'outside-author',shards:{[report.slug]:raw}}).shards[report.slug];
  for(const part of [pack,...pack.more??[]]){
   const body=brotliDecompressSync(readFileSync(join(cooked,part.url)));
   assert.equal(body.length,part.bytes);assert.equal(createHash('sha256').update(body).digest('hex'),part.hash);
   for(const [name] of part.files){const target=join(unpacked,name);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,serverPackFile(part,body,name));}
  }
  // Admission reads only extracted, hash-verified server pack files.
  // Public HeadlessSimulation requires every original client asset, even
  // variants the cook deliberately excludes. Cooked-only worker play needs
  // the production server-product admission boundary to be exported by engine.
  // The preceding test separately proves real door play and save continuation.
  const product=await loadHeadlessProduct(unpacked);
  assert.equal(product.shardfile.identity.slug,report.slug);
  assert.ok(productHeadlessSections(product).size>0);
  console.log(`cooked reference: ${report.server.files} server files, ${report.parts.count} parts, ${report.seconds.toFixed(2)} seconds`);
 } finally {
  if(previous===undefined)delete process.env.WILDSHARD_SPAWN_PART_CACHE;else process.env.WILDSHARD_SPAWN_PART_CACHE=previous;
 }
});
