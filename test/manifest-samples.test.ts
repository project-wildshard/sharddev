import { expect,test,vi } from 'vitest';
import { zlibSync } from 'fflate';
import * as channels from '../src/shared/engine/world/scalarChannel';
import { defineShard,declaredGround,type ShardManifestRows } from '../src/client/game/shard/manifest';
import type { ScalarLatticeRows } from '@wildshard/format/scalarChannel';
import nalati from '../src/shards/nalati-grasslands/discovery.generated';
import { readNalatiGeography } from './fixtures/nalati-geography';
import { manifestClosure,manifestContract } from '../scripts/gen-shards.mjs';

const geography=readNalatiGeography();

const files=new Map<string,Uint8Array>();
const raster = (value: number): ScalarLatticeRows => {
  const file=`test/raster-${String(value)}.bin`;
  files.set(file,zlibSync(new Uint8Array(new Float32Array(4).fill(value).buffer)));
  return {res:2,size:500,values:{type:'f32',count:4,data:{file}}};
};
const prepare=(manifest:ReturnType<typeof defineShard>):void=>{
  if(manifest.scalarBlocks===undefined)throw new Error('Missing sampled file intake');
  for(const file of manifest.scalarBlocks.files)if(!files.has(file))throw new Error(`Fixture missing ${file}`);
  manifest.scalarBlocks.prepare(files);
};
const { scalarBlocks:_scalars,ground: _ground,groundColor: _colour,surfaceAt: _surface,forest: authoredForest,minimap: _map,navmesh: _nav,...fixed } = nalati;
if (authoredForest === undefined) throw new Error('Missing forest metadata');
const { mask: _mask,...forest } = authoredForest;
const base: ShardManifestRows = { ...fixed,forest,minimap: { palette: geography.map } };
function sampled(): ShardManifestRows {
  return { ...base,groundRows: { terrain: { flat: 3,seed: 17 },water: 2,trails: [],cabinSites: [],mask: raster(.25),bodies: [{ id: 'water',kind: 'terrain-basin' }] },
    forestMaskSamples: raster(1),groundColourSamples: [raster(2),raster(3),raster(4)],surfaceSamples: [raster(5),raster(6),raster(7)],mapGroundSamples: [raster(8),raster(9),raster(10)] };
}

test('manifest recipes retain the original complete decoder order and one native field',() => {
  const input = sampled(),manifest = defineShard(input,{}),terrain = manifest.ground.terrain,out: [number,number,number] = [0,0,0];
  const read=vi.spyOn(files,'get');
  expect(()=>manifest.forest?.mask?.(0,0)).toThrow('not prepared');
  prepare(manifest);
  expect(read.mock.calls.map(([file])=>({file}))).toEqual([1,2,3,4,5,6,7,.25,8,9,10].map(value => raster(value).values.data));
  read.mockRestore();
  if (terrain === undefined || manifest.groundColor === undefined || manifest.surfaceAt === undefined || manifest.minimap?.palette === undefined) throw new Error('Missing sampled bindings');
  expect(manifest.groundColor(0,0,Number.NaN,Infinity,terrain,out)).toBe(out);expect(out).toEqual([2,3,4]);
  expect(manifest.surfaceAt(0,0,Number.NaN,Infinity)).toEqual([5,6,7]);expect(manifest.forest?.mask?.(0,0)).toBe(1);
  const palette = manifest.minimap.palette;
  const invoke: (...args: Parameters<typeof palette.ground>) => unknown = palette.ground;
  expect(invoke(0,0,0,0,0,out)).toBeUndefined();expect(out).toEqual([8,9,10]);
  const water = manifest.ground.water?.[0];if (water === undefined) throw new Error('Missing basin');
  terrain.waterLevel = () => 11;expect(water.level).toBe(11);expect(water.restAt(900,900)).toBe(11);
  for (const key of ['groundRows','groundColourSamples','surfaceSamples','forestMaskSamples','mapGroundSamples']) expect(Object.hasOwn(manifest,key)).toBe(false);
});

test('all sample shapes and mixed owner forms refuse before the first decode',() => {
  const read = vi.spyOn(channels,'readScalarLattice'),decode = vi.spyOn(channels,'readScalarChannel');
  const malformed = sampled();malformed.mapGroundSamples?.pop();
  const native = declaredGround({ terrain: { flat: 0,seed: 1 },water: 0,trails: [],cabinSites: [],bodies: [] });
  read.mockClear();decode.mockClear();
  for (const input of [malformed,{ ...sampled(),ground: native },{ ...sampled(),groundColour: [0,0,0] as const },{ ...sampled(),surfaceAt: (): [number,number,number] => [0,0,0] },{ ...sampled(),forest: { ...forest,mask: () => 1 } },{ ...sampled(),minimap: {} }]) expect(() => defineShard(input,{})).toThrow();
  expect(() => defineShard(sampled(),{ ground: native })).toThrow('Conflicting');
  expect(read).not.toHaveBeenCalled();expect(decode).not.toHaveBeenCalled();
  let calls = 0;const accessor = sampled();
  Object.defineProperty(accessor,'groundColourSamples',{ enumerable: true,get() { calls++;return [raster(2),raster(3),raster(4)]; } });
  expect(() => defineShard(accessor,{})).toThrow('own data');expect(calls).toBe(0);
});

test('data mutations and independent declarations cannot redirect existing sampled callbacks',() => {
  const input = sampled(),first = defineShard(input,{}),second = defineShard(sampled(),{}),terrain = first.ground.terrain,out: [number,number,number] = [0,0,0];
  prepare(first);prepare(second);
  if (terrain === undefined || first.groundColor === undefined) throw new Error('Missing native sample');
  if (input.groundColourSamples === undefined) throw new Error('Missing input samples');
  input.groundColourSamples[0].values.data = raster(99).values.data;
  expect(first.groundColor(0,0,0,0,terrain,out)).toBe(out);expect(out).toEqual([2,3,4]);
  expect(first.ground).not.toBe(second.ground);expect(first.forest?.mask).not.toBe(second.forest?.mask);
});

test('legacy native callbacks and ground owners retain identity and fixed RGB behavior',() => {
  const ground = declaredGround({ terrain: { flat: 0,seed: 1 },water: 0,trails: [],cabinSites: [],bodies: [] });
  const mask = (): number => .75,surface = (): [number,number,number] => [1,2,3],manifest = defineShard({ ...base,ground,forest: { ...forest,mask },surfaceAt: surface,groundColour: [.1,.2,.3] },{});
  expect(manifest.ground).toBe(ground);expect(manifest.forest?.mask).toBe(mask);expect(manifest.surfaceAt).toBe(surface);
  expect(manifest.load).toBe(nalati.load);expect(manifest.render).toBe(nalati.render);expect(manifest.dev).toBe(nalati.dev);
  const out: [number,number,number] = [0,0,0];expect(manifest.groundColor?.(0,0,0,0,ground.terrain,out)).toBe(out);expect(out).toEqual([.1,.2,.3]);
});

test('a declared post look binds the manifest render and refuses a second look binding',() => {
  const input = { ...sampled(),postLook: { file: 'look/post.json',field: ['look'] } },manifest = defineShard(input,{});
  expect(typeof manifest.render).toBe('function');
  expect('postLook' in manifest).toBe(false);
  expect(() => defineShard(input,{ render: () => Promise.reject(new Error('unused')) })).toThrow('Conflicting manifest look bindings');
});

test('the manifest contract holds: every field has a reader, every closure its budget',() => {
  expect(manifestContract('.',manifestClosure('.'),true)).toEqual([]);
});

test('declared manifests refuse source runtime entries before getters or sample decoding', () => {
  const read = vi.spyOn(channels, 'readScalarLattice'); read.mockClear();
  for (const runtimeEntry of [undefined, 'runtime/hybrid.ts']) {
    const input = { ...sampled(), runtimeEntry };
    expect(() => defineShard(input, {})).toThrow('do not name runtime modules');
  }
  let calls = 0;
  const accessor = sampled();
  Object.defineProperty(accessor, 'runtimeEntry', { get() { calls++; return 'runtime/hybrid.ts'; } });
  expect(() => defineShard(accessor, {})).toThrow('do not name runtime modules');
  expect(calls).toBe(0); expect(read).not.toHaveBeenCalled();
});
