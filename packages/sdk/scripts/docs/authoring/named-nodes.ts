import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { clientSceneGlb, staticGlb } from '@wildshard/sdk/bake/glb';

/** Export separately addressable tower/flame nodes without merging their geometry or changing material identity. */
export function namedNodesExample() {
  const tower = new BoxGeometry(1, 4, 1), flame = new BoxGeometry(0.3, 0.5, 0.3);
  const stone = new MeshStandardMaterial({ color: 0x888888 }), fire = new MeshStandardMaterial({ color: 0xff7700 });
  try {
    return staticGlb([
      { name: 'beacon-tower', geometry: tower, material: stone },
      { name: 'beacon-flame', geometry: flame, material: fire },
    ], 'beacon');
  } finally { tower.dispose(); flame.dispose(); stone.dispose(); fire.dispose(); }
}

/** Bake the existing V1 scene declaration beside exact local geometry; the client lends the original material. */
export function namedSceneExample() {
  const root = new Group(), paint = new MeshStandardMaterial(), geometry = new BoxGeometry(1, 2, 1), mesh = new Mesh(geometry, paint);
  root.name = 'beacon'; mesh.name = 'tower'; root.add(mesh);
  try { return clientSceneGlb(root, new Map([[paint, 'stone']])); }
  finally { geometry.dispose(); paint.dispose(); }
}
