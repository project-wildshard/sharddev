import { expect, test } from 'vitest';
import { BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, MeshStandardMaterial } from 'three';
import { glbMaterialNames } from '@wildshard/format/propMaterials';
import { bakeProps } from './props';

function bin(bytes: Uint8Array): Uint8Array {
  const jsonLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(12, true);
  return bytes.subarray(28 + jsonLength);
}

test('whole surface names override merged names without changing any binary channel or source material', () => {
  const geometry = new BufferGeometry(), material = new MeshStandardMaterial();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  geometry.computeVertexNormals(); material.name = 'source';
  const mesh = new Mesh(geometry, material), whole = { id: 'shape', mesh, transform: new Matrix4() };
  try {
    const original = bakeProps({ static: new Group(), whole: [whole] });
    const named = bakeProps({ static: new Group(), materialName: 'merged', whole: [{ ...whole, materialName: 'paint' }] });
    for (const [index, row] of named.files.entries()) {
      const before = original.files[index], bytes = named.assets.get(row.hash);
      const oldBytes = before === undefined ? undefined : original.assets.get(before.hash);
      if (bytes === undefined || oldBytes === undefined) throw new Error('Expected tile bytes');
      expect(glbMaterialNames(oldBytes)).toEqual(['']);
      expect(glbMaterialNames(bytes)).toEqual(['paint']);
      expect(bin(bytes)).toEqual(bin(oldBytes));
    }
    const unnamedMerged = bakeProps({ static: mesh }), merged = bakeProps({ static: mesh, materialName: 'merged' });
    // The triangle lies on z=0: clipping retains one draw on each touching
    // square at both LODs. Each tile has its own GLB name, plus the far proxy.
    expect(merged.tiles.map(row => [row.lod, row.x, row.z])).toEqual([[0, 4, 3], [0, 4, 4], [1, 2, 1], [1, 2, 2]]);
    expect(merged.tiles.map(row => [row.lod, row.x, row.z, row.triangles, row.draws]))
      .toEqual(unnamedMerged.tiles.map(row => [row.lod, row.x, row.z, row.triangles, row.draws]));
    expect(merged.files.map(row => row.hash)).toEqual([...merged.tiles.flatMap(row => row.files), merged.props.far]);
    expect(merged.assets.size).toBe(5);
    for (const [index, row] of merged.files.entries()) {
      const before = unnamedMerged.files[index], bytes = merged.assets.get(row.hash);
      const oldBytes = before === undefined ? undefined : unnamedMerged.assets.get(before.hash);
      if (bytes === undefined || oldBytes === undefined) throw new Error('Expected merged tile or far bytes');
      expect(glbMaterialNames(oldBytes)).toEqual(['']);
      expect(glbMaterialNames(bytes)).toEqual(['merged']);
      expect(bin(bytes)).toEqual(bin(oldBytes));
    }
    expect(material.name).toBe('source');
  } finally { geometry.dispose(); material.dispose(); }
});
