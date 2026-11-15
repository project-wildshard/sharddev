import * as THREE from 'three';
import { expect, test } from 'vitest';
import { lowerShard, SceneRefusalError } from './lower';
import { solid } from './author';

test('a re-run changes only the edited part\'s hash', () => {
  const run = (roof: string) => lowerShard({ slug: 'authoring-slice', name: 'Slice' }, (world) => {
    world.part('hut', (part) => { part.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: roof }))); });
    world.part('pond', (part) => { const lamp = new THREE.PointLight('#ffa850', 3.4, 6, 1.7); lamp.position.set(-19, 2, 2); part.add(lamp, new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2), new THREE.MeshStandardMaterial({ color: '#7a8a36' }))); });
  });
  const a = run('#ff0000'), b = run('#00ff00'), c = run('#ff0000');
  expect(a.parts[0]?.hash).not.toBe(b.parts[0]?.hash);
  expect(a.parts[1]?.hash).toBe(b.parts[1]?.hash);
  expect(a.parts[0]?.hash).toBe(c.parts[0]?.hash);
});

test('what has no lowering yet is refused by path and row, never dropped', () => {
  expect(() => lowerShard({ slug: 's', name: 's' }, (world) => {
    world.part('lines', (part) => { part.add(new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)))); });
  })).toThrow(SceneRefusalError);
  expect(() => lowerShard({ slug: 's', name: 's' }, (world) => {
    world.part('shader', (part) => { part.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.ShaderMaterial())); });
  })).toThrow(/shader\/Mesh 0: a ShaderMaterial is raw GLSL/u);
  const boxed = lowerShard({ slug: 's', name: 's' }, (world) => { world.part('wall', (part) => { const m = solid(new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.3))); m.position.set(1, 1.5, 2); m.rotation.y = Math.PI / 2; part.add(m); }); });
  const box = boxed.parts[0]?.colliders[0];
  expect(box?.half[0]).toBeCloseTo(3); expect(box?.centre).toEqual([1, 1.5, 2]);
});

test('a trigger and a use prompt take their node\'s world position, read after the build (AP25a, AP25b)', () => {
  const scene = lowerShard({ slug: 's', name: 's' }, (world) => {
    world.part('yard', (part) => {
      const shed = new THREE.Group(), door = new THREE.Object3D(), bank = new THREE.Object3D();
      door.position.set(0, 1, 2); shed.add(door); part.add(shed, bank); bank.position.set(-10.4, 0, 0.3);
      world.interact('yard.door', door, { label: 'Open the door', radius: 2, scene: 'yard.door.open' });
      world.trigger('yard.pond', bank, { radius: 4 });
      // moved after it was named: the row reads where it ends up
      shed.position.set(5, 0, -3);
    });
  });
  expect(scene.anchored.triggers).toEqual([{ id: 'yard.pond', kind: 'region', flag: 'yard.pond', x: -10.4, z: 0.3, radius: 4 }]);
  expect(scene.anchored.interactions).toEqual([{ id: 'yard.door', at: [5, 1, -1], radius: 2, label: 'Open the door', scene: 'yard.door.open' }]);
  expect(() => lowerShard({ slug: 's', name: 's' }, (world) => { world.trigger('lost', new THREE.Object3D(), { radius: 1 }); })).toThrow(/its node is not in the scene/u);
  expect(() => lowerShard({ slug: 's', name: 's' }, (world) => { const a = new THREE.Object3D(); world.scene.add(a); world.trigger('twice', a, { radius: 1 }); world.trigger('twice', a, { radius: 1 }); })).toThrow(/two triggers share this id/u);
  expect(() => lowerShard({ slug: 's', name: 's' }, (world) => { const a = new THREE.Object3D(); world.scene.add(a); world.interact('far', a, { label: 'x', radius: 9, scene: 's.x' }); })).toThrow(/outside 0.1 to 8 m/u);
});
