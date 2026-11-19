import * as THREE from 'three';
import { solid, type ShardWorld } from '@wildshard/sdk/scene/author';

// MIRROR-SALT-ZONE MSZ5: the GUIDE's vehicles, built. A kind is built about its own origin, its base at y 0, facing -z;
// `seat.*` empties are where riders sit, `leave.*` where they step off, and its `solid()` meshes are its hull.
const salt = new THREE.MeshStandardMaterial({ color: '#e8e2d4', roughness: 0.95 });
const red = new THREE.MeshStandardMaterial({ color: '#b5402a', roughness: 0.6 });
const teal = new THREE.MeshStandardMaterial({ color: '#2f8f8a', roughness: 0.7, side: THREE.DoubleSide });
const wood = new THREE.MeshStandardMaterial({ color: '#7a5634', roughness: 0.9 });
const tyre = new THREE.MeshStandardMaterial({ color: '#1d1d1d', roughness: 1 });

/** An empty node: where a rider sits or steps off. */
function mark(name: string, x: number, y: number, z: number): THREE.Object3D {
  const node = new THREE.Object3D(); node.name = name; node.position.set(x, y, z); return node;
}

/** The salt buggy: a red tub on four wheels, a driver on the left and a passenger on the right. */
export function buggy(part: THREE.Group): void {
  const tub = solid(new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 3.4), red)); tub.position.set(0, 0.75, 0); part.add(tub);
  for (const [x, z] of [[-1, -1.2], [1, -1.2], [-1, 1.2], [1, 1.2]] as const) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16), tyre); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.4, z); part.add(wheel);
  }
  part.add(mark('seat.driver', -0.45, 0.9, 0.3), mark('seat.passenger', 0.45, 0.9, 0.3));
}

/** The land-sail: a long deck on runners, one teal sail, one rider standing at the tiller. */
export function landSail(part: THREE.Group): void {
  const deck = solid(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 3.6), wood)); deck.position.set(0, 0.7, 0); part.add(deck);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 5, 8), wood); mast.position.set(0, 3.2, -0.6); part.add(mast);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.6), teal); sail.position.set(0, 3.4, 0.2); sail.rotation.y = Math.PI / 2; part.add(sail);
  part.add(mark('seat.driver', 0, 0.83, 1.2), mark('leave.driver', 1.6, 0, 1.2));
}

/** A flat of salt with a buggy dock (each player their own) and a land-sail dock (one for everyone). */
export function buildVehicles(world: ShardWorld): void {
  world.ground(() => 0, { material: salt });
  world.vehicle('salt.buggy', buggy, { speed: 22, reverse: 6, accel: 9, brake: 18, turn: 1.6, grip: 0.8, drift: 0.4, mass: 600,
    labels: { drive: 'Drive the buggy', ride: 'Ride in the buggy', leave: 'Get out' } });
  world.vehicle('salt.land-sail', landSail, { speed: 14, reverse: 0, accel: 4, grip: 0.95, drift: 0.2, boost: 1.6, mass: 250, pose: 'stand',
    wind: { toward: [0.8, 0.6], push: 4 }, labels: { drive: 'Board the land-sail', leave: 'Leave the land-sail' } });
  const yard = new THREE.Object3D(); yard.position.set(-6, 0, 20); world.scene.add(yard);
  const line = new THREE.Object3D(); line.position.set(6, 0, 20); line.rotation.y = 0.2; world.scene.add(line);
  world.dock('yard.buggy', yard, { kind: 'salt.buggy' });
  world.dock('line.sail', line, { kind: 'salt.land-sail', per: 'shared', respawn: 30 });
  world.spawn(0, 1, 30, 0);
}
