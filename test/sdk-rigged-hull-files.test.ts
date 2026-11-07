// SHARD-PLATFORM W2a (sp-o288): riggedHulls reads a hull's image-free rig and its separate KTX2 maps from `files`
// (a built product's named blobs), samples the maps as the rig's glTF maps were, and Pine keeps its coat cache identity.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { afterEach, expect, it, vi } from 'vitest';
import { riggedHullMap, riggedHulls } from '@wildshard/engine/game/looks/riggedHulls';
import { parseRiggedHullBook, type RiggedHullFamilyRow } from '@wildshard/format/riggedHulls';
import { parsePlatformDataSection } from '@wildshard/format/platformDataSections';
import { GPU_FILES } from '../src/shards/pine-hollow/ktx2.generated';
import { PINE_WILDLIFE_DRAW as WILDLIFE_DRAW } from './fixtures/pine-program';
import { PINE_HULLS } from '../src/shards/pine-hollow/generators/creatureHulls';
import { PINE_HULL_BOOK, pineHullResources } from '../src/shards/pine-hollow/generators/riggedHulls';
import { NALATI_HULL_BOOK } from '../src/shards/nalati-grasslands/generators/riggedHulls';

afterEach(() => { vi.restoreAllMocks(); });

it('admits two complete books and rejects executable or missing resource rows before loading', () => {
  expect(parseRiggedHullBook(PINE_HULL_BOOK)).toEqual(PINE_HULL_BOOK);
  expect(parsePlatformDataSection('look/rigged-hulls', PINE_HULL_BOOK)).toEqual(PINE_HULL_BOOK);
  expect(parsePlatformDataSection('look/rigged-hulls', NALATI_HULL_BOOK)).toEqual(NALATI_HULL_BOOK);
  expect(parseRiggedHullBook(NALATI_HULL_BOOK)).toEqual(NALATI_HULL_BOOK);
  expect(() => parseRiggedHullBook({ ...PINE_HULL_BOOK, load: () => undefined })).toThrow('plain data');
  const bad = structuredClone(PINE_HULL_BOOK);
  expect(() => parseRiggedHullBook({ ...bad, tiers: { ...bad.tiers, phone: { ...bad.tiers.phone, files: {} } } })).toThrow('Missing hull resource');
  expect(() => parsePlatformDataSection('look/rigged-hulls', { ...bad, tiers: { ...bad.tiers, phone: { ...bad.tiers.phone, files: {} } } })).toThrow('Missing hull resource');
  expect(NALATI_HULL_BOOK.tiers.phone.vertexColours).toBe(true);
  expect(NALATI_HULL_BOOK.tiers.desktop.doubleSided).toEqual(['eagle']);
});

const compressed = (colorSpace: string): THREE.CompressedTexture => {
  const t = new THREE.CompressedTexture([{ data: new Uint8Array(16), width: 4, height: 4 }], 4, 4, THREE.RGBA_ASTC_4x4_Format);
  t.flipY = true; t.colorSpace = colorSpace; t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
};

it('samples a separate base map as the glTF base colour map: unflipped, repeat, anisotropy 4, sRGB', () => {
  const t = riggedHullMap(compressed(THREE.NoColorSpace), 'base', 'deer-hind');
  expect([t.flipY, t.wrapS, t.wrapT, t.anisotropy, t.colorSpace, t.name])
    .toEqual([false, THREE.RepeatWrapping, THREE.RepeatWrapping, 4, THREE.SRGBColorSpace, 'deer-hind-albedo']);
});

it('keeps a separate normal map in its file\'s colour space, as GLTFLoader left it', () => {
  for (const space of [THREE.NoColorSpace, THREE.LinearSRGBColorSpace]) {
    const t = riggedHullMap(compressed(space), 'normal', 'boar');
    expect([t.flipY, t.wrapS, t.wrapT, t.anisotropy, t.colorSpace, t.name])
      .toEqual([false, THREE.RepeatWrapping, THREE.RepeatWrapping, 4, space, 'boar-normal']);
  }
});

it('reads the declared rig URL and refuses a failed resource without a procedural fallback', async () => {
  const row: RiggedHullFamilyRow = { label: 'test', rigs: ['deer-hind'], hulls: { 'deer:hind': 'deer-hind' } };
  const asked: string[] = [];
  vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation((url: string) => { asked.push(url); return Promise.reject(new Error('no file in Node')); });
  const family = riggedHulls(row, {
    files: { 'deer-hind': { rig: '/blob/rig-hash', base: '/blob/base-hash', normal: '/blob/normal-hash' } }, coats: {},
  });
  await expect(family.preload()).rejects.toThrow('no file in Node');
  expect(asked).toEqual(['/blob/rig-hash']);
  expect(() => family.skin('deer', 'hind', [])).toThrow('not prepared');
  expect(family.skin('deer', 'unmapped', [])).toBeNull();
});

it('preserves baked vertex AO, rest joints and sheet-sidedness on the shared loader', async () => {
  const file = await new GLTFLoader().parseAsync(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }], nodes: [] }), '');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(12), 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute([1, 0.5, 0.25, 0.5, 1, 1, 1, 1, 0.5, 0.25, 1, 0], 4));
  geometry.setIndex([0, 1, 2]);
  const bone = new THREE.Bone(); bone.name = 'body'; bone.position.y = 2;
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  mesh.add(bone); mesh.bind(new THREE.Skeleton([bone])); file.scene.add(mesh);
  vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockResolvedValue(file);
  const family = riggedHulls({ label: 'fixture', rigs: ['wing'], hulls: { 'bird:adult': 'wing' } },
    { files: { wing: '/wing.glb' }, coats: {}, vertexColours: true, doubleSided: ['wing'] });
  await family.preload();
  const hull = family.skin('bird', 'adult', [{ name: 'body', parent: null, pos: [0, 0, 0] }]);
  expect(hull?.doubleSided).toBe(true);
  expect(hull?.bones[0]?.pos).toEqual([0, 2, 0]);
  expect(hull?.geometry.getAttribute('color').array).toEqual(new Float32Array([0.7, 0.35, 0.175, 1, 1, 1, 0.2, 0.1, 0.4]));
  expect(() => family.skin('bird', 'adult', [])).toThrow('does not match');
});

it('names Pine\'s rigs and maps as the producer\'s blobs (generators/rigBlobs.mjs), per tier', () => {
  for (const tier of ['phone', 'desktop'] as const) {
    const { files } = pineHullResources(tier), dot = tier === 'phone' ? '.phone' : '';
    expect(Object.keys(files)).toEqual([...PINE_HULLS.rigs]);
    for (const hull of PINE_HULLS.rigs) {
      expect(files[hull]).toEqual({ rig: `models/creatures/${hull}${dot}.rigged.glb`,
        base: `models/creatures/${hull}${dot}.base.ktx2`, normal: `models/creatures/${hull}${dot}.normal.ktx2` });
    }
  }
});

it('keeps every baked coat\'s cache key on the rig\'s original public path and names its page as a product file', () => {
  for (const tier of ['phone', 'desktop'] as const) {
    const coats = Object.values(pineHullResources(tier).coats);
    const baked = Object.keys(GPU_FILES[tier]).filter(key => key.startsWith('procedural:/assets/pine-hollow/creatures/'));
    expect(baked.length).toBeGreaterThan(0);
    expect(coats.map(row => row.key).sort()).toEqual(baked.sort());
    for (const row of coats) expect(row.image).toBe(`models/creatures/${row.key.slice(row.key.lastIndexOf('/') + 1).replace(/\.png$/u, '.ktx2')}`);
  }
  expect(pineHullResources('desktop').coats['boar:boar:thrall']?.key).toBe('procedural:/assets/pine-hollow/creatures/boar.boar.thrall.coat.png');
});

it('names Pine\'s bird blobs as the producer does (generators/birdInputs.ts), per tier', () => {
  expect(WILDLIFE_DRAW.tiers.phone).toEqual({ geometry: 'models/life/birds-rest.phone.glb', atlas: 'models/life/birds.phone.base.ktx2' });
  expect(WILDLIFE_DRAW.tiers.desktop).toEqual({ geometry: 'models/life/birds-rest.glb', atlas: 'models/life/birds.base.ktx2' });
});
