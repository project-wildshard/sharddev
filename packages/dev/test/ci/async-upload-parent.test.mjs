// SP20c3: real API/PGlite, sandboxed cook child, signed parent transport,
// exact-pack game receiver and actual World/cell host, packed normal CLI.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {text} from 'node:stream/consumers';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {test} from 'node:test';
import {installWildshard} from '../../src/test/helpers/install.ts';
import {engineScriptUrl} from '../../scripts/dev-world.mjs';
import {COOK_KEY,TARBALL,openApi,migratePending,blockedEntryTarball,maintainUploads} from './async-upload-fixture.mjs';

// runJob already supplies a credential-free environment. Retain its five
// runtime inputs across sudo; reset-env would discard the granted cache path.
// The network namespace and Node filesystem/worker permissions stay unchanged.
const cookWrap=process.platform==='darwin'?['sandbox-exec','-p','(version 1)(allow default)(deny network*)']:
  ['sudo','-n','--preserve-env=WILDSHARD_SPAWN_PART_CACHE,NODE_ENV,COOK_MAX_SHARDFILE_BYTES,COOK_CPU_SLOTS,COOK_RENDERER',
    'unshare','--net','--','setpriv',`--reuid=${process.getuid()}`,`--regid=${process.getgid()}`,'--init-groups'];

const root=dirname(createRequire(import.meta.url).resolve('@wildshard/engine/package.json'));
// A lean engine (npm 0.1.96 on) keeps its scripts in src/scripts/: read them through dev-world's resolver.
const engineScript=name=>fileURLToPath(engineScriptUrl(join(root,'package.json'),name));
await import(engineScriptUrl(join(root,'package.json'),'bake-loader.mjs'));
const engine=path=>import(pathToFileURL(join(root,path)).href);
const [{readTar},{validateShardfileFolder},{checkShardfile}]=await Promise.all([
  import('@wildshard/format/tar'),import('@wildshard/format/shardfileValidation'),
  import('@wildshard/engine/host/checkShardfile'),
]);
const [{cookApi,pendingSource,uploadDelivery,VerdictOutbox,activationDelivery,gameActivationClient},
  {createCookWorker,apiSource},{folderStore},{uploadActivator,uploadActivationReceiver},
  {readPlacementFile},{readPackFolder},{World},{memoryPlayerSaves},{runCells},
  {placeCell,forgetPlacedCells},{loadRapier}, {placementWriter}]=await Promise.all([
  engine('src/cook/game/uploadTransport.ts'),engine('src/cook/game/cookWorker.ts'),engine('src/cook/game/packStore.ts'),
  engine('src/server/host/dedicated/uploadActivation.ts'),engine('src/server/host/dedicated/placementFile.ts'),
  engine('src/server/host/dedicated/packReader.ts'),engine('src/server/host/dedicated/world.ts'),
  engine('src/server/host/dedicated/playerSaves.ts'),engine('src/server/host/dedicated/cellHost.ts'),
  engine('src/server/host/dedicated/gridCells.ts'),import('@wildshard/engine/physics/rapier'),
  import(pathToFileURL(resolve(process.env.WILDSHARD_API_SOURCE,'src/server/signing/placement-file.ts')).href),
]);

for (const place of [true,false]) test(`SP20c3 real cook/game/packed CLI, lost ACK heals, place=${place}`, {timeout:90_000}, async context=>{
  const scratch=resolve('tmp/codex-wire');await mkdir(scratch,{recursive:true});
  const work=await mkdtemp(join(scratch,'composed-'));context.after(()=>rm(work,{recursive:true,force:true}));
  const keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({type:'spki',format:'der'}).toString('hex');
  const documents=new Map();
  const placements=placementWriter({read:async key=>documents.get(key),write:async(key,value,etag)=>{
    if(documents.get(key)?.etag!==etag)return false;
    documents.set(key,{text:value,etag:createHash('sha256').update(value).digest('hex')});return true;
  }},keys.privateKey.export({type:'pkcs8',format:'pem'}));
  const fixture=await openApi(context,'manual',{placements});
  const cli=installWildshard(join(work,'installed')),file=join(work,'shard.tar');await writeFile(file,TARBALL);
  const child=spawn(process.execPath,[cli,'upload',file,'--server',fixture.url,'--version','0.1.0','--commit','a'.repeat(40),'--channel','staging',...(place?[]:['--no-place'])],{env:{PATH:process.env.PATH,WILDSHARD_API_KEY:fixture.apiKey},stdio:['ignore','pipe','pipe']});
  context.after(()=>{if(child.exitCode===null)child.kill('SIGTERM');});
  const stdout=text(child.stdout),stderr=text(child.stderr),closed=once(child,'close');
  const deadline=Date.now()+30_000;
  while(fixture.id===undefined&&child.exitCode===null&&Date.now()<deadline)await delay(20);
  assert.ok(fixture.id,await Promise.race([stderr,Promise.resolve('upload must be recorded')]));
  assert.equal((await fixture.catalogue.uploads.byHash(fixture.hash)).status,'cooking');
  const client=cookApi(fixture.url,COOK_KEY),source=pendingSource(client,apiSource(fixture.url));
  const packs=join(work,'packs'),build='async-contract',worker=createCookWorker({build,store:folderStore(packs),source,serverPacks:join(work,'server-packs'),scratch:join(work,'cook'),launcher:{root,execPath:process.execPath,loader:engineScript('bake-loader.mjs'),script:engineScript('cook-job.mjs'),wrap:cookWrap,limits:{seconds:60,memoryMB:4096,heapMB:2048,cpuSlots:2}}});
  const outbox=new VerdictOutbox(join(work,'outbox')),delivery=uploadDelivery({api:client,source,worker,outbox,build,log:line=>context.diagnostic(line)});
  await delivery.sweep();await delivery.idle();
  assert.equal(outbox.rows().length,0);
  await migratePending(fixture);
  assert.equal((await fixture.catalogue.uploads.byHash(fixture.hash)).status,'staged',JSON.stringify(worker.rows()));
  const held=await fixture.catalogue.uploads.byHash(fixture.hash),report=held.report;
  assert.equal(report.pass,true);assert.equal(report.slug,'async-sdk-isle');
  const rapier=await loadRapier(await readFile(createRequire(join(root,'package.json')).resolve('@dimforge/rapier3d-simd/rapier_wasm3d_bg.wasm')));
  const reads={fetched:0,fetchedBytes:0,cached:0,refused:0},options={origin:pathToFileURL(packs+'/').href,cache:join(work,'game-cache')};
  const stops=[],rooms=new Set();
  const boot=slugs=>{
    const {port1,port2}=new MessageChannel();
    const cells=runCells(port2,{slugs,build,bootId:()=>build,memory:()=>process.memoryUsage(),load:slug=>readPackFolder(slug,build,rapier,options,reads,fixture.hash,[],true),booted:slug=>rooms.add(slug)});
    const stop=()=>{cells.dispose();port1.close();};stops.push(stop);
    return {send:(order,transfer=[])=>port1.postMessage(order,transfer),listen:news=>{port1.onmessage=event=>news(event.data);},stop};
  };
  const world=await World.open({build,cells:[],workers:1,seats:8,secret:'fixture-seat-secret',boot,saves:memoryPlayerSaves(),log:()=>{},crashed:error=>{throw new Error(String(error));},restart:()=>{throw new Error('No release restart expected');}});
  context.after(()=>{world.dispose();for(const stop of stops)stop();forgetPlacedCells();});
  const activate=uploadActivator({build,channel:'staging',read:async()=>readPlacementFile(documents.get('releases/staging-placements.json').text,publicKey),preload:async(slug,hash)=>{await readPackFolder(slug,build,rapier,options,reads,hash,[],true);},place:row=>{placeCell(row);},open:instances=>world.activateCells(instances),opened:instance=>Object.hasOwn(world.health().table,instance)});
  const gameToken=['fixture','local','game','receiver','test','key','32bytes'].join('-'),receive=uploadActivationReceiver(gameToken,activate);
  const server=createServer((request,response)=>{if(!receive(request,response))response.writeHead(404).end();});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  context.after(async()=>{server.closeAllConnections();await new Promise(done=>server.close(done));});
  const game=gameActivationClient({staging:{url:`http://127.0.0.1:${server.address().port}`,token:gameToken}},build);
  let lost=true;
  const acks=activationDelivery({...client,acknowledge:async(...args)=>{if(lost){lost=false;throw new Error('lost acknowledgement');}await client.acknowledge(...args);}},game);
  await acks.sweep();await acks.idle();
  assert.equal(rooms.has('async-sdk-isle'),place,'actual cell opening follows the recorded placement choice');
  assert.equal((await fixture.catalogue.uploads.byHash(fixture.hash)).status,'staged');
  await acks.sweep();await acks.idle();
  assert.equal((await fixture.catalogue.uploads.byHash(fixture.hash)).status,'live');
  // Replaying the exact settled verdict is harmless; it must not remeasure.
  await client.verdict(fixture.id,JSON.stringify({hash:fixture.hash,result:'cooked',build,report}));
  await closed;
  const output=await stdout,errors=await stderr;
  assert.equal(child.exitCode,0,errors);
  assert.ok(output.includes(`upload ${fixture.id}: live`),output);
  assert.equal((await fixture.catalogue.uploads.byHash(fixture.hash)).hash,fixture.hash);
  context.diagnostic(`same upload id ${fixture.id}, cooked hash ${fixture.hash}, exact pack preloaded, placement=${place}, packed CLI live`);
});

for(const late of [false,true])test(`SP20c3 real entry refusal and packed CLI, late=${late}`,{timeout:90_000},async context=>{
  const scratch=resolve('tmp/codex-wire');await mkdir(scratch,{recursive:true});
  const work=await mkdtemp(join(scratch,'composed-refusal-'));context.after(()=>rm(work,{recursive:true,force:true}));
  const clock={now:Date.now()},alarms=[];
  const fixture=await openApi(context,'manual',{now:()=>new Date(clock.now),errors:{report:async(error)=>{alarms.push(error.message);}}});
  const cli=installWildshard(join(work,'installed')),file=join(work,'blocked.tar');await writeFile(file,await blockedEntryTarball());
  const args=['upload',file,'--server',fixture.url,'--version','0.1.0','--commit','a'.repeat(40),'--channel','staging'];
  const child=spawn(process.execPath,[cli,...args],{env:{PATH:process.env.PATH,WILDSHARD_API_KEY:fixture.apiKey},stdio:['ignore','pipe','pipe']});
  context.after(()=>{if(child.exitCode===null)child.kill('SIGTERM');});
  const stdout=text(child.stdout),stderr=text(child.stderr),closed=once(child,'close');
  const deadline=Date.now()+30_000;
  while(fixture.id===undefined&&child.exitCode===null&&Date.now()<deadline)await delay(20);
  assert.ok(fixture.id,'valid original must reach cooking before the actual entry proof refuses it');
  if(late){
    clock.now+=30*60_000;await maintainUploads(fixture.deps);await maintainUploads(fixture.deps);
    assert.equal((await fixture.catalogue.uploads.byHash(fixture.hash)).status,'stalled');
    assert.equal(alarms.length,1);await closed;
    assert.equal(child.exitCode,3,await stderr);assert.ok((await stdout).includes(`upload ${fixture.id}: stalled`));
  }
  const client=cookApi(fixture.url,COOK_KEY,fetch,()=>clock.now),source=pendingSource(client,apiSource(fixture.url));
  const build='async-refusal',worker=createCookWorker({build,store:folderStore(join(work,'packs')),source,serverPacks:join(work,'server'),scratch:join(work,'cook'),launcher:{root,execPath:process.execPath,loader:engineScript('bake-loader.mjs'),script:engineScript('cook-job.mjs'),wrap:cookWrap,limits:{seconds:60,memoryMB:4096,heapMB:2048,cpuSlots:2}}});
  const outbox=new VerdictOutbox(join(work,'outbox')),delivery=uploadDelivery({api:client,source,worker,outbox,build,log:line=>context.diagnostic(line)});
  await delivery.sweep();await delivery.idle();
  const settled=await fixture.catalogue.uploads.byHash(fixture.hash);
  assert.equal(settled.status,'refused',JSON.stringify(worker.rows()));assert.equal(settled.report.pass,false);
  assert.ok(settled.report.failures.some(row=>/Submerged edge entry north/u.test(row.message)));
  const files=readTar(await readFile(file));
  const product=validateShardfileFolder({paths:()=>files.keys(),read:path=>files.get(path)},
    {hash:bytes=>createHash('sha256').update(bytes).digest('hex')});
  const author=await checkShardfile(product.shard,product.assets,{sections:product.sections});
  assert.deepEqual(settled.report,author,'the actual author and credential-free cook keep the same full entry refusal');
  assert.equal(outbox.rows().length,0);
  const before=await fixture.sql.query('select name,pointers from channels order by name');
  assert.ok(before.rows.every(row=>!Object.values(row.pointers).includes(fixture.hash)));
  assert.equal((await fixture.sql.query("select slug from grid_cells where slug='async-sdk-isle'")).rows.length,0);
  await client.verdict(fixture.id,JSON.stringify({hash:fixture.hash,result:'refused',report:settled.report}));
  assert.deepEqual((await fixture.sql.query('select name,pointers from channels order by name')).rows,before.rows);
  if(!late){
    await closed;assert.equal(child.exitCode,3,await stderr);
    const output=await stdout;assert.ok(output.includes(`upload ${fixture.id}: refused`));
    assert.deepEqual(JSON.parse(output.slice(output.indexOf('{\n')).trim()),settled.report);
  }
});
