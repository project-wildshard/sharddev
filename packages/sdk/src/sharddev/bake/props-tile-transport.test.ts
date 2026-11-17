import { expect, test } from 'vitest';
import { BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, MeshStandardMaterial } from 'three';
import { glbBuffers, prepareGlbBuffers } from '@wildshard/format/glbBuffers';
import { hashImmutableBytes } from '../immutable';
import { parseGlb } from '../assets';
import { bakeProps } from './props';

function views(bytes: Uint8Array): Uint8Array[] {
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(12, true);
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected GLB object');
  const decoded = glbBuffers(value as Record<string, unknown>, bytes.subarray(28 + length));
  return decoded.views.map(view => {
    const offset = view['byteOffset'] ?? 0, size = view['byteLength'];
    if (typeof offset !== 'number' || typeof size !== 'number') throw new Error('Expected GLB view range');
    return decoded.bytes.slice(offset, offset + size);
  });
}

test('opt-in tile transport preserves every view and publishes actual hashes and costs', async () => {
  await prepareGlbBuffers();
  const geometry = new BufferGeometry(), material = new MeshStandardMaterial();
  const positions = Float32Array.from({ length: 9_000 }, (_, i) => [0, 0, 0, 1, 0, 0, 0, 0, 1][i % 9] ?? 0);
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(Float32Array.from({ length: 9_000 }, (_, i) => i % 3 === 1 ? 1 : 0), 3));
  const source = { static: new Group(), whole: [{ id: 'native', mesh: new Mesh(geometry, material), transform: new Matrix4(), nativeAttributes: true as const }] };
  try {
    const original = bakeProps(source), packed = bakeProps({ ...source, tileCompression: 'meshopt' });
    const before = original.tiles[0], after = packed.tiles[0];
    if (before === undefined || after === undefined) throw new Error('Expected occupied tile');
    const oldHash = before.files[0], newHash = after.files[0];
    const oldBytes = oldHash === undefined ? undefined : original.assets.get(oldHash), newBytes = newHash === undefined ? undefined : packed.assets.get(newHash);
    if (oldBytes === undefined || newBytes === undefined) throw new Error('Missing tile bytes');
    expect(newBytes.length).toBeLessThan(oldBytes.length);
    expect(views(newBytes)).toEqual(views(oldBytes));
    expect(newHash).toBe(hashImmutableBytes(newBytes));
    const cost = parseGlb(newBytes);
    expect(after).toMatchObject({ compressed: newBytes.length, ...cost });
    expect(packed.files.find(row => row.hash === newHash)).toMatchObject({ compressed: newBytes.length, ...cost });
    expect(after.triangles).toBe(before.triangles); expect(after.draws).toBe(before.draws);
    expect(packed.library).toEqual(original.library);
    expect(geometry.getAttribute('position').array).toBe(positions);
  } finally { geometry.dispose(); material.dispose(); }
});
