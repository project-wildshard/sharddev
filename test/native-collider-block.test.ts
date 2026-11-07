import { originalNalatiPhysics } from './fixtures/nalati-physics-original';
// oxlint-disable-next-line import/no-nodejs-modules -- Compare the actual authoring buffers and standard product intake.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import * as v from 'valibot';
import { NativeArraySliceSchema, nativeColliderRecordSchema } from '@wildshard/format/nativePhysics';
import { WorldPhysicsSchema } from '@wildshard/format/worldPhysics';
import { createNativeBakeReader } from '@wildshard/engine/game/population/nativeBake';
import { hashImmutableBytes } from '../src/sdk/immutable';
import { schemaInventory } from '../scripts/docs/schema-reference.mjs';
import { nalatiPhysicsSources } from '../src/shards/nalati-grasslands/generators/physics';
import { readNamedBlob } from '../src/sharddev/blobs';

const options = { label:'Orchard', resolution:2, size:4, parked:false, rig:'segments', provenance:'piece', shapes:[1,2,6,9] };
const file = 'data/colliders.bin';
const points = Float32Array.from([-0,1.25,-2,3,4,5,6,7,8]), indices = Uint32Array.from([0,1,2]);
const transport = new Uint8Array(12+points.byteLength+indices.byteLength);
transport.set(new Uint8Array(points.buffer),12);
transport.set(new Uint8Array(indices.buffer),12+points.byteLength);
const solid = { shape:6, body:0, groups:1, friction:.9, at:[1,2,3], rot:[0,0,0,1],
  vertices:{file,byteOffset:12,byteLength:points.byteLength},
  indices:{file,byteOffset:12+points.byteLength,byteLength:indices.byteLength} };
const ground = {rows:1,cols:1,friction:.9,groups:1,scale:{x:4,y:1,z:4},at:{x:0,y:0,z:0},heights:{file:'data/floor.bin'}};
const floor = {file:ground.heights.file,bytes:new Uint8Array(16)};
const input = {version:1,ground,solids:[solid],actors:[],herds:[]};

test('raw collider ranges are opt-in, aligned, strict and visible in world admission', () => {
  expect(() => v.parse(nativeColliderRecordSchema([6],'piece'),solid)).toThrow();
  expect(v.parse(nativeColliderRecordSchema([6],'piece',true),solid)).toEqual(solid);
  expect(v.parse(WorldPhysicsSchema,{...input,rig:'segments',provenance:'piece'}).solids).toEqual([solid]);
  for (const changed of [{file:'../hull.bin'},{file:'/hull.bin'},{file:'hull.json'},{byteOffset:-4},
    {byteOffset:2},{byteLength:3},{byteLength:Number.NaN},{byteOffset:2_147_483_648},{extra:true}]) {
    expect(() => v.parse(NativeArraySliceSchema,{...solid.vertices,...changed})).toThrow();
  }
  expect(schemaInventory(NativeArraySliceSchema).find(row=>row.path==='$.byteOffset')?.constraints).toContain('multiple_of 4');
});

test('the existing reader copies original f32/u32 ranges and memoizes only its complete bake', () => {
  const borrowed = Uint8Array.from(transport), reader = createNativeBakeReader(input,options,floor,[{file,bytes:borrowed}]);
  const bake = reader.read(), actual = bake.solids[0];
  if (actual?.points===undefined || actual.indices===undefined) throw new Error('Missing decoded collider');
  expect(actual.points).toEqual(points);
  expect(Object.is(actual.points[0],-0)).toBe(true);
  expect(actual.indices).toEqual(indices);
  expect(actual.points.buffer).not.toBe(borrowed.buffer);
  expect(actual.indices.buffer).not.toBe(actual.points.buffer);
  expect(reader.read()).toBe(bake);
  borrowed.fill(0);
  expect(actual.points).toEqual(points);
  expect(actual.indices).toEqual(indices);
  expect(reader.solid({...solid,vertices:solid.vertices})).not.toBe(actual);
});

test('missing, duplicate and out-of-bounds blocks refuse without publishing a memo', () => {
  expect(()=>createNativeBakeReader(input,options,floor).read()).toThrow('Missing native collider block');
  expect(()=>createNativeBakeReader(input,options,floor,[{file,bytes:transport},{file,bytes:transport}])).toThrow('duplicate');
  const mutable = {...input,solids:[{...solid,vertices:{...solid.vertices,byteOffset:transport.byteLength}}]};
  const reader = createNativeBakeReader(mutable,options,floor,[{file,bytes:transport}]);
  expect(()=>reader.read()).toThrow('range exceeds');
  mutable.solids[0] = solid;
  expect(reader.read().solids[0]?.points).toEqual(points);
  expect(()=>reader.solid({...solid,vertices:{...solid.vertices,byteOffset:2}})).toThrow();
});

test('the Nalati reader reads every authored hull from exactly the shipped blocks, in order', () => {
  const first = readFileSync('src/shards/nalati-grasslands/data/physics-colliders-0.bin');
  const second = readFileSync('src/shards/nalati-grasslands/data/physics-colliders-1.bin');
  const blocks = [{file:'data/physics-colliders-0.bin',bytes:first},{file:'data/physics-colliders-1.bin',bytes:second}];
  const source:unknown = originalNalatiPhysics();
  const groundBytes = readFileSync('src/shards/nalati-grasslands/data/physics-ground.bin');
  const bake = createNativeBakeReader(source,{...options,label:'Nalati',resolution:256,size:500},
    {file:'data/physics-ground.bin',bytes:groundBytes},blocks).read();
  const joined = new Uint8Array(first.length+second.length);
  let offset=0, count=0;
  for (const row of bake.solids) {
    if (row.points===undefined) continue;
    const bytes=new Uint8Array(row.points.buffer,row.points.byteOffset,row.points.byteLength);
    joined.set(bytes,offset); offset+=bytes.length; count++;
  }
  expect(count).toBeGreaterThan(0); expect(offset).toBe(joined.length);
  expect(joined).toEqual(Uint8Array.from([...first,...second]));
});

test('both raw hull files use standard named binary admission without config-time file reads', async () => {
  const sources = nalatiPhysicsSources().filter(row=>row.name!=='data/physics-ground.bin');
  expect(sources.map(row=>row.name)).toEqual(['data/physics-colliders-0.bin','data/physics-colliders-1.bin']);
  const hashes=[];
  for (const source of sources) {
    const blob=await readNamedBlob('src/shards/nalati-grasslands',source.name,source.source,source.kind,source.options);
    expect(blob.file.decoded).toBe(blob.bytes.length);
    hashes.push(hashImmutableBytes(blob.bytes));
  }
  expect(hashes).toEqual(['238c9e25120ab8e89ddf3f8c20434e9a808b7bc19cb2a928011ca3f90ade34f1',
    'a98661800d44e6dfb62b81ecdb310eeebe09837f373bf260dfcae5da07c72d95']);
});
