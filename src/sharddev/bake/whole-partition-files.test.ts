import { expect, test } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, MeshStandardMaterial } from 'three';
import { staticGlb } from './glb';
import { wholePartitionFiles } from './wholePartition';

function fixture() {
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1], 3));
  const material = new MeshStandardMaterial();
  const packet = (ids: readonly string[]) => staticGlb(ids.map((id, index) => ({ geometry, material, name: `part_${String(index)}`,
    extras: { wholePartition: { id, vertices: [0, 1, 2], triangles: [0], vertexCount: 3, indexCount: 0, index: 'none' } } })));
  try { return new Map([['unrelated', packet(['far'])], ['first', packet(['fern', 'shared'])], ['last', packet(['shared'])], ['reeds', packet(['reeds'])]]); }
  finally { geometry.dispose(); material.dispose(); }
}

test('keeps source order and closes every co-located partition without changing bytes', () => {
  const files = fixture(), before = new Map([...files].map(([id, bytes]) => [id, bytes.slice()]));
  expect(wholePartitionFiles([...files.keys()], id => {
    const bytes = files.get(id); if (bytes === undefined) throw new Error('Missing original packet'); return bytes;
  }, ['fern', 'reeds'])).toEqual(['first', 'last', 'reeds']);
  expect(files).toEqual(before);
});

test('a missing required shape refuses instead of falling back to every source', () => {
  const files = fixture();
  expect(() => wholePartitionFiles([...files.keys()], id => files.get(id) ?? new Uint8Array(), ['missing'])).toThrow('Missing whole source shape: missing');
});

test.each(['short', 'length', 'json'] as const)('refuses %s metadata before publishing a partial selection', mode => {
  const files = fixture(), original = files.get('first'); if (original === undefined) throw new Error('Missing original packet');
  const bytes = original.slice(), view = new DataView(bytes.buffer);
  if (mode === 'length') view.setUint32(8, bytes.length + 4, true);
  if (mode === 'json') view.setUint32(12, 2_000_004, true);
  expect(() => wholePartitionFiles(['first'], () => mode === 'short' ? bytes.subarray(0, 8) : bytes, ['fern'])).toThrow(/Whole source GLB wire cap|Invalid whole source GLB header/u);
});
