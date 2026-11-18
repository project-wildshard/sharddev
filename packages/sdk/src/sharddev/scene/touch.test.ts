import * as THREE from 'three';
import { expect, test } from 'vitest';
import { solid } from './author';
import { lowerShard } from './lower';
import { SceneRefusalError } from './refusal';
import { sceneShardfile } from './shardfile';

// SHARD-SOURCE SS9d: a touchable panel part (a crate by the yard gate) lowers to one `props.bodies` row naming its panel,
// its rest at the part's bounds and its shape fitted round them; its solids are the body, never a static collider.
const wood = new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: 0.85 });
const yard = lowerShard({ slug: 'ss9d', name: 'SS9d' }, (world) => {
  world.part('crate', (part) => { const box = solid(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), wood)); box.position.set(6, 0.4, -4); part.add(box); },
    { panel: 'yard.crate', touchable: { material: 'wood', density: 300 } });
  world.part('barrel', (part) => { const can = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2), wood); can.position.set(-3, 0.6, 2); part.add(can); },
    { panel: 'yard.barrel', touchable: { material: 'wood', shape: 'cylinder', damping: 0.5 } });
});

test('a touchable crate lowers to one body row naming its panel, and no static collider', () => {
  const { shard } = sceneShardfile(yard);
  const props = shard.props; if (props === null || props === undefined) throw new Error('no props');
  expect(props.panels.map((p) => p.id).sort()).toEqual(['yard.barrel', 'yard.crate']);
  expect(props.bodies).toEqual([
    { id: 'yard.crate', panel: 'yard.crate', at: { x: 6, y: 0.4, z: -4 }, yaw: 0, shape: { cuboid: { x: 0.4, y: 0.4, z: 0.4 } }, material: 'wood', density: 300 },
    { id: 'yard.barrel', panel: 'yard.barrel', at: { x: -3, y: 0.6, z: 2 }, yaw: 0, shape: { cylinder: { radius: 0.4, halfHeight: 0.6 } }, material: 'wood', linearDamping: 0.5, angularDamping: 0.5 },
  ]);
  expect(props.colliders.some((c) => c.panel === 'yard.crate')).toBe(false);
});

test('a touchable part that is not a panel, or has nothing in it, refuses', () => {
  expect(() => lowerShard({ slug: 's', name: 's' }, (world) => { world.part('crate', (part) => { part.add(new THREE.Mesh(new THREE.BoxGeometry(), wood)); }, { touchable: { material: 'wood' } }); }))
    .toThrow(SceneRefusalError);
  expect(() => lowerShard({ slug: 's', name: 's' }, (world) => { world.part('crate', () => undefined, { panel: 'yard.crate', touchable: { material: 'wood' } }); }))
    .toThrow(/no bounds/u);
});

test('a panel that shares a texture with the far tiles refuses by name (SS9e: the crate borrowed the yard wall\'s wood)', () => {
  const grain = new THREE.DataTexture(new Uint8Array(4 * 4 * 4).fill(200), 4, 4); grain.needsUpdate = true;
  const planks = new THREE.MeshStandardMaterial({ map: grain, roughness: 0.8 });
  const lowered = lowerShard({ slug: 'shared', name: 'Shared' }, (world) => {
    world.part('mound', (part) => { const wall = solid(new THREE.Mesh(new THREE.SphereGeometry(3, 48, 24), planks)); wall.position.set(0, 1, -6); part.add(wall); });
    world.part('crate', (part) => { const box = solid(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), planks)); box.position.set(3, 0.4, 2); part.add(box); },
      { panel: 'yard.crate', touchable: { material: 'wood' } });
  });
  expect(() => sceneShardfile(lowered)).toThrow(/shares a texture with the far \(L1\) tiles/u);
});
