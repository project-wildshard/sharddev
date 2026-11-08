// Ring 2: the real default project generates a complete procedural world,
// then walks through its real door and restores its save. Full bakes exceed
// J186's quick-case budget; this test never joins hook discovery.
import '@wildshard/engine/scripts/sim-node-loader.mjs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {after, test} from 'node:test';
import {installWildshard} from '../../src/test/helpers/install.ts';

const parent=process.env.WS_PROOF_SCRATCH??tmpdir();
mkdirSync(parent,{recursive:true});
const root=mkdtempSync(join(parent,'new-reference-'));
after(()=>rmSync(root,{recursive:true,force:true}));
const bin=installWildshard(root), app=join(root,'app'), source=join(app,'first-island'), output=join(app,'product');
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
  const segments=[
   {id:'distant-door',ticks:1,commands:[{kind:'interact',id:'template.door.use'}]},
   {id:'approach',ticks:130,commands:[{kind:'player',moveX:0,moveZ:-1,yaw:0}]},
   {id:'open-door',ticks:1,commands:[{kind:'interact',id:'template.door.use'}]},
   {id:'door-status',ticks:2,commands:[]},
   {id:'cross-door',ticks:80,commands:[{kind:'player',moveX:0,moveZ:-1,yaw:0}]},
   {id:'settle',ticks:20,commands:[]},
  ];
  let last; const observations=[];
  for(const segment of segments){last=await world.verbTapePart({version:1,observe:[],segments:[segment]});observations.push(...last.report.observations);}
  assert.ok(!observations[0].flags.includes('template.door-open'),'A distant use must not open the real door');
  assert.ok(observations.at(-1).flags.includes('template.door-open'),'The author must physically reach and open the door');
  assert.ok(observations.at(-1).position[2]<-10,'The open panel must allow actual movement into the hut');
  const resumed=await create(last.commit.snapshot);
  const suffix={version:1,observe:[],segments:[{id:'resume',ticks:5,commands:[]}]};
  const a=await world.verbTapePart(suffix),b=await resumed.verbTapePart(suffix);
  assert.equal(a.commit.snapshot,b.commit.snapshot); assert.deepEqual(a.commit.effects,b.commit.effects); assert.deepEqual(a.report,b.report);
 } finally {for(const world of worlds)await world.dispose();}
});
