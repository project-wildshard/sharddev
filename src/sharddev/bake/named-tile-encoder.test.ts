import { BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, MeshStandardMaterial } from 'three';
import { expect, test } from 'vitest';
import { glbBuffers, prepareGlbBuffers } from '@wildshard/format/glbBuffers';
import { hashImmutableBytes } from '../immutable';
import { parseGlb } from '../assets';
import { bakeProps } from './props';
import { compressGlb } from './glbCompression';

function views(bytes: Uint8Array): Uint8Array[] {
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(12, true);
  const input: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new Error('Missing GLB document');
  const decoded = glbBuffers(input as Record<string, unknown>, bytes.subarray(28 + length));
  return decoded.views.map(view => {
    const offset = view['byteOffset'] ?? 0, size = view['byteLength'];
    if (typeof offset !== 'number' || typeof size !== 'number') throw new Error('Missing buffer view bounds');
    return decoded.bytes.slice(offset, offset + size);
  });
}

test('named tile encoding precedes identity and all costs, preserves exact channels and owns encoder output', async () => {
  await prepareGlbBuffers();
  const geometry = new BufferGeometry(), material = new MeshStandardMaterial();
  geometry.setAttribute('position', new BufferAttribute(Float32Array.from({ length: 9000 }, (_, i) => [0, 0, 0, 1, 0, 0, 0, 0, 1][i % 9] ?? 0), 3));
  geometry.setAttribute('normal', new BufferAttribute(Float32Array.from({ length: 9000 }, (_, i) => i % 3 === 1 ? 1 : 0), 3));
  const whole = [-100, -20].map((x, index) => ({ id: `owned-${index}`, mesh: new Mesh(geometry, material),
    transform: new Matrix4().makeTranslation(x, 0, 10), nativeAttributes: true as const }));
  try {
    const source = { static: new Group(), whole, models: [{ id: 'library', model: new Mesh(geometry, material) }] }, before = bakeProps(source), seen: string[] = [];
    let borrowed: Uint8Array | undefined;
    const after = bakeProps({ ...source, encodeTileBlob(name, bytes) {
      seen.push(name);
      if (name !== 'props.0.2.4') return bytes;
      // Exercise the compiler with changed bytes independently of delivery selection:
      // an artificial repeated triangle can legitimately gzip better unencoded.
      borrowed = compressGlb(bytes); return borrowed;
    } });
    expect(seen).toEqual(['props.0.2.4', 'props.0.3.4']);
    const oldTile = before.tiles.find(tile => tile.x === 2 && tile.z === 4), newTile = after.tiles.find(tile => tile.x === 2 && tile.z === 4);
    const oldHash = oldTile?.files[0], newHash = newTile?.files[0];
    const oldBytes = oldHash === undefined ? undefined : before.assets.get(oldHash), bytes = newHash === undefined ? undefined : after.assets.get(newHash);
    if (oldTile === undefined || newTile === undefined || oldBytes === undefined || bytes === undefined) throw new Error('Missing encoded tile');
    expect(bytes.length).toBeLessThan(oldBytes.length);
    expect(views(bytes)).toEqual(views(oldBytes));
    expect(newTile.bounds).toEqual(oldTile.bounds);
    expect(newTile.files).toEqual([hashImmutableBytes(bytes)]);
    expect(after.files.find(row => row.hash === newHash)).toEqual({ hash: newHash, kind: 'glb', compressed: bytes.length,
      ...parseGlb(bytes), dependencies: [], critical: false });
    expect(newTile).toEqual({ ...oldTile, ...parseGlb(bytes), compressed: bytes.length, files: [newHash] });
    expect(after.tiles.find(tile => tile.x === 3 && tile.z === 4)).toEqual(before.tiles.find(tile => tile.x === 3 && tile.z === 4));
    if (borrowed === undefined) throw new Error('Missing borrowed encoder output');
    borrowed.fill(0); expect(hashImmutableBytes(bytes)).toBe(newHash);
  } finally { geometry.dispose(); material.dispose(); }
});
