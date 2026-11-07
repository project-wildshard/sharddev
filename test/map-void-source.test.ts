import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';
import { expect, test } from 'vitest';
import { clientSceneGlb } from '../src/sharddev/bake/glb';
import { rasterSceneMap } from '../src/sharddev/bake/groundMap';
import { rasterDataMap } from '../scripts/bake-data-maps.mjs';
import { hashImmutableBytes } from '../src/sdk/immutable';

test('source void palette retains every raster byte of the original painter', async () => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([-20, 4, -20, -20, 4, 20, 20, 4, -20, 20, 65, 20, -20, 65, 20, 20, 65, -20], 3));
  const material = new MeshStandardMaterial({ color: '#79944f' });
  try {
    const mesh = new Mesh(geometry, material); mesh.name = 'floor';
    const group = new Group(); group.add(mesh);
    expect(() => clientSceneGlb(group, new Map([[material, 'floor']]))).toThrow('unique loader-safe part names');
    group.name = 'floor-map';
    const bytes = clientSceneGlb(group, new Map([[material, 'floor']])).glb;
    const read = (file: string): Uint8Array => { if (file !== 'floor.glb') throw new Error('Undeclared map input'); return bytes; };
    const readers = { input: read, bytes: read, json: (): never => { throw new Error('No JSON input'); } };
    const settings = { style: { kind: 'void', void: 'transparent', stone: ['#7d7466', '#a0937a', '#c2b08c'], stoneBands: [40, 60], grass: '#79a84f', rim: '#1a1526' },
      painter: { version: 1, glbs: ['floor.glb'] } };
    const original = await rasterDataMap(settings, readers), source = await rasterSceneMap(settings, readers);
    expect(source.triangles).toBe(original.raster.triangles);
    expect(hashImmutableBytes(source.pixels)).toBe(hashImmutableBytes(original.pixels));
    expect(source.pixels).toEqual(new Uint8Array(original.pixels));
    await expect(rasterSceneMap({ ...settings, style: { ...settings.style, stone: ['#000000'] } }, readers)).rejects.toThrow('one more stone colour');
    await expect(rasterSceneMap(settings, { ...readers, input: () => { throw new Error('Undeclared map input'); } })).rejects.toThrow('Undeclared map input');
  } finally { geometry.dispose(); material.dispose(); }
});
