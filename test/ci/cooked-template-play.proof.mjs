// Explicit Ring 2 only: real cold cooks use the same 600 s case and
// 15 minute hosted-job limits as the native shard proofs. Never local.
import '@wildshard/engine/scripts/sim-node-loader.mjs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {brotliCompressSync,brotliDecompressSync,constants} from 'node:zlib';
import {test} from 'node:test';

assert.equal(process.env.GITHUB_ACTIONS,'true','Cold cooking runs only in hosted Actions');
assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted','No self-hosted cook');
const engine=process.env.COOKED_ENGINE_CANDIDATE;assert.match(engine??'',/^[a-f0-9]{40}$/u);
const {loadCookedProduct,loadHeadlessProduct}=await import('@wildshard/engine/host/headlessProduct');
assert.equal(typeof loadCookedProduct,'function','The candidate must publish cooked-product admission before any cook');
const {openWorld}=await import('@wildshard/engine/host/openWorld');
const {loadRapier}=await import('@wildshard/engine/physics/rapier');
const {cookShard,servedAsIs}=await import('@wildshard/engine/game/shardCook');
const {readServerPack,serverPackFile}=await import('@wildshard/engine/game/shardfile/serverPack');
const {snapshotSimHostBytes,serializeSimSnapshot}=await import('@wildshard/engine/sim/snapshot');
const {manifestFolders,shardProducts}=await import('@wildshard/engine/scripts/shard-outputs.mjs');
const {NET_BUTTONS}=await import('@wildshard/engine/input/netButtons');
const expected=shardProducts(process.cwd(),manifestFolders(process.cwd())).map(row=>row.slug).sort();
assert.deepEqual(expected,['_template','ink-cel-valley','pastel-plain'],'The complete SDK template family is required');
assert.deepEqual(readdirSync('out',{withFileTypes:true}).filter(row=>row.isDirectory()&&!row.name.startsWith('.')&&row.name!=='tars').map(row=>row.name).sort(),expected);
const [part,parts]=(process.env.COOKED_PART??'1/1').split('/').map(Number);
assert.ok(Number.isInteger(part)&&Number.isInteger(parts)&&part>=1&&part<=parts&&parts<=expected.length,'A nonempty bounded partition');
const selected=expected.filter((_,index)=>index%parts===part-1);
const reportRoot=resolve(process.env.COOKED_REPORT_DIR??'tmp/cooked-templates');mkdirSync(reportRoot,{recursive:true});
const producer=JSON.parse(readFileSync(join(reportRoot,'producer.json'),'utf8'));
assert.equal(producer.complete,true);assert.match(producer.version,/^\d+\.\d+\.\d+$/u);
const runtime=JSON.parse(readFileSync(join(reportRoot,'runtime.json'),'utf8'));
assert.equal(runtime.complete,true);assert.equal(runtime.engine,engine);
assert.equal(runtime.resolved,`https://codeload.github.com/project-wildshard/engine/tar.gz/${engine}`);
const bin=resolve('bin/wildshard.mjs');
const engineRequire=createRequire(import.meta.resolve('@wildshard/engine/package.json'));
const rapier=await loadRapier(readFileSync(engineRequire.resolve('@dimforge/rapier3d-simd/rapier_wasm3d_bg.wasm')));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const snapshot=world=>serializeSimSnapshot(snapshotSimHostBytes(world.host));

for(const slug of selected)test(`${slug}: actual cold cook, room play and exact continuation`,{timeout:600_000},async()=>{
 const began=performance.now(),root=mkdtempSync(join(reportRoot,'cold-')),cooked=join(root,'cooked'),extracted=join(root,'server');
 const previous=process.env.WILDSHARD_SPAWN_PART_CACHE;
 process.env.WILDSHARD_SPAWN_PART_CACHE=join(root,'empty-parts');
 const result={complete:false,engine,resolved:runtime.resolved,producer,source:process.env.GITHUB_SHA,slug,part,parts,expected,selected,cold:true};
 let world,restored;
 try{
  const tar=join(root,`${slug}.tar`),packed=spawnSync(process.execPath,[bin,'pack',resolve('out',slug),'--out',tar],{encoding:'utf8',timeout:30_000});
  assert.ifError(packed.error);assert.equal(packed.status,0,`${packed.stdout}\n${packed.stderr}`);
  const source=readFileSync(tar);result.tarHash=digest(source);
  const producerProduct=await loadHeadlessProduct(resolve('out',slug));result.admittedSlug=producerProduct.shardfile.identity.slug;
  const report=await cookShard(source,cooked,{now:()=>performance.now(),wireBytes:(url,bytes)=>servedAsIs(url,bytes)?bytes.length:
   brotliCompressSync(bytes,{params:{[constants.BROTLI_PARAM_QUALITY]:4}}).length});
  assert.equal(report.slug,result.admittedSlug);assert.ok(report.parts.count>0);
  result.cookSeconds=report.seconds;result.clientParts=report.parts.count;
  const pack=readServerPack(JSON.parse(readFileSync(join(cooked,report.server.index),'utf8'))),files=new Map();
  for(const segment of [pack,...pack.more??[]]){
   const wire=readFileSync(join(cooked,segment.url));assert.equal(wire.length,segment.wireBytes);
   const body=brotliDecompressSync(wire);assert.equal(body.length,segment.bytes);assert.equal(digest(body),segment.hash);
   for(const [name,,length] of segment.files){
    const target=resolve(extracted,name);assert.ok(target.startsWith(resolve(extracted)+'/'),'Extract only under this server root');
    const bytes=serverPackFile(segment,body,name);assert.ok(bytes);assert.equal(bytes.length,length);
    if(files.has(name))assert.equal(files.get(name),digest(bytes),'Duplicate paths retain identical bytes');
    files.set(name,digest(bytes));mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);
   }
  }
  assert.ok(files.has('shard.json'));assert.equal(files.size,report.server.files);
  result.serverFiles=files.size;result.serverDigest=digest(Buffer.from(JSON.stringify([...files].sort())));
  // The only world input is the extracted directory. Source output, SDK,
  // client pack and tar bytes are never passed to the room loader.
  const create=async snapshot=>openWorld(await loadCookedProduct(extracted,rapier),{room:true,...(snapshot===undefined?{}:{snapshot})});
  world=await create();
  const player=[...world.host.players.values()][0];assert.ok(player);
  const position=()=>[player.position.x,player.position.y,player.position.z];
  const start=position(),observed=[{tick:world.host.state.tick,at:start}];let seq=0;
  const command=(yaw,jump=false)=>{seq++;return [{client:0,player:player.id,acts:[],command:{tick:seq,seq,ack:0,moveX:0,moveZ:-1,yaw,pitch:0,
   buttons:jump?NET_BUTTONS.jump:0,viewTick:0,steer:{keyX:0,keyY:1,stickX:0,stickY:0}}}];};
  // Jumping is an ordinary page input and clears real low spawn obstacles
  // (Frostline). Distant straight-line assumptions do not teleport a body.
  for(const yaw of [0,-Math.PI/2]){
   for(let tick=0;tick<120;tick++)world.step(command(yaw,tick%30===0));
   const at=position();assert.ok(at.every(Number.isFinite));observed.push({tick:world.host.state.tick,at});
  }
  assert.ok(observed.slice(1).some(row=>Math.hypot(row.at[0]-start[0],row.at[2]-start[2])>.25),'Real inputs move the player');
  const saved=snapshot(world);restored=await create(saved);
  assert.equal(snapshot(restored),saved,'The complete cooked room restores exactly, with no normalization');
  for(let tick=0;tick<5;tick++){
   const inputs=command(0);world.step(inputs);restored.step(inputs);
   assert.equal(snapshot(restored),snapshot(world),'Every suffix tick has the same whole-world continuation');
  }
  Object.assign(result,{complete:true,inputs:240,suffix:5,observed});
 }catch(error){result.error=error.stack??String(error);throw error;}
 finally{
  restored?.dispose();world?.dispose();
  if(previous===undefined)delete process.env.WILDSHARD_SPAWN_PART_CACHE;else process.env.WILDSHARD_SPAWN_PART_CACHE=previous;
  result.seconds=(performance.now()-began)/1000;
  writeFileSync(join(reportRoot,`${slug}.json`),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));rmSync(root,{recursive:true,force:true});
 }
});
