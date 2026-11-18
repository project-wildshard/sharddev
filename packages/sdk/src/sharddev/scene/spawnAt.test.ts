// ONE-FORMAT OF28d (absorbs SHARD-SOURCE AP25c): world.spawnAt writes a creature spawn row (format `creatures.spawns`) at a
// scene node's world position and heading, so a boss or a herd's place is typed once, in the scene.
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { parse } from 'valibot';
import { CreaturesSchema } from '@wildshard/format/creatures';
import { lowerShard } from './lower';
import { withAnchored } from './shardfile';

const BOSS = { species: 'template.blob', variant: 'plain', brain: null, strike: null, seed: 7, scale: 2 } as const;

test('world.spawnAt reads its node: a boss spawn row at the node position and heading, merged into creatures.spawns', () => {
  const scene = lowerShard({ slug: 's', name: 's' }, (world) => {
    const arena = new THREE.Group(), mound = new THREE.Object3D();
    arena.position.set(10, 0, -5); mound.position.set(2, 1, 0); mound.rotation.y = 0.5;
    arena.add(mound); world.scene.add(arena);
    world.spawnAt('blob.boss', mound, BOSS);
    mound.position.x = 4; // read once the build has run: a node moved later still counts
  });
  expect(scene.anchored.spawns).toEqual([{ ...BOSS, id: 'blob.boss', at: [14, 1, -5], yaw: 0.5 }]);
  const merged = withAnchored({ creatures: { brains: [], groups: [], spawns: [] } }, scene.anchored);
  expect(parse(CreaturesSchema, merged.creatures).spawns).toEqual([{ ...BOSS, id: 'blob.boss', at: [14, 1, -5], yaw: 0.5 }]);
});

test('a scene with no world.spawnAt leaves creatures as extend wrote them', () => {
  const scene = lowerShard({ slug: 's', name: 's' }, (world) => { world.spawn(0, 0, 0); });
  expect(scene.anchored.spawns).toBeUndefined();
  const shard = { creatures: { brains: [], groups: [], spawns: [] } };
  expect(withAnchored(shard, scene.anchored)).toBe(shard);
});

test('world.spawnAt refuses a second row of one id, a node outside the scene, and an id extend also declares', () => {
  expect(() => lowerShard({ slug: 's', name: 's' }, (world) => {
    const a = new THREE.Object3D(); world.scene.add(a);
    world.spawnAt('wolf.1', a, BOSS); world.spawnAt('wolf.1', a, BOSS);
  })).toThrow('two spawnAts share this id');
  expect(() => lowerShard({ slug: 's', name: 's' }, (world) => { world.spawnAt('wolf.1', new THREE.Object3D(), BOSS); })).toThrow('not in the scene');
  const scene = lowerShard({ slug: 's', name: 's' }, (world) => { const a = new THREE.Object3D(); world.scene.add(a); world.spawnAt('wolf.1', a, BOSS); });
  expect(() => withAnchored({ creatures: { brains: [], groups: [], spawns: [{ id: 'wolf.1' }] } }, scene.anchored)).toThrow('extend declares spawn wolf.1 too');
});
