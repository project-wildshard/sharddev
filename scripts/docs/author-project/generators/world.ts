import { Scene, Mesh, BufferGeometry, BoxGeometry, MeshStandardMaterial, type Object3D } from 'three';
import { Entry } from '@wildshard/sdk/entries';
import { PlayerStart } from '@wildshard/sdk/spawns';
import { staticGlb } from '@wildshard/sdk/bake/glb';

/** A readable author graph: a level floor, an actual start and four ordinary midpoint entries. */
export function buildWorld(): Scene {
  const scene = new Scene(); scene.name = 'outpost';
  const material = new MeshStandardMaterial({ color: '#b8ac92', roughness: 1 }); material.name = 'Floor';
  const floor = new Mesh(new BoxGeometry(500, 1, 500), material);
  floor.name = 'floor'; floor.position.y = -0.5; floor.receiveShadow = true;
  const start = new PlayerStart(); start.name = 'start'; start.position.set(0, 2, 0);
  scene.add(floor, start, ...Entry.midpoints());
  return scene;
}

function isFloor(object: Object3D | undefined): object is Mesh<BufferGeometry, MeshStandardMaterial> {
  return object instanceof Mesh && object.geometry instanceof BufferGeometry && object.material instanceof MeshStandardMaterial;
}

/** Retained TypeScript emits the GLB consumed by the official world baker; output is reproducible, never hand-edited. */
export function worldBytes(scene: Scene): Uint8Array {
  const floor = scene.getObjectByName('floor');
  if (!isFloor(floor)) throw new Error('Missing authored floor');
  scene.updateMatrixWorld(true);
  const geometry = new BufferGeometry().copy(floor.geometry).applyMatrix4(floor.matrixWorld);
  try { return staticGlb([{ geometry, material: floor.material, castShadow: floor.castShadow }], floor.name); }
  finally { geometry.dispose(); }
}

/** Release only this generator's owned floor geometry/material after inspection or generation. */
export function disposeWorld(scene: Scene): void {
  const floor = scene.getObjectByName('floor');
  if (isFloor(floor)) { floor.geometry.dispose(); floor.material.dispose(); }
}
