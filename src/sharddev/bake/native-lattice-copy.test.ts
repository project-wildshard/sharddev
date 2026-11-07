import { expect, it } from 'vitest';
import { sliceNativeLattice, type NativeLatticeSource } from './nativeLattice';

function source(): NativeLatticeSource {
  const positions = new Float32Array(256 ** 2 * 3);
  positions.set([1, 0, 0], 3); positions.set([0, 0, 1], 257 * 3);
  return { resolution: 256, positions, indices: Uint32Array.from([0, 1, 257]), attributes: { gain: { itemSize: 1, values: new Float32Array(256 ** 2) } } };
}

it('retains per-corner subarray and iterator order while copying every yielded channel', () => {
  for (const Type of [Float32Array, Float64Array]) {
    const input = source(), events: string[] = [];
    input.positions = Type.from(input.positions);
    const gain = input.attributes['gain'];
    if (gain === undefined) throw new Error('Missing test channel');
    gain.values = new Type(256 ** 2);
    const subarray = gain.values.subarray.bind(gain.values);
    Object.defineProperty(gain.values, 'subarray', { value: (begin: number, end: number): Float32Array | Float64Array => {
      events.push(`subarray:${begin}:${end}`);
      const view = subarray(begin, end), iterate = view[Symbol.iterator].bind(view);
      Object.defineProperty(view, Symbol.iterator, { *value(): Generator<number> {
        for (const value of iterate()) { events.push(`value:${value}`); yield value + 1; }
      } });
      return view;
    } });
    const tiles = sliceNativeLattice(input, 0), filled = tiles.filter(tile => tile.indices.length > 0);
    expect(events).toEqual(['subarray:0:1', 'value:0', 'subarray:1:2', 'value:0', 'subarray:257:258', 'value:0']);
    expect(tiles).toHaveLength(64); expect(filled).toHaveLength(1);
    expect(filled[0]?.positions).toEqual(Float64Array.from([0, 0, 0, 1, 0, 0, 0, 0, 1]));
    expect(filled[0]?.attributes['gain']?.values).toEqual(Float64Array.from([1, 1, 1]));
    expect(filled[0]?.indices).toEqual(Uint32Array.from([0, 1, 2]));
  }
});

it('retains complete native shape and finite channel admission before copying', () => {
  const input = source(); input.positions[0] = Number.NaN;
  expect(() => sliceNativeLattice(input, 0)).toThrow('outside finite cell bounds');
  input.positions[0] = 0;
  const gain = input.attributes['gain']; if (gain === undefined) throw new Error('Missing test channel');
  gain.values[0] = Infinity;
  expect(() => sliceNativeLattice(input, 1)).toThrow('Invalid native lattice attribute gain');
  gain.values[0] = 0;
  expect(() => sliceNativeLattice({ ...input, indices: Uint32Array.from([0, 1, 256 ** 2]) }, 0)).toThrow('bounded original');
});

it('retains signed-zero identity when coincident native vertices share a tile', () => {
  const input = source();
  input.positions.set([0, -0, 0], 2 * 3);
  input.positions.set([1, 0, 0], 3 * 3);
  input.positions.set([0, 0, 1], 258 * 3);
  input.indices = Uint32Array.from([0, 1, 257, 2, 3, 258]);
  for (const lod of [0, 1] as const) {
    const filled = sliceNativeLattice(input, lod).filter(tile => tile.indices.length > 0);
    expect(filled).toHaveLength(1);
    expect(filled[0]?.positions).toEqual(Float64Array.from([0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -0, 0]));
    expect(filled[0]?.indices).toEqual(Uint32Array.from([0, 1, 2, 3, 1, 2]));
    expect(Object.is(filled[0]?.bounds.min[1], -0)).toBe(true);
  }
});

it('keeps adversarial collision rows and later duplicates in original order', () => {
  const input = source(), gains = [0, 50332051, 100666730, 16781053, 201328348, 251664495, 33555238, 218105161, 134225064, 184557115, 234887666, 151001861, 1946162020, 1996494071, 167776334, 1962938833, 268560208, 318896355];
  const channel = input.attributes['gain']; if (channel === undefined) throw new Error('Missing test channel');
  channel.values = new Float64Array(256 ** 2);
  const indices: number[] = [], expectedPositions: number[] = [], expectedGains: number[] = [];
  for (const [z, gain] of gains.entries()) {
    const at = z * 3, positions = [0, 0, z, 1, 0, z, 0, 0, z + .25];
    input.positions.set(positions, at * 3); channel.values[at] = gain;
    indices.push(at, at + 1, at + 2); expectedPositions.push(...positions); expectedGains.push(gain, 0, 0);
  }
  input.indices = Uint32Array.from([...indices, 0, 1, 2]);
  for (const lod of [0, 1] as const) {
    const filled = sliceNativeLattice(input, lod).filter(tile => tile.indices.length > 0);
    expect(filled).toHaveLength(1);
    expect(filled[0]?.positions).toEqual(Float64Array.from(expectedPositions));
    expect(filled[0]?.attributes['gain']?.values).toEqual(Float64Array.from(expectedGains));
    expect(filled[0]?.indices).toEqual(input.indices);
  }
});

it('keeps the original string relation if a JavaScript iterator yields nonnumeric values', () => {
  const input = source(), channel = input.attributes['gain'];
  if (channel === undefined) throw new Error('Missing test channel');
  input.indices = Uint32Array.from([0, 1, 257, 0, 1, 257]);
  const subarray = channel.values.subarray.bind(channel.values); let reads = 0;
  Object.defineProperty(channel.values, 'subarray', { value: (begin: number, end: number): Float32Array | Float64Array => {
    const view = subarray(begin, end);
    Object.defineProperty(view, Symbol.iterator, { *value(): Generator<number | string> { yield reads++ % 2 === 0 ? 0 : '0'; } });
    return view;
  } });
  const filled = sliceNativeLattice(input, 0).filter(tile => tile.indices.length > 0);
  expect(reads).toBe(6);
  expect(filled).toHaveLength(1);
  expect(filled[0]?.positions).toEqual(Float64Array.from([0, 0, 0, 1, 0, 0, 0, 0, 1]));
  expect(filled[0]?.attributes['gain']?.values).toEqual(Float64Array.from([0, 0, 0]));
  expect(filled[0]?.indices).toEqual(Uint32Array.from([0, 1, 2, 0, 1, 2]));
});
