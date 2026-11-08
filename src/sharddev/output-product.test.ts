import { afterEach, expect, it } from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- The output validator fixture owns its generated directory.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, symlinkSync, existsSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve fixture files inside the owned output directory.
import { resolve } from 'node:path';
import { emptyShardfile } from '@wildshard/sharddev/author';
import { encodeCanonicalJson, hashImmutableBytes } from '@wildshard/engine/host/immutable';
import { emitPlatformSections } from '@wildshard/sharddev/platformSections';
import { runtimePackageAllowed, validateRuntimeImports } from './runtimeImports';
import { writeOutputProduct, validateOutputProduct } from './outputProduct';
import { encodeTerrainTile } from '@wildshard/format/terrainTileBytes';

const directories: string[] = [];
// Keep a real tracked KTX2 header/mip; trailing padding exercises transport boundaries.
function textureBody(size: number, padding: number): Uint8Array { const bytes=new Uint8Array(size).fill(padding);bytes.set(readFileSync('test/fixtures/shard-assets/pixel.ktx2'));return bytes; }
function output(): string { mkdirSync('tmp',{recursive:true});const path=mkdtempSync(resolve('tmp','output-product-'));directories.push(path);return path; }
const source = () => emptyShardfile({slug:'output-test',name:'Output',author:'Test',revision:1,seed:3});
afterEach(()=>{for(const directory of directories.splice(0))rmSync(directory,{recursive:true,force:true});});
it('writes deterministic platform sections and verifies their bytes on disk',()=>{
 const shard=source(), first=output(),second=output();
 const platform=emitPlatformSections(new Map([['ui/strings',{hello:'Hello'}]]));
 writeOutputProduct(shard,new Map(),first,{platform});writeOutputProduct(shard,new Map(),second,{platform});
 expect(readFileSync(resolve(first,'shard.json'))).toEqual(readFileSync(resolve(second,'shard.json')));
 expect(validateOutputProduct(first).shard).toEqual(shard);
 const evidence:unknown=JSON.parse(readFileSync(resolve(first,'validation.json'),'utf8'));
 expect(evidence).toMatchObject({indexHash:hashImmutableBytes(readFileSync(resolve(first,'shard.json'))),gridReady:{version:1,criteria:{
   bakedTiles:{verdict:'fail'},edgeProfile:{verdict:'pass'},fourEntryways:{verdict:'pass'},hudAccent:{verdict:'pass'},
 }}});
 const path=resolve(first,'sections/ui/strings.json');writeFileSync(path,'{}\n');
 expect(()=>validateOutputProduct(first)).toThrow(/hash|size/u);
});
it('splits terrain from opaque binary while retaining byte and field identity',()=>{
 const shard=source(),directory=output(),tile=encodeTerrainTile({resolution:2,x:0,z:0,size:1,heights:new Float32Array([1,2,3,4])}),bin=new Uint8Array([1,2,3]);
 const assets=new Map([tile,bin].map(bytes=>[hashImmutableBytes(bytes),bytes]));
 shard.files=[...assets].map(([hash,bytes])=>({hash,kind:'binary',compressed:bytes.length,decoded:bytes.length+1024,gpu:1024,triangles:4,draws:1,dependencies:[],critical:false}));shard.files.sort((a,b)=>a.hash.localeCompare(b.hash));shard.library=[...assets.keys()];shard.budgets.library={resident:100000,compressed:100000};
 const index=writeOutputProduct(shard,assets,directory);
 expect(index.files.map(file=>file.kind).sort()).toEqual(['bin','tile']);
 const restored=validateOutputProduct(directory);expect(restored.shard).toEqual(shard);expect(restored.assets).toEqual(assets);
 writeFileSync(resolve(directory,'unlisted.js'),'evil');expect(()=>validateOutputProduct(directory)).toThrow(/Unlisted/u);
 rmSync(resolve(directory,'unlisted.js'));
 const file=index.files[0];if(file===undefined)throw new Error('Missing fixture blob');
 const path=resolve(directory,file.path);rmSync(path);symlinkSync(resolve(directory,'shard.json'),path);
 expect(()=>validateOutputProduct(directory)).toThrow(/symlink/u);
});
it('packs the sections and the small files apart, each member once at its exact bytes (iPhone downloads I5)',()=>{
 const shard=source(),directory=output(),bin=new Uint8Array([1,2,3]),hash=hashImmutableBytes(bin);
 shard.files=[{hash,kind:'binary',compressed:3,decoded:3,gpu:0,triangles:0,draws:0,dependencies:[],critical:false}];shard.library=[hash];shard.budgets.library={resident:3,compressed:3};
 const index=writeOutputProduct(shard,new Map([[hash,bin]]),directory),[sectionPack,pack]=index.packs??[];
 if(sectionPack===undefined||pack===undefined||index.packs?.length!==2)throw new Error('Expected a section pack and a file pack');
 expect(new Set(sectionPack.entries.map(entry=>entry.hash))).toEqual(new Set(index.sections.map(entry=>entry.hash)));
 expect(pack.entries.map(entry=>entry.hash)).toEqual([hash]);
 const bytes=readFileSync(resolve(directory,sectionPack.path));
 for(const entry of sectionPack.entries)expect(hashImmutableBytes(bytes.subarray(entry.offset,entry.offset+entry.bytes))).toBe(entry.hash);
 expect(validateOutputProduct(directory).shard).toEqual(shard);
 const tampered=Uint8Array.from(bytes);tampered[0]=(tampered[0]??0)^1;writeFileSync(resolve(directory,sectionPack.path),tampered);
 expect(()=>validateOutputProduct(directory)).toThrow(/hash|size/u);
});
it('refuses canonical but schema-invalid section bytes with updated hash and size',()=>{
 const directory=output(),index=writeOutputProduct(source(),new Map(),directory);
 const entry=index.sections.find(row=>row.name==='world/spawn');if(entry===undefined)throw new Error('Missing spawn');
 const bytes=new TextEncoder().encode(encodeCanonicalJson({spawn:{x:'wrong',y:2,z:0,yaw:0}}));
 writeFileSync(resolve(directory,entry.path),bytes);entry.hash=hashImmutableBytes(bytes);entry.bytes=bytes.length;
 writeFileSync(resolve(directory,'shard.json'),encodeCanonicalJson(index));expect(()=>validateOutputProduct(directory)).toThrow();
});

it('packs medium bodies within 4 MiB without pulling late bytes into required reads',()=>{
 const shard=source(),directory=output();
 const bodies=Array.from({length:9},(_,i)=>new Uint8Array(i===8?1_048_576:716_800).fill(i+1));
 const assets=new Map(bodies.map(body=>[hashImmutableBytes(body),body])),hashes=[...assets.keys()];
 const late=hashes.slice(6,8),unpacked=hashes[8];
 shard.files=[...assets].map(([hash,body])=>({hash,kind:'binary' as const,compressed:body.length,decoded:body.length,gpu:0,triangles:0,draws:0,dependencies:[],critical:false})).sort((a,b)=>a.hash.localeCompare(b.hash));
 shard.library=hashes;shard.late=late.map(hash=>({hash}));shard.budgets.library={resident:8_000_000,compressed:8_000_000};
 const index=writeOutputProduct(shard,assets,directory),seen=new Set<string>();
 const bodyPacks=(index.packs??[]).filter(pack=>pack.entries.some(entry=>assets.has(entry.hash)));
 expect(bodyPacks).toHaveLength(3);
 for(const pack of bodyPacks){
  expect(pack.bytes).toBeLessThanOrEqual(4_194_304);
  const wire=readFileSync(resolve(directory,pack.path));
  expect(hashImmutableBytes(wire)).toBe(pack.hash);
  const phases=new Set(pack.entries.map(entry=>late.includes(entry.hash)));
  expect(phases.size).toBe(1);
  for(const entry of pack.entries){
   expect(seen.has(entry.hash)).toBe(false);seen.add(entry.hash);
   const original=assets.get(entry.hash);if(original===undefined)throw new Error('Missing original medium body');
   expect(wire.subarray(entry.offset,entry.offset+entry.bytes).equals(original)).toBe(true);
  }
 }
 expect([...seen].sort()).toEqual(hashes.filter(hash=>hash!==unpacked).sort());
 const restored=validateOutputProduct(directory);
 expect(restored.shard).toEqual(shard);expect([...restored.assets.keys()].sort()).toEqual([...assets.keys()].sort());
 for(const [hash,original]of assets){const body=restored.assets.get(hash);if(body===undefined)throw new Error('Missing restored body');expect(hashImmutableBytes(body)).toBe(hash);expect(body.length).toBe(original.length);}
});

it('packs encoded textures at the exact cap without changing small-body envelopes',()=>{
 const shard=source(),directory=output(),cap=4_194_304;
 const bodies=[cap,cap/2,cap/2,cap+1].map((size,i)=>textureBody(size,71+i));
 bodies.push(new Uint8Array(131_072).fill(75),new Uint8Array(131_072).fill(76),new Uint8Array(1_200_000).fill(77));
 const assets=new Map(bodies.map(body=>[hashImmutableBytes(body),body])),hashes=[...assets.keys()];
 shard.files=[...assets].map(([hash,body],i)=>({hash,kind:i<4?'ktx2' as const:'binary' as const,compressed:body.length,decoded:i<4?0:body.length,gpu:i<4?4:0,triangles:0,draws:0,dependencies:[],critical:false}));
 shard.library=hashes;shard.budgets.library={resident:16_000_000,compressed:16_000_000};
 const namedFiles=shard.files.map((file,i)=>({...file,kind:i<4?'ktx2' as const:'bin' as const,path:`blobs/${i<4?'ktx2':'bin'}/${file.hash}.${i<4?'ktx2':'bin'}`,name:`boundary-${i}.${i<4?'ktx2':'bin'}`}));
 shard.files.sort((a,b)=>a.hash.localeCompare(b.hash));
 const index=writeOutputProduct(shard,assets,directory,{namedFiles});
 const packs=(index.packs??[]).filter(pack=>pack.entries.some(entry=>assets.has(entry.hash)));
 expect(packs.map(pack=>pack.bytes)).toEqual([262_144,cap,cap]);
 expect(packs.map(pack=>pack.entries.map(entry=>entry.hash))).toEqual([hashes.slice(4,6),hashes.slice(0,1),hashes.slice(1,3)]);
 for(const pack of packs){
  const wire=readFileSync(resolve(directory,pack.path));expect(hashImmutableBytes(wire)).toBe(pack.hash);
  for(const entry of pack.entries){const original=assets.get(entry.hash);if(original===undefined)throw new Error('Missing exact envelope member');expect(wire.subarray(entry.offset,entry.offset+entry.bytes).equals(original)).toBe(true);}
 }
 const restored=validateOutputProduct(directory);expect(restored.shard).toEqual(shard);
 for(const [hash,body] of assets){const actual=restored.assets.get(hash);if(actual===undefined)throw new Error('Missing restored envelope member');expect(Buffer.from(actual).equals(body)).toBe(true);}
});

it('keeps explicit phone, desktop and shared pack bodies separate in each admission phase',()=>{
 const shard=source(),directory=output(),bodies=Array.from({length:6},(_,i)=>textureBody(1_100_000,i+1));
 const assets=new Map(bodies.map(body=>[hashImmutableBytes(body),body])),hashes=[...assets.keys()];
 shard.files=[...assets].map(([hash,body])=>({hash,kind:'ktx2' as const,compressed:body.length,decoded:0,gpu:4,triangles:0,draws:0,dependencies:[],critical:false}));
 shard.library=hashes;shard.late=hashes.slice(3).map(hash=>({hash}));shard.budgets.library={resident:6_600_000,compressed:6_600_000};
 const namedFiles=shard.files.map((file,i)=>({...file,kind:'ktx2' as const,path:`blobs/ktx2/${file.hash}.ktx2`,name:`medium-${i}.ktx2`,
  ...(i%3===0?{}:{tier:i%3===1?'phone' as const:'desktop' as const})}));
 shard.files.sort((a,b)=>a.hash.localeCompare(b.hash));
 const index=writeOutputProduct(shard,assets,directory,{namedFiles});
 const packs=(index.packs??[]).filter(pack=>pack.entries.some(entry=>assets.has(entry.hash)));
 expect(packs).toHaveLength(6);
 expect(packs.flatMap(pack=>pack.entries.map(entry=>entry.hash)).sort()).toEqual([...hashes].sort());
 for(const pack of packs)expect(pack.entries).toHaveLength(1);
 expect(validateOutputProduct(directory).shard).toEqual(shard);
});

it('allows only installed public runtime packages and copied TypeScript targets',()=>{
 for(const name of ['three','three/webgpu','valibot','@wildshard/engine/app/scope','@wildshard/engine/game/plugin/headless','@wildshard/engine/host/headlessRuntime'])expect(runtimePackageAllowed(name),name).toBe(true);
 for(const name of ['node:fs','@wildshard/sharddev/commons/trees','@wildshard/engine/not-public','three/package.json','@wildshard/sharddev/bake?raw'])expect(runtimePackageAllowed(name),name).toBe(false);
 const directory=output();mkdirSync(resolve(directory,'runtime'));writeFileSync(resolve(directory,'runtime/other.ts'),'export const x=1;');
 expect(()=>validateRuntimeImports(directory,'runtime/index.ts',"import {x} from './other'; import type {Scope} from '@wildshard/engine/app/scope';")).not.toThrow();
 expect(()=>validateRuntimeImports(directory,'runtime/index.ts',"import x from '../data/x';")).toThrow();
 expect(()=>validateRuntimeImports(directory,'runtime/index.ts',"import x from './other.json';")).toThrow();
 expect(()=>validateRuntimeImports(directory,'runtime/index.ts',"import('node:fs');")).toThrow();
});

it('does not publish grid evidence before entry admission succeeds',()=>{
 const shard=source(),directory=output();
 const invalid={...shard,entryways:shard.entryways.map(({edge,at})=>({edge,at,width:7}))};
 expect(()=>writeOutputProduct(invalid,new Map(),directory)).toThrow(/entryway|8 metres/u);
 expect(existsSync(resolve(directory,'validation.json'))).toBe(false);
});

it.each(['binary','ktx2'] as const)('separates implicit %s alternatives from demanded pack members without tier labels',kind=>{
 const shard=source(),directory=output(),bodies=kind==='ktx2'?[textureBody(1_100_000,41),textureBody(1_200_000,42),textureBody(1_300_000,43)]:[new Uint8Array(70000).fill(41),new Uint8Array(80000).fill(42),new Uint8Array(90000).fill(43)];
 const assets=new Map(bodies.map(body=>[hashImmutableBytes(body),body])),hashes=[...assets.keys()];
 shard.files=[...assets].map(([hash,body])=>({hash,kind,compressed:body.length,decoded:kind==='ktx2'?0:body.length,gpu:kind==='ktx2'?4:0,triangles:0,draws:0,dependencies:[],critical:false}));
 shard.library=hashes;shard.budgets.library={resident:4_000_000,compressed:4_000_000};
 const extension=kind==='ktx2'?'ktx2':'bin';
 const namedFiles=shard.files.map((file,i)=>({...file,kind:kind==='ktx2'?'ktx2' as const:'bin' as const,path:`blobs/${extension}/${file.hash}.${extension}`,name:`implicit-${i}.${extension}`,...(i<2?{variantOf:'same-payload'}:{})}));
 shard.files.sort((a,b)=>a.hash.localeCompare(b.hash));
 const index=writeOutputProduct(shard,assets,directory,{namedFiles});
 const packs=(index.packs??[]).filter(pack=>pack.entries.some(entry=>assets.has(entry.hash)));
 const inactive=hashes[0],selected=hashes[1],shared=hashes[2];
 if(inactive===undefined||selected===undefined||shared===undefined)throw new Error('Missing implicit alternative');
 expect(packs).toHaveLength(2);
 expect(packs.find(pack=>pack.entries.some(entry=>entry.hash===inactive))?.entries.map(entry=>entry.hash)).toEqual([inactive]);
 expect(new Set(packs.find(pack=>pack.entries.some(entry=>entry.hash===selected))?.entries.map(entry=>entry.hash))).toEqual(new Set([selected,shared]));
 expect(index.files.every(file=>file.tier===undefined)).toBe(true);
 const restored=validateOutputProduct(directory);
 expect(restored.shard).toEqual(shard);
 for(const [hash,wire] of assets){const actual=restored.assets.get(hash);if(actual===undefined)throw new Error('Missing restored alternative');expect(Buffer.from(actual).equals(wire)).toBe(true);}
});

it.each(['cold','critical','dependency','played'] as const)('packs %s whole-library readers in the same phase as admission',mode=>{
 const shard=source(),directory=output(),bodies=[new Uint8Array(70000).fill(51),new Uint8Array(80000).fill(52)];
 const assets=new Map(bodies.map(body=>[hashImmutableBytes(body),body])),hashes=[...assets.keys()];
 const cold=hashes[0],warm=hashes[1];if(cold===undefined||warm===undefined)throw new Error('Missing whole library fixture');
 shard.files=[...assets].map(([hash,body])=>({hash,kind:'binary' as const,compressed:body.length,decoded:body.length,gpu:0,triangles:0,draws:0,dependencies:mode==='dependency'&&hash===warm?[cold]:[],critical:mode==='critical'&&hash===cold}));
 shard.library=mode==='critical'?[warm]:hashes;if(mode==='critical'){shard.critical=[cold];shard.budgets.sim={resident:70000,compressed:70000};}shard.budgets.library={resident:150000,compressed:150000};
 const namedFiles=shard.files.map((file,i)=>({...file,kind:'bin' as const,path:`blobs/bin/${file.hash}.bin`,name:`whole-${i}.bin`}));
 shard.files.sort((a,b)=>a.hash.localeCompare(b.hash));
 const platform=emitPlatformSections(new Map([['world/scenes',{version:1,libraries:[{id:'cold',kind:'whole',load:'explorer',models:[{id:'shape',part:'shape',files:['whole-0.bin']}]},
  ...(mode==='played'?[{id:'played',kind:'whole',models:[{id:'same',part:'same',files:['whole-0.bin']}]}]:[])],materials:[],steps:[]}]]));
 const index=writeOutputProduct(shard,assets,directory,{namedFiles,platform});
 const packs=(index.packs??[]).filter(pack=>pack.entries.some(entry=>assets.has(entry.hash)));
 expect(packs).toHaveLength(mode==='cold'?2:1);
 if(mode==='cold')for(const pack of packs)expect(pack.entries).toHaveLength(1);
 expect(packs.flatMap(pack=>pack.entries.map(entry=>entry.hash)).sort()).toEqual([...hashes].sort());
 expect(validateOutputProduct(directory).shard).toEqual(shard);
});

it('keeps named consumer order inside the unchanged phase and tier packs',()=>{
 const shard=source(),directory=output(),bodies=[new Uint8Array(70000).fill(61),new Uint8Array(80000).fill(62),new Uint8Array(90000).fill(63)];
 const assets=new Map(bodies.map(body=>[hashImmutableBytes(body),body])),hashes=[...assets.keys()].sort().reverse();
 shard.files=[...assets].map(([hash,body])=>({hash,kind:'binary' as const,compressed:body.length,decoded:body.length,gpu:0,triangles:0,draws:0,dependencies:[],critical:false})).sort((a,b)=>a.hash.localeCompare(b.hash));
 shard.library=hashes;shard.budgets.library={resident:240000,compressed:240000};
 const namedFiles=shard.files.map(file=>({...file,kind:'bin' as const,path:`blobs/bin/${file.hash}.bin`,name:`body-${hashes.indexOf(file.hash)}.bin`}));
 const platform=emitPlatformSections(new Map([['world/scenes',{version:1,libraries:[{id:'shapes',kind:'owned',models:hashes.map((_,i)=>({id:`shape-${i}`,file:`body-${i}.bin`,attributes:{}}))}],materials:[],steps:[]}]]));
 const index=writeOutputProduct(shard,assets,directory,{namedFiles,platform}),pack=index.packs?.find(row=>row.entries.some(entry=>assets.has(entry.hash)));
 expect(pack?.entries.map(entry=>entry.hash)).toEqual(hashes);
 const wire=pack===undefined?undefined:readFileSync(resolve(directory,pack.path));if(wire===undefined||pack===undefined)throw new Error('Missing consumer pack');
 expect(pack.bytes).toBeLessThanOrEqual(4194304);
 for(const entry of pack.entries)expect(wire.subarray(entry.offset,entry.offset+entry.bytes)).toEqual(Buffer.from(assets.get(entry.hash)??[]));
 expect(validateOutputProduct(directory).shard).toEqual(shard);
});
