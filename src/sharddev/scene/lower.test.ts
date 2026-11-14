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
