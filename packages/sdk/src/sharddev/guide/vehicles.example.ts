// MIRROR-SALT-ZONE MSZ5: GUIDE.md's Vehicles snippet, byte for byte below this line (guide-vehicles.test.ts).
import * as THREE from 'three';
import { solid, type ShardWorld } from '@wildshard/sdk/scene/author';

const red = new THREE.MeshStandardMaterial({ color: '#b5402a' });

/** Built about its own origin, its base at y 0, facing -z. */
function buggy(part: THREE.Group): void {
  const tub = solid(new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 3.4), red));
  tub.position.set(0, 0.75, 0);
  part.add(tub);
  const driver = new THREE.Object3D();
  driver.name = 'seat.driver';
  driver.position.set(-0.45, 0.9, 0.3);
  const passenger = new THREE.Object3D();
  passenger.name = 'seat.passenger';
  passenger.position.set(0.45, 0.9, 0.3);
  part.add(driver, passenger);
}

export function build(world: ShardWorld): void {
  world.vehicle('salt.buggy', buggy, { speed: 22, reverse: 6, accel: 9, grip: 0.8, labels: { drive: 'Drive the buggy' } });
  const yard = new THREE.Object3D();
  yard.position.set(-6, 0, 20);
  world.scene.add(yard);
  world.dock('yard.buggy', yard, { kind: 'salt.buggy' });
}
