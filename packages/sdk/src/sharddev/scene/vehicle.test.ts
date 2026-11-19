import * as THREE from 'three';
import { expect, test } from 'vitest';
import { parseVehicles } from '@wildshard/format/vehicles';
import { solid, type PartOptions, type ShardWorld } from './author';
import { lowerShard } from './lower';
import { SceneRefusalError } from './refusal';
import { sceneShardfile } from './shardfile';

// MIRROR-SALT-ZONE MSZ3: `world.vehicle(kind, build, options)` and `world.dock(id, at, { kind })` lower to format
// `world/vehicles` (MSZ1): seats from `seat.*` empties, leave points from `leave.*` empties or the footprint's side, the hull
// from `solid()` meshes, the panel posed at its docks (so written hidden); `world.part`'s old `vehicle` is refused.
const paint = new THREE.MeshStandardMaterial({ color: '#c8b27a', roughness: 0.8 });
const empty = (name: string, x: number, y: number, z: number): THREE.Object3D => { const node = new THREE.Object3D(); node.name = name; node.position.set(x, y, z); return node; };
/** A salt buggy: a 2 by 3.6 m tub, a driver on the left and a passenger on the right, the passenger's door a step out. */
const buggy = (part: THREE.Group): void => {
  const tub = solid(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 3.6), paint)); tub.position.set(0, 0.5, 0); part.add(tub);
  part.add(empty('seat.driver', -0.45, 0.6, 0.3), empty('seat.passenger', 0.45, 0.6, 0.3), empty('leave.passenger', 2, 0, 0.3));
};
const yard = (world: ShardWorld): THREE.Object3D => { const node = new THREE.Object3D(); node.position.set(-10, 0, 150); node.rotation.y = Math.PI / 2; world.scene.add(node); return node; };
const lowered = (build: (world: ShardWorld) => void) => sceneShardfile(lowerShard({ slug: 'msz3', name: 'MSZ3' }, build));

test('a two-seat buggy and its dock lower to the world/vehicles rows the format admits', () => {
  const scene = lowerShard({ slug: 'msz3', name: 'MSZ3' }, (world) => {
    world.vehicle('salt.buggy', buggy, { speed: 22, reverse: 6, grip: 0.8, labels: { drive: 'Drive the buggy', ride: 'Ride in the buggy', leave: 'Get out' } });
    world.dock('yard.buggy', yard(world), { kind: 'salt.buggy' });
  });
  const vehicles = parseVehicles(scene.anchored.vehicles);
  expect(vehicles.kinds).toEqual([{
    id: 'salt.buggy', panel: 'salt.buggy', labels: { drive: 'Drive the buggy', ride: 'Ride in the buggy', leave: 'Get out' },
    seats: [
      { role: 'driver', at: [-0.45, 0.6, 0.3], pose: 'sit', leave: [-1.8, 0, 0.3] },
      { role: 'passenger', at: [0.45, 0.6, 0.3], pose: 'sit', leave: [2, 0, 0.3] },
    ],
    hull: [{ at: [0, 0.5, 0], half: [1, 0.5, 1.8] }],
    handling: { speed: 22, reverse: 6, accel: 6, brake: 12, turn: 1.2, grip: 0.8, drift: 0.3, boost: 1.5, mass: 500, ground: true },
  }]);
  expect(vehicles.docks).toEqual([{ id: 'yard.buggy', kind: 'salt.buggy', at: [-10, 0, 150], yaw: 1.571, per: 'player', respawn: 60 }]);
  const { shard } = sceneShardfile(scene);
  // its panel ships hidden (an engine poses it at the docks), and its solids are its hull, never a collider at the origin
  expect(shard.props?.panels.map((panel) => [panel.id, panel.visible])).toEqual([['salt.buggy', false]]);
  expect(shard.props?.colliders.some((row) => row.panel === 'salt.buggy') ?? false).toBe(false);
  expect(shard.movers).toEqual([]);
});

test('world.part with the old vehicle option is refused, naming world.vehicle', () => {
  const old = { panel: 'salt.sail', vehicle: { speed: 9 } } as unknown as PartOptions;
  expect(() => lowered((world) => { world.part('sail', buggy, old); })).toThrow(SceneRefusalError);
  expect(() => lowered((world) => { world.part('sail', buggy, old); })).toThrow(/world\.vehicle\(kind, build, options\)/u);
});

test('a vehicle needs a seat.driver, a dock a declared kind, and its numbers the format range', () => {
  const refused = (build: (world: ShardWorld) => void, why: RegExp): void => { expect(() => lowered(build)).toThrow(why); };
  refused((world) => { world.vehicle('salt.cart', (part) => { part.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), paint)); }, { speed: 5 }); }, /no seat\.driver/u);
  refused((world) => { world.vehicle('salt.buggy', buggy, { speed: 5 }); world.dock('yard.tank', yard(world), { kind: 'salt.tank' }); }, /a vehicle dock names a declared kind/u);
  refused((world) => { world.vehicle('salt.buggy', buggy, { speed: 61 }); }, /Expected <=60/u);
  refused((world) => { world.vehicle('salt.buggy', buggy, { speed: 5 }); world.vehicle('salt.buggy', buggy, { speed: 5 }); }, /two vehicles share this id/u);
});

// MSZ4: what check refuses of a dock (a build refuses it too): inside a rock, off the ground, a leave point in its own hull.
test('a dock inside a rock, off the ground, or with a leave point inside its hull is refused', () => {
  const rock = (part: THREE.Group): void => { const stone = solid(new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), paint)); stone.position.set(-10, 2, 150); part.add(stone); };
  const place = (y: number) => (world: ShardWorld): void => { world.vehicle('salt.buggy', buggy, { speed: 20 }); const node = yard(world); node.position.y = y; world.dock('yard.buggy', node, { kind: 'salt.buggy' }); };
  expect(() => lowered((world) => { world.part('rock', rock); place(0)(world); })).toThrow(/dock yard\.buggy stands inside the solid/u);
  expect(() => lowered(place(3))).toThrow(/dock yard\.buggy stands 3\.00 m off the ground/u);
  const cramped = (part: THREE.Group): void => { buggy(part); part.add(empty('leave.driver', -0.5, 0, 0.3)); };
  expect(() => lowered((world) => { world.vehicle('salt.buggy', cramped, { speed: 20 }); world.dock('yard.buggy', yard(world), { kind: 'salt.buggy' }); })).toThrow(/driver leave point is inside its hull/u);
  expect(() => lowered(place(0))).not.toThrow();
});
