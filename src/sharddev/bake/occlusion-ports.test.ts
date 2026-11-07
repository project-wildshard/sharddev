import { BoxGeometry, BufferAttribute, Color, InterleavedBuffer, InterleavedBufferAttribute } from 'three';
import { expect, expectTypeOf, test } from 'vitest';
import { aoTint, encodeVoxelAOBake, hemisphere, recordVoxelAO, voxelAO, voxelAOBakeStats } from '@wildshard/engine/world/voxelAO';
import { bakeOcclusionDirections, bakeOcclusionTint, bakeVoxelOcclusion, withFacetedAO } from './facetedGeometry';

test('offline rays and all three native sampling modes retain complete contracts and Float64 bits', () => {
  expectTypeOf<typeof bakeVoxelOcclusion>().toEqualTypeOf<typeof voxelAO>();
  expectTypeOf<typeof bakeOcclusionDirections>().toEqualTypeOf<typeof hemisphere>();
  expectTypeOf<typeof bakeOcclusionTint>().toEqualTypeOf<typeof aoTint>();
  const rings = [[0.95, 1], [0.72, 5], [0.38, 8]] as const;
  const hemi = bakeOcclusionDirections(rings, 1.7);
  expect(hemi).toEqual(hemisphere(rings, 1.7));
  for (const sample of ['face', 'weld', 'vertex'] as const) {
    const source = new BoxGeometry(), geometry = sample === 'vertex' ? source : source.toNonIndexed();
    const positions = geometry.getAttribute('position').array.slice();
    const calls: number[][] = [];
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (box === null) throw new Error('Missing original box');
    const parameters: Parameters<typeof voxelAO>[1] = { box,
      cell: 0.2, pad: 2, spacing: 0.7, maxSamples: 20, indexed: sample === 'vertex', ground: { columns: (x, z) => { calls.push([x, z]); return -0.5; } },
      sample, offset: 1.1, hemi, steps: 6, stepLen: 0.2, falloff: 0.5, strength: 0.62, downDark: 0.18 };
    try {
      const native = voxelAO(geometry, parameters), nativeCalls = calls.splice(0);
      const author = bakeVoxelOcclusion(geometry, parameters);
      expect(new Uint8Array(author.buffer)).toEqual(new Uint8Array(native.buffer));
      expect(calls).toEqual(nativeCalls);
      expect(author).not.toBe(native);
      expect(geometry.getAttribute('position').array).toEqual(positions);
      const recorder = recordVoxelAO();
      let table: Uint8Array;
      try { bakeVoxelOcclusion(geometry, parameters); table = encodeVoxelAOBake(recorder.entries); }
      finally { recorder.stop(); }
      const before = voxelAOBakeStats().hits;
      expect(withFacetedAO(table, () => bakeVoxelOcclusion(geometry, parameters))).toEqual(native);
      expect(voxelAOBakeStats().hits).toBe(before + 1);
    } finally { if (geometry !== source) geometry.dispose(); source.dispose(); }
  }
});

test('offline tint preserves packed/interleaved native bits, alpha, skipped samples and update state', () => {
  for (const interleaved of [false, true]) {
    const values = Float32Array.from([0.2, 0.4, 0.8, 0.7, 0.9, 0.6, 0.3, 0.5]);
    const attribute = (array: Float32Array) => interleaved ? new InterleavedBufferAttribute(new InterleavedBuffer(array, 4), 4, 0) : new BufferAttribute(array, 4);
    const original = attribute(values.slice()), author = attribute(values.slice()), amounts = Float64Array.from([0.65, Number.NaN]);
    const tint = new Color('#4a4466');
    aoTint(original, amounts, tint, 0.55); bakeOcclusionTint(author, amounts, tint, 0.55);
    expect(new Uint8Array(author.array.buffer)).toEqual(new Uint8Array(original.array.buffer));
    expect(author.getW(0)).toBe(values[3]); expect(author.getW(1)).toBe(values[7]);
    expect(author.getX(1)).toBe(values[4]);
    expect(author instanceof InterleavedBufferAttribute ? author.data.version : author.version).toBe(1);
  }
});
