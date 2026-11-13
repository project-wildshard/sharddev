import { Scene, Group, Mesh, BoxGeometry, MeshStandardMaterial } from 'three';
import { BoxCollider } from '@wildshard/sdk/physics';
import { PlayerStart } from '@wildshard/sdk/spawns';
import { Entry } from '@wildshard/sdk/entries';
import { readScene } from '@wildshard/sdk/scene';
import { restoreSceneGraph } from '@wildshard/sdk/sceneGraph';

/** Template 1's named floor, collision, player start and four midpoint entries. */
export function sceneExample() {
  const scene = new Scene(), hall = new Group(); hall.name = 'template.hall';
  const floor = new Mesh(new BoxGeometry(8, 1, 12), new MeshStandardMaterial());
  floor.name = 'template.floor'; floor.position.y = -0.5;
  const collider = new BoxCollider(8, 1, 12, 'stone');
  collider.name = 'template.floor.collider'; collider.position.copy(floor.position);
  const player = new PlayerStart(); player.name = 'template.start'; player.position.set(0, 2, 0);
  hall.add(floor, collider); scene.add(hall, player, ...Entry.midpoints());
  try {
    const data = readScene(scene);
    const restored = restoreSceneGraph(data);
    return { data, restored: readScene(restored) };
  } finally { floor.geometry.dispose(); floor.material.dispose(); }
}
