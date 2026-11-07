import { expect, test } from 'vitest';
import * as THREE from 'three';
import { Rng } from '../src/shared/engine/core/rng';
import { defineGeometryModel, modelContext, paramsOf } from '../src/client/engine/models/model';
import { pineCrags } from '../src/shards/pine-hollow/generators/bake-pine-crags.mjs';
import { BAKED_COVE } from './fixtures/driftwood-baked-cove';
import { ISLAND_LOOK } from '../src/shards/driftwood-isle/generators/islandRows';
import { PINE_SOURCES } from './fixtures/pine-sources';
import { timberWorld } from '../src/shards/pine-hollow/generators/timberWorldRows';

const authored = timberWorld(PINE_SOURCES);

// GR8 G33: the crag rows are the producer's, not a stored data/crags.json
const crags = (await pineCrags(PINE_SOURCES)).rows;

test('all cove families retain clone, shadow, specimen and far-copy policy', () => {
  const families = BAKED_COVE.instances?.families ?? [];
  const ctx = modelContext(null), rng = new Rng(1), geometry = new Map<string, THREE.BufferGeometry>();
  const materials: Record<string, THREE.Material> = { cast: new THREE.MeshBasicMaterial(), cover: new THREE.MeshBasicMaterial(), big: new THREE.MeshBasicMaterial() };
  for (const { model } of families) for (const variant of model.variants) {
    geometry.set(variant.id, new THREE.BoxGeometry()); geometry.set(`${variant.id}_lo`, new THREE.BoxGeometry(2, 2, 2));
  }
  expect(families).toHaveLength(16);
  for (const { key, look: slot, model: row } of families) {
    const model = defineGeometryModel(row, 'proto', { category: row.category, pipeline: row.pipeline }, { geometry, materials });
    for (const variant of model.variants ?? []) {
      const params = paramsOf(model, variant.id, undefined), built = model.build(ctx, params, rng), specimen = model.specimen?.(ctx, params, rng);
      if (built instanceof THREE.Object3D || specimen instanceof THREE.Object3D) throw new Error('Expected cove parts');
      expect(built).toHaveLength(1);
      expect(built[0]?.geometry).not.toBe(geometry.get(variant.id));
      expect(built[0]?.geometry.getAttribute('position').array).toEqual(geometry.get(variant.id)?.getAttribute('position').array);
      expect(built[0]?.material).toBe(materials[slot]);
      expect(built[0]?.castShadow).toBe(slot === 'cast'); expect(built[0]?.receiveShadow).toBe(true);
      expect(specimen?.[0]?.material).toBe(materials['cast']);
      const levels = model.lods ?? [];
      expect(levels).toHaveLength(key === 'palm' || key === 'bpalm' ? 1 : 0);
      for (const level of levels) {
        const far = level.build(ctx, params, rng); if (far instanceof THREE.Object3D) throw new Error('Expected far cove part');
        expect(level.from).toBe(ISLAND_LOOK.lod); expect(far[0]?.geometry.getAttribute('position').array).toEqual(geometry.get(`${variant.id}_lo`)?.getAttribute('position').array);
      }
    }
  }
});

test('every baked crag copy preserves native pose inputs and grouping', () => {
  const groups = [
    ['cliff-a', 'cliff-b', 'cliff-c', 'buttress', 'slab', 'tor-a', 'tor-b', 'hero'],
    ['boulder-a', 'boulder-b', 'boulder-c'], ['scree-a', 'scree-b'],
  ];
  for (const tier of ['phone', 'desktop'] as const) {
    const kinds = authored.cragAssembly.tiers[tier].kinds;
    expect(kinds.map(kind => kind.placements.length)).toEqual(groups.map(ids => crags.places.filter(p => ids.includes(p.id)).length));
    for (const [index, kind] of kinds.entries()) {
      const original = crags.places.filter(p => groups[index]?.includes(p.id));
      expect(kind.placements).toEqual(original.map(p => ({ x: p.x, y: p.y, z: p.z, variant: p.id,
        yaw: p.yaw, scale: p.scale, pitch: p.tiltX, roll: p.tiltZ })));
      expect(kind.model.variants.map(variant => variant.id)).toEqual(groups[index]);
    }
    expect(kinds.map(kind => [kind.model.lods[0]?.from, kind.far])).toEqual(tier === 'phone' ? [[95, 900], [38, 170], [30, 110]] : [[170, 900], [70, 320], [55, 200]]);
  }
});

test('geometry recipes retain borrowing, cloning, fallback, lazy LODs and hulls', () => {
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial(), specimen = new THREE.MeshBasicMaterial();
  const ctx = modelContext(null), policy = { category: 'nature', pipeline: 'blender', surface: 'rock' } as const;
  let distance = 95;
  const model = defineGeometryModel({ id: 'test/geometry-recipes', name: 'Recipe', file: 'test/geometry-model.test.ts', defaults: { module: 'rock' },
    variants: [{ id: 'other', label: 'Other', params: { module: 'other' } }],
    parts: { rock: [{ geometry: 'rock', material: 'world', castShadow: true, receiveShadow: true }], other: [{ geometry: 'rock', material: 'world', clone: true, castShadow: false, receiveShadow: true }] },
    get lods() { return [{ from: distance, parts: { rock: [{ geometry: 'missing', fallback: 'rock', material: 'world', castShadow: true, receiveShadow: true }] } }]; },
    hulls: { rock: { points: [0.1, 0.2, 0.3] } }, specimenMaterial: 'specimen',
  }, 'module', policy, () => ({ geometry: new Map([['rock', geometry]]), materials: { world: material, specimen } }));
  const rng = new Rng(1);
  const built = model.build(ctx, model.defaults, rng);
  expect(built).toEqual([{ geometry, material, castShadow: true, receiveShadow: true }]);
  const other = model.build(ctx, paramsOf(model, 'other', undefined), rng);
  if (other instanceof THREE.Object3D) throw new Error('Expected recipe parts');
  expect(other[0]?.geometry).not.toBe(geometry);
  expect(other[0]?.geometry.getAttribute('position').array).toEqual(geometry.getAttribute('position').array);
  expect(model.lods?.[0]?.build(ctx, model.defaults, rng)).toEqual(built);
  distance = 170; expect(model.lods?.[0]?.from).toBe(170);
  expect(model.colliders?.(model.defaults, ctx)).toEqual([{ kind: 'hull', x: 0, y: 0, z: 0, points: new Float32Array([0.1, 0.2, 0.3]), surface: 'rock' }]);
  expect(model.colliders?.({ module: 'other' }, ctx)).toEqual([]);
  expect(model.specimen?.(ctx, model.defaults, rng)).toEqual([{ geometry, material: specimen, castShadow: true, receiveShadow: true }]);
});
