import { afterEach,beforeAll,expect,test } from 'vitest';
import * as v from 'valibot';
// oxlint-disable-next-line import/no-nodejs-modules -- Owned product transport fixture only.
import { mkdirSync,mkdtempSync,readFileSync,rmSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Keep temporary products in the repository scratch tree.
import { resolve } from 'node:path';
import { namedJsonSchema } from '../src/sharddev/formatJsonSchema';
import { fixtureNativeJson } from './fixtures/productFile';
import { emptyShardfile } from '@wildshard/engine/host/author';
import { nameBlob,emitNamedBlobs } from '../src/sharddev/blobs';
import { prepareProjectOutput,mergeProjectBlobs } from '../src/sharddev/projectOutput';
import { emitPlatformSections } from '../src/sharddev/platformSections';
import { writeOutputProduct,validateOutputProduct } from '../src/sharddev/outputProduct';
import { scriptAdmissionRows,decisionModuleContracts,ReturnModulesSchema,ScriptV2ContractSchema } from '@wildshard/format/scriptContract';
import { parseDecisionScripts } from '@wildshard/format/decisionScripts';
import { validateShardfileAssets } from '@wildshard/format/assetAdmission';
import { hashImmutableBytes } from '@wildshard/engine/host/immutable';
import { readFolderDescriptor,admitFolder,type FolderOptions } from '@wildshard/engine/game/shardfile/folder';
import { HeadlessSimulation } from '@wildshard/engine/host/headless';
import {compileReturnProjectionV2} from '../src/sharddev/returnProjectionV2';

let programs: {attack: Awaited<ReturnType<typeof compileReturnProjectionV2>>['legacy'] & {v2: Awaited<ReturnType<typeof compileReturnProjectionV2>>['candidate']}};
beforeAll(async()=>{
  const built=await compileReturnProjectionV2({id:'inventoryFixture',abi:'1.0',side:'sim',module:`blobs/wasm/${'0'.repeat(64)}.wasm`,
    source:'behaviour/inventory.as',binding:{shard:true},pages:1,onFail:'hold',on:['signal'],reads:['field','random'],commands:['channel'],
    fields:{value:'value',phase:'phase'},signals:{run:'run',other:'other'},channels:{out:'out',aux:'aux',unused:'unused'},stateVersion:1,state:[],params:{}},
    {fields:new Map([['value',1],['phase',2]]),signals:new Map([['run',1],['other',2]]),channels:new Map([['out',1],['aux',2],['unused',3]])},
    new Map([['behaviour/inventory.as',`import {Read,Do,Field,Channel} from './generated/inventoryFixture';
      export function onSignal(signal:i32,value:f64,source:i32):void{Do.channel(Channel.out,Read.field(0,Field.value));Do.channel(Channel.aux,Read.random());}`]]),{asLineCeiling:5});
  programs={attack:{...built.legacy,v2:built.candidate}};
});

const owned:string[]=[];
afterEach(()=>{for(const path of owned.splice(0))rmSync(path,{recursive:true,force:true});});
function fixture(){
  mkdirSync('tmp',{recursive:true});const root=mkdtempSync(resolve('tmp/project-inventory-'));owned.push(root);
  const projection=programs.attack.v2,{hash:_hash,minor:_minor,...metadata}=projection.artifact;
  const contract=v.parse(ScriptV2ContractSchema,metadata);
  const bytes=Uint8Array.from(atob(projection.bytes),byte=>byte.codePointAt(0)??0);
  const blob=nameBlob('behaviour/project.wasm','wasm',bytes,{critical:true,script:contract});
  const module={id:'fixture.project',module:blob.file.path,side:'sim',...contract};
  const rows=v.parse(ReturnModulesSchema,[module]);
  const sections=new Map<string,unknown>([['actors/return-scripts',rows]]);
  const platform=emitPlatformSections(new Map([['actors/return-scripts',rows]]));
  const source=emptyShardfile({slug:'project-inventory',name:'Project inventory',author:'Test',revision:1,seed:2});
  source.serverBudget.memory+=131072;source.budgets.sim.resident+=131072;
  return {root,blob,bytes,contract,module,platform,sections,...mergeProjectBlobs(source as unknown as Parameters<typeof mergeProjectBlobs>[0],new Map(),[blob])};
}
test('project ABI survives named reconstruction, disk, browser and native without scheduling',async()=>{
  const f=fixture(),emitted=emitNamedBlobs([f.blob]);
  const rows=v.parse(ReturnModulesSchema,[f.module]);
  expect(await fixtureNativeJson(namedJsonSchema(ReturnModulesSchema),new TextEncoder().encode(JSON.stringify(rows)))).toStrictEqual(rows);
  const prepared=await prepareProjectOutput(f.root,{platform:f.platform,namedFiles:emitted.files,assets:emitted.assets});
  expect(prepared.blobs[0]?.script).toStrictEqual(f.contract);
  const index=writeOutputProduct(f.shard,f.assets,f.root,{platform:f.platform,namedFiles:f.namedFiles});
  expect(index.files.find(row=>row.hash===f.blob.file.hash)).not.toHaveProperty('script');
  expect(validateOutputProduct(f.root).assets.get(f.blob.file.hash)).toStrictEqual(f.bytes);
  const base='https://example.test/projection/';
  const options:FolderOptions={base,offline:false,hash:wire=>Promise.resolve(hashImmutableBytes(wire)),
    fetch:url=>Promise.resolve(new Response(Uint8Array.from(readFileSync(resolve(f.root,url.slice(base.length))))))};
  expect((await admitFolder(await readFolderDescriptor(options),options)).assets.get(f.blob.file.hash)).toStrictEqual(f.bytes);
  const sim=await HeadlessSimulation.create(f.shard as unknown as Parameters<typeof HeadlessSimulation.create>[0],f.assets,undefined,{deadline:'advisory',sections:f.sections});
  try{expect((await sim.step()).tick).toBe(1);}finally{await sim.dispose();}
},30000);
test('missing or mismatched project contracts refuse without guessing the ABI',async()=>{
  const f=fixture(),rows=scriptAdmissionRows(f.sections);
  await expect(prepareProjectOutput(f.root,{namedFiles:[f.blob.file],assets:f.assets})).rejects.toThrow('Missing instrumentation');
  expect(()=>validateShardfileAssets(f.shard,f.assets,hashImmutableBytes)).toThrow('Missing instrumentation');
  expect(()=>v.parse(ReturnModulesSchema,[{...f.module,lane:'view'}])).toThrow();
  expect(()=>v.parse(ReturnModulesSchema,[{...f.module,side:'view'}])).toThrow();
  expect(()=>v.parse(ReturnModulesSchema,[f.module,f.module])).toThrow();
  expect(()=>decisionModuleContracts(rows,[{...f.blob.file,hash:'0'.repeat(64)}])).toThrow('exact declared');
  const wrong=emitPlatformSections(new Map([['actors/return-scripts',[{...f.module,pages:2}]]]));
  expect(()=>writeOutputProduct(f.shard,f.assets,f.root,{platform:wrong,namedFiles:f.namedFiles})).toThrow('fixed pages');
});

test('legacy return inventories keep the original parser normalization and refusals',()=>{
  const legacy={...programs.attack.script,bodies:{},colliders:{}};
  expect(v.parse(ReturnModulesSchema,[legacy])).toStrictEqual(parseDecisionScripts([legacy]));
  expect(()=>v.parse(ReturnModulesSchema,[legacy,legacy])).toThrow();
  expect(()=>v.parse(ReturnModulesSchema,[{...legacy,reads:['unknown']}])).toThrow();
  let reads=0;
  expect(()=>v.parse(ReturnModulesSchema,[{...legacy,get id(){reads++;return legacy.id;}}])).toThrow();
  expect(reads).toBe(0);
});
