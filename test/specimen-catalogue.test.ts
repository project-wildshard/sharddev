import { nalatiRuntime } from './fixtures/nalati-runtime';
import { nativePlaceFile } from './fixtures/nalati-native-place-files';
// oxlint-disable-next-line import/no-nodejs-modules -- Compare against shipped specimen bytes.
import { readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Decode the original committed lane bake.
import { inflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as v from 'valibot';
import { Rng } from '../src/shared/engine/core/rng';
import { modelContext, paramsOf } from '../src/client/engine/models/model';
import { SkyRig } from '../src/client/engine/world/skyRig';
import { painterlyKnobs } from '../src/client/engine/world/painterly';
import { unshuffleLanes, readBakedGeometry, bakedGeometryBytes } from '../src/client/game/plugin/geometry';
import { createPackedSpecimens, defineSpecimenCatalogue, specimenMaterial } from '../src/client/game/models/specimenCatalogue';
import { PackedSpecimenSchema } from '@wildshard/format/specimenCatalogue';
import packedRows from './fixtures/nalati-packed-specimens-original.json' with { type: 'json' };
import campMaterialRows from '../src/shards/nalati-grasslands/data/campMaterials.json' with { type: 'json' };
import type { CatalogueParams } from '../src/shards/nalati-grasslands/generators/campParams';
import type { CatalogueParams as TrailParams } from '../src/shards/driftwood-isle/generators/trailParams';
import { nalatiSpecimens as campData } from './fixtures/nalati-specimens';
import trailRows from '../src/shards/driftwood-isle/data/trailCatalogue.json' with { type: 'json' };

import { SceneFloorSchema } from '@wildshard/format/sceneDressing';
import sourcePlaces from './fixtures/nalati-places-original.json' with { type: 'json' };
import * as layout from '../src/shards/nalati-grasslands/generators/layout';
import { readSceneFloors } from '../src/client/game/shardfile/sceneDressing';
import { deckFloor, torFloor, type PlaceRow } from '../src/shards/nalati-grasslands/generators/placeRows';
import { cragLedgeFloor, leopardCaveFloor, kurganEntranceFloor } from '../src/shards/nalati-grasslands/generators/placement';
import { pathRampDescs } from '../src/shared/engine/physics/paths';
import { bakedSamplers } from '@wildshard/format/bakedTerrainSampling';
import { parseBakedTerrain } from '@wildshard/format/bakedTerrainBytes';

const memberSchema=v.object({solid:v.array(v.unknown()),descs:v.array(v.unknown()),floors:v.array(SceneFloorSchema)});
const preparedPlaces=v.parse(v.object({places:v.object({rows:v.array(v.object({name:v.string(),colliders:v.array(v.unknown()),
  members:v.array(v.tuple([v.string(),memberSchema]))}))})}),
  nalatiRuntime);

const trailCatalogue = defineSpecimenCatalogue<TrailParams>(trailRows);
const trail = { fencePost: trailCatalogue.model('fencePost'), signpost: trailCatalogue.model('signpost'), plankStep: trailCatalogue.model('plankStep') };
const campCatalogue=defineSpecimenCatalogue<CatalogueParams>(campData.catalogue,campData.packed,campData.materials);
const camp={feltRug:campCatalogue.model('feltRug'),yurt:campCatalogue.model('yurt'),campClutter:campCatalogue.model('campClutter'),herdHorse:campCatalogue.model('herdHorse'),kazan:campCatalogue.model('kazan')};
function testSky(): SkyRig {
  const sky: unknown = Object.create(SkyRig.prototype);
  if (!(sky instanceof SkyRig)) throw new Error('Missing test sky');
  Reflect.set(sky, 'csm', { lights: [] }); Reflect.set(sky, 'sunDir', new THREE.Vector3(0, 1, 0));
  vi.spyOn(sky, 'setupMaterial').mockImplementation(() => undefined);
  return sky;
}
const binary = (): Uint8Array => unshuffleLanes(new Uint8Array(inflateSync(nativePlaceFile('specimens.bin'))));
const bake = v.parse(PackedSpecimenSchema, { ...packedRows, bin: '/assets/nalati/baked/specimens.bin' });

function expectSameWords(actual: ArrayBufferView | null | undefined, expected: ArrayBufferView | null): void {
  if (expected === null) { expect(actual).toBeNull(); return; }
  if (actual === undefined || actual === null) throw new Error('Missing original specimen channel');
  expect(actual.constructor).toBe(expected.constructor);
  expect(actual.byteLength).toBe(expected.byteLength);
  // Preserve every word, including signed zero, without recursive numeric-key equality.
  expect(Buffer.compare(new Uint8Array(actual.buffer, actual.byteOffset, actual.byteLength),
    new Uint8Array(expected.buffer, expected.byteOffset, expected.byteLength))).toBe(0);
}

describe('declared specimen catalogue', () => {
  it('retains nested parameter defaults and authored variant merges', () => {
    expect(paramsOf(trail.signpost, 'three', undefined)).toEqual({ arrows: [0.45, 0.75, -0.87], labels: ['LOOKOUT', 'WRECK', 'SHRINE'] });
    expect(paramsOf(trail.plankStep, 'dark', undefined)).toEqual({ w: 2.4, roll: 0, yaw: 0, dark: true });
    expect(paramsOf(camp.feltRug, 'palette-3', undefined)).toEqual({ w: 1.5, h: 2.2, pal: 3 });
    expect(paramsOf(camp.yurt, 'felt', undefined)).toEqual({ r: 2.8, flue: false, palette: 2, old: true, base: 'felt', pennant: false });
    expect(camp.campClutter.variants?.map(variant => variant.id)).toEqual(['firewood-tipi', 'dung-cake-stack', 'chopping-block', 'pots-and-a-bucket', 'sacks', 'folded-felts', 'kumis-churn']);
  });

  it('retains own-space fence and signpost colliders without an asset load', () => {
    const ctx = modelContext(null);
    expect(trail.fencePost.colliders?.({}, ctx)).toEqual([{ kind: 'box', x: 0, y: 0.1, z: 0, hx: 0.16, hy: 1.1, hz: 0.16 }]);
    expect(trail.signpost.colliders?.(trail.signpost.defaults, ctx)).toEqual([{ kind: 'box', x: 0, y: 0.7, z: 0, hx: 0.12, hy: 1.7, hz: 0.12 }]);
    expect(trail.fencePost.colliders?.({}, ctx)[0]).not.toBe(trail.fencePost.colliders?.({}, ctx)[0]);
  });

  it('retains inert instance markers without installing shard callbacks', () => {
    const marker: unknown = Reflect.get(camp.herdHorse.build, 'gen');
    expect(marker).toEqual({ id: 'nalati-grasslands/herd-horse', name: 'horse-wild', lod: 'far', look: { rim: 0.8, bands: 0.85 } });
    expect(Reflect.get(camp.kazan.build, 'gen')).toEqual({ id: 'nalati-grasslands/kazan', name: 'cauldron', lod: 'near', look: {} });
  });

  it('refuses arbitrary procedural trail shapes before requesting an asset', () => {
    expect(() => trail.plankStep.build(modelContext(testSky()), { ...trail.plankStep.defaults, w: 15 }, new Rng(1))).toThrow('No authored specimen');
    expect(trailRows.flatMap(row => row.source.variants)).toHaveLength(6);
  });

  it('refuses duplicate catalogue keys and duplicate model identities', () => {
    const row = trailRows[0]; if (row === undefined) throw new Error('Missing trail row');
    expect(() => defineSpecimenCatalogue([row, row])).toThrow('bounded and unique');
    expect(() => defineSpecimenCatalogue([row, { ...row, key: 'different' }])).toThrow('bounded and unique');
  });

  it('refuses callbacks and non-asset source paths at the wire boundary', () => {
    const row = trailRows[0]; if (row === undefined) throw new Error('Missing trail row');
    expect(() => defineSpecimenCatalogue([{ ...row, model: { ...row.model, defaults: { select: () => 'shape' } } }])).toThrow('plain JSON data');
    expect(() => defineSpecimenCatalogue([{ ...row, source: { kind: 'asset', asset: { url: '/src/shard.ts', material: { id: 'test', family: 'lowpoly' } } } }])).toThrow();
  });

  it('refuses truncated binaries and rows that do not cover the binary', () => {
    const packed = createPackedSpecimens(bake), bytes = binary();
    expect(() => packed.use(bytes.subarray(4))).toThrow('byte count differs');
    expect(() => createPackedSpecimens({ ...bake, rows: [] }).use(bytes)).toThrow('do not cover');
  });

  it('decodes every original packed part in order, retaining independent attribute ownership', () => {
    const packed = createPackedSpecimens(bake), bytes = binary(), ctx = modelContext(testSky()); packed.use(bytes);
    const materialRows = Object.fromEntries(Object.entries(campMaterialRows).map(([name, row]) => [name, { id: row.id, family: 'painterly' as const }]));
    const selected = new Set<string>(); let offset = 0;
    for (const row of bake.rows) {
      if (!selected.has(row.key)) {
        selected.add(row.key);
        const parts = packed.parts(row.key, ctx, materialRows), again = packed.parts(row.key, ctx, materialRows);
        expect(parts).toHaveLength(row.parts.length);
        let at = offset;
        for (const [index, part] of row.parts.entries()) {
          const original = readBakedGeometry(bytes, at, part.geometry), expected = part.geometry.expand ? original.toNonIndexed() : original;
          if (part.geometry.expand) { expected.computeBoundingBox(); expected.computeBoundingSphere(); }
          const actual = parts?.[index]?.geometry, second = again?.[index]?.geometry;
          expectSameWords(actual?.getIndex()?.array ?? null, expected.getIndex()?.array ?? null);
          for (const name of Object.keys(expected.attributes)) {
            expectSameWords(actual?.getAttribute(name).array, expected.getAttribute(name).array);
            expect(actual?.getAttribute(name).array).not.toBe(second?.getAttribute(name).array);
          }
          expect(parts?.[index]?.material).toBe(again?.[index]?.material);
          expect(actual?.boundingSphere).toEqual(expected.boundingSphere);
          actual?.dispose(); second?.dispose(); expected.dispose(); if (expected !== original) original.dispose();
          at += bakedGeometryBytes(part.geometry);
        }
      }
      for (const part of row.parts) offset += bakedGeometryBytes(part.geometry);
    }
    expect(offset).toBe(bytes.length);
  });

  it('builds the catalogue from the admitted binary on the exact live POI material', () => {
    const catalogue = defineSpecimenCatalogue<{ ribbonPole: object }>(campData.catalogue, campData.packed, campData.materials);
    catalogue.usePacked(binary());
    const sky = testSky(), built = catalogue.model('ribbonPole').build(modelContext(sky), {}, new Rng(1));
    if (!(built instanceof THREE.Group)) throw new Error('Expected lazy group');
    const mesh = built.children[0]; if (!(mesh instanceof THREE.Mesh)) throw new Error('Expected painted specimen');
    expect(mesh.material).toBe(specimenMaterial(sky, campData.materials['poi']));
    expect(mesh.castShadow).toBe(true); expect(mesh.receiveShadow).toBe(true);
  });

  it('publishes packed readiness only after the specimen can be cached', async () => {
    const catalogue = defineSpecimenCatalogue<{ ribbonPole: object }>(campData.catalogue, campData.packed, campData.materials);
    catalogue.usePacked(binary());
    const target = new EventTarget(), ready = vi.fn((): void => undefined);
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { value: target, configurable: true });
    target.addEventListener('ws:model-ready', ready);
    try {
      const built = catalogue.model('ribbonPole').build(modelContext(testSky()), {}, new Rng(1));
      expect(built).toBeInstanceOf(THREE.Group);
      expect(ready).not.toHaveBeenCalled();
      await Promise.resolve();
      expect(ready).toHaveBeenCalledOnce();
    } finally {
      if (previous === undefined) Reflect.deleteProperty(globalThis, 'document');
      else Object.defineProperty(globalThis, 'document', previous);
    }
  });

  it('shares material identities with the world and recreates disposed material caches', () => {
    const sky = testSky(), row = campMaterialRows.poi;
    const material = specimenMaterial(sky, row);
    expect(material).toBe(specimenMaterial(sky, campData.materials['poi']));
    expect(painterlyKnobs(material)?.uPRim.value).toBe(0.35);
    expect(painterlyKnobs(material)?.uPFloorAmt.value).toBe(1);
    expect(specimenMaterial(testSky(), row)).not.toBe(material);
    material.dispose(); expect(specimenMaterial(sky, row)).not.toBe(material);
  });
});

it('retains every POI collider and path-ramp descriptor after floor baking', () => {
  const original = v.parse(v.custom<readonly PlaceRow[]>(Array.isArray), sourcePlaces.rows);
  const prepared = preparedPlaces.places.rows;
  const before = original.flatMap(row => row.members.flatMap(([, member]) => member.floors.map(f => 'kind' in f ? f.kind === 'ledge' ? cragLedgeFloor(f) : f.kind === 'cave' ? leopardCaveFloor(f) : kurganEntranceFloor(f) : 'slabs' in f ? torFloor(f) : deckFloor(f))));
  const files=new Map([0,1].map(index=>[`world/floors/${String(index)}.bin`,Uint8Array.from(readFileSync(`test/fixtures/nalati-floor-original-${String(index)}.bin`))] as const));
  const after = prepared.flatMap(row => row.members.flatMap(([, member]) => readSceneFloors(member.floors,files)));
  for (const row of original) {
    const actual = prepared.find(candidate => candidate.name === row.name);
    expect(actual?.colliders).toEqual(row.colliders);
    expect(actual?.members.map(([id, member]) => [id, member.solid, member.descs])).toEqual(row.members.map(([id, member]) => [id, member.solid, member.descs]));
  }
  const grid = parseBakedTerrain(Uint8Array.from(readFileSync('public/assets/baked/nalati-grasslands/terrain.bin')).buffer);
  if (grid === null) throw new Error('Missing native terrain');
  const field = bakedSamplers(grid);
  const trails = [layout.S_ROAD_PTS, layout.N_ROAD_PTS, layout.E_ROAD_PTS, layout.W_ROAD_PTS, layout.SKY_ROAD, layout.CAMP_SPUR, ...layout.BOWL_TRACKS, layout.EAGLE_TRAIL, layout.CAVE_TRAIL, layout.ARGYMAQ_TRAIL] as readonly (readonly (readonly [number, number])[])[];
  const ramps = (floors: readonly ((x: number,z: number) => number | undefined)[]) => pathRampDescs(trails,field.heightAt,(x,z)=>field.normalAt(x,z)[1],{carried:(x,z)=>floors.some(f=>f(x,z)!==undefined)});
  expect(ramps(after)).toEqual(ramps(before));
});
