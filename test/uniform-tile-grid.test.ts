import { BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial } from 'three';
import { expect, test } from 'vitest';
import { bake } from '../src/sharddev/bake';
import { bakeProps } from '../src/sharddev/bake/props';
import { bakeAuthoredWorld } from '../src/sharddev/bake/authoredWorld';
import { staticGlb } from '../src/sharddev/bake/glb';
import { emptyShardfile } from '@wildshard/engine/host/author';

test('scene emitter adds 64 metadata squares without changing any occupied payload or props row', () => {
  const scene = new Group(), geometry = new BoxGeometry(2, 2, 2), material = new MeshStandardMaterial(), box = new Mesh(geometry, material);
  box.position.set(-220, 1, -220); scene.add(box); scene.updateMatrixWorld(true);
  try {
    const previous = bakeProps({ static: scene }), result = bake(scene, { slug: 'uniform-fixture' });
    expect(result.shardfile.tiles.filter(row => row.lod === 0)).toHaveLength(64);
    expect(result.shardfile.tiles.filter(row => row.files.length > 0)).toEqual(previous.tiles);
    expect(result.props?.props.tiles).toEqual(previous.props.tiles);
    expect([...result.assets]).toEqual([...previous.assets]);
    expect(result.shardfile.files).toEqual(previous.files.slice().sort((a, b) => a.hash.localeCompare(b.hash)));
  } finally { geometry.dispose(); material.dispose(); }
});

test('authored GLB emitter declares vacant L0 squares while models remain sparse and replacement refuses', async () => {
  const floor = new BoxGeometry(500, 1, 500), detail = new BoxGeometry(2, 2, 2), material = new MeshStandardMaterial(), detailMaterial = material.clone();
  material.name = 'Ground'; detailMaterial.name = 'Detail';
  try {
    const bytes = staticGlb([{ geometry: floor, material, name: 'collide_floor', transform: new Matrix4().makeTranslation(0, -0.5, 0) },
      { geometry: detail, material: detailMaterial, name: 'detail', transform: new Matrix4().makeTranslation(-220, 1, -220) }]);
    const source = { ...emptyShardfile({ slug: 'authored-grid', name: 'Authored grid', author: 'Test', seed: 1, revision: 1 }),
      world: { glb: 'world.glb', colliders: 'nodes:collide_', materials: { Ground: 'pbr', Detail: 'pbr' } } };
    const result = await bakeAuthoredWorld(source, bytes), fine = result.shard.tiles.filter(row => row.lod === 0);
    expect(fine).toHaveLength(64);
    expect(fine.filter(row => row.files.length === 0)).toHaveLength(63);
    expect(result.shard.props?.tiles.filter(row => row.lod === 0)).toHaveLength(1);
    for (const row of fine) for (const hash of row.files) expect(result.assets.has(hash)).toBe(true);
    await expect(bakeAuthoredWorld({ ...source, tiles: result.shard.tiles }, bytes)).rejects.toThrow('cannot replace compiled tiles');
  } finally { floor.dispose(); detail.dispose(); material.dispose(); detailMaterial.dispose(); }
});
