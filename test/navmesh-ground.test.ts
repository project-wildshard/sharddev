import {scalarBlockBytes} from './fixtures/nalati-scalar-blocks';
import { expect,test } from 'vitest';
import { unzlibSync,zlibSync } from 'fflate';
import { navmeshGroundExclusion as exclusionInput } from '../scripts/bake/navmeshGround';
import {ScalarLatticeBindings} from '../src/shared/engine/world/scalarChannel';
import { NavmeshGroundSchema } from '@wildshard/format/navigation';
import { formatJsonSchema } from '../src/sharddev/formatJsonSchema';
import { bakedSamplers } from '@wildshard/format/bakedTerrainSampling';
import { GROUND } from './fixtures/nalati-terrain';
import { readNalatiGeography } from './fixtures/nalati-geography';
import { nalatiGeographyRows } from '../src/shards/nalati-grasslands/generators/geographySource';
import nalati from '../src/shards/nalati-grasslands/discovery.generated';

const geography=readNalatiGeography();

const files=new Map<string,Uint8Array>();
const encode = (values: readonly number[]): {file:string} => {
  const file=`test/navmesh-${files.size}.bin`;files.set(file,zlibSync(new Uint8Array(Float32Array.from(values).buffer)));return {file};
};
function navmeshGroundExclusion(input:unknown,terrain:Parameters<typeof exclusionInput>[1],scalars?:ScalarLatticeBindings){
  const bindings=scalars??new ScalarLatticeBindings(),exclude=exclusionInput(input,terrain,bindings);
  if(scalars===undefined)bindings.prepare(files);return exclude;
}
const mask = { res: 2,size: 32,values: { type: 'f32',count: 4,data: encode([.5,.50000006,0,1]) } };
const rows = { ground: { waterMargin: .25,wet: mask,wetThreshold: .5,trailClearance: 3.5 } };

test('offline exclusion keeps strict boundaries, live method receivers and detached row values',() => {
  const calls: string[] = [],terrain = { level: 1,distance: 3.5,waterLevel() { calls.push('water');return this.level; },trailDistance() { calls.push('trail');return this.distance; } };
  const input = structuredClone(rows),exclude = navmeshGroundExclusion(input,terrain);
  if (exclude === undefined) throw new Error('Missing exclusion');
  expect(calls).toEqual([]);
  expect(exclude(16,-16,1.25)).toBe(true);expect(calls.splice(0)).toEqual(['water']);
  expect(exclude(-16,-16,1.250001)).toBe(false);expect(calls.splice(0)).toEqual(['water']);
  expect(exclude(16,-16,1.250001)).toBe(false);expect(calls.splice(0)).toEqual(['water','trail']);
  terrain.distance = 3.500001;
  expect(exclude(16,-16,1.250001)).toBe(true);expect(calls.splice(0)).toEqual(['water','trail']);
  terrain.level = 9;
  expect(exclude(-16,16,9.25)).toBe(true);expect(calls.splice(0)).toEqual(['water']);
  terrain.level = 1;input.ground.waterMargin = 50;input.ground.wetThreshold = 50;input.ground.wet.values.data = encode([0,0,0,0]);
  expect(exclude(16,-16,2)).toBe(true);expect(exclude(-16,16,2)).toBe(false);
});

test('complete bake policy admission preserves legacy identity and refuses ambiguous or effectful rows',() => {
  const terrain = { waterLevel: () => 0,trailDistance: () => 4 },legacy = (): boolean => true;
  expect(navmeshGroundExclusion(undefined,undefined)).toBeUndefined();
  expect(navmeshGroundExclusion({ excludeGroundAt: legacy },undefined)).toBe(legacy);
  for (const input of [{ ...rows,excludeGroundAt: legacy },{ ...rows,unknown: 1 },{ ground: { ...rows.ground,trailClearance: -1 } },{ ground: { ...rows.ground,wetThreshold: Infinity } },{ ground: { ...rows.ground,wet: { ...mask,values: { ...mask.values,count: 3 } } } },{ ground: { ...rows.ground,wet: { ...mask,values: { ...mask.values,data: encode([0,0,Number.NaN,0]) } } } }]) {
    expect(() => navmeshGroundExclusion(input,terrain)).toThrow();
  }
  expect(() => navmeshGroundExclusion(rows,undefined)).toThrow('bound terrain');
  let calls = 0;
  expect(() => navmeshGroundExclusion({ get ground() { calls++;return rows.ground; } },terrain)).toThrow();
  expect(() => navmeshGroundExclusion({ ground: { ...rows.ground,get wet() { calls++;return mask; } } },terrain)).toThrow();
  expect(calls).toBe(0);expect(formatJsonSchema(NavmeshGroundSchema)).toBeDefined();
});

test('actual declared bake row preserves the original native predicate at clamped and equality boundaries',() => {
  const row = nalati.navmesh?.ground,terrain = GROUND.terrain;
  if (row === undefined) throw new Error('Missing declared exclusion');
  expect(row.wet).toEqual(nalatiGeographyRows().channels.wet);
  expect(row.wet).toEqual(geography.channels.wet);
  const exclude = navmeshGroundExclusion(nalati.navmesh,terrain,nalati.scalarBlocks);
  if (exclude === undefined) throw new Error('Missing exclusion');
  const bytes = unzlibSync(scalarBlockBytes(geography.channels.wet.values.data));
  const wet = bakedSamplers({ res: geography.res,size: geography.size,heights: new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4),seed: geography.seed,landscapeHash: 0,splat: new Uint8Array(0),undergrowth: null }).heightAt;
  const points = [-500,-251,-250,-249.999,-0,0,.5,249.999,250,251,500,Number.NaN];
  for (let i = 0; i <= 24; i++) points.push(-250+500*i/24);
  for (const x of points) for (const z of points) for (const y of [terrain.waterLevel()+.249999,terrain.waterLevel()+.25,terrain.waterLevel()+.250001,Infinity,Number.NaN]) {
    const expected = y <= terrain.waterLevel()+.25 || (wet(x,z) > .5 && terrain.trailDistance(x,z) > 3.5);
    expect(exclude(x,z,y)).toBe(expected);
  }
});
