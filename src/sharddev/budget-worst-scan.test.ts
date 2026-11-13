import { expect, test } from 'vitest';
import { nearbyContentCost, worstContentCost, worstContentCostSteps } from '@wildshard/format/budget';
import { emptyShardfile } from './author';
import { textureLibrarySource } from '@wildshard/format/deviceMemoryCost';
import type { Shardfile } from '@wildshard/format/shardSchema';

const MB = 1_000_000;

/** a shard with `count` deterministic L0 / L1 tiles of varied sizes across its cell */
function shard(count: number, seed: number) {
  const source = emptyShardfile({ slug: `worst-${String(seed)}`, name: 'Worst', author: 'Test', revision: 1, seed });
  let state = seed;
  const next = (): number => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
  source.tiles = Array.from({ length: count }, () => {
    const x = Math.floor(-250 + next() * 400), z = Math.floor(-250 + next() * 400), w = Math.floor(10 + next() * 90);
    return { lod: next() < 0.8 ? 0 : 1, x: 0, z: 0, bounds: { min: [x, 0, z], max: [x + w, 10, z + w] }, geometricError: 0, files: [],
      compressed: 0, decoded: Math.floor(next() * 20 * MB), gpu: Math.floor(next() * 30 * MB), triangles: 0, draws: 0 };
  });
  source.budgets.library.resident = Math.floor(next() * 90 * MB);
  return source;
}

test('the worst-disc scan finds the highest location cost on its grid (O14 precomputed scan)', () => {
  for (const [count, seed] of [[0, 1], [12, 2], [48, 3]] as const) {
    const source = shard(count, seed), worst = worstContentCost(source, 3 * MB);
    let best = 0;
    for (let x = -280; x <= 280; x += 5) for (let z = -280; z <= 280; z += 5) best = Math.max(best, nearbyContentCost(source, x, z, 3 * MB).playing);
    expect(worst.playing).toBe(best);
    const [x, z] = worst.location;
    expect(nearbyContentCost(source, x, z, 3 * MB).playing).toBe(worst.playing);
  }
});

test('the worst-disc scan in steps pauses between rows and finds the same location', () => {
  const source = shard(48, 7), steps = worstContentCostSteps(source, 2 * MB);
  let pauses = 0, step = steps.next();
  while (step.done !== true) { pauses++; step = steps.next(); }
  expect(pauses).toBeGreaterThan(1);
  expect(worstContentCost(source, 2 * MB)).toEqual(step.value);
});

test.each([-1e-10, 0, 1e-10])('worst-disc intervals preserve tangent draw bounds (%s)', epsilon => {
  const source = shard(0, 20);
  const radius = 150 + Math.SQRT2 * 2.5;
  source.tiles = [
    { x: radius + epsilon, z: -30, size: 0.25, cost: 70 * MB },
    { x: -radius + epsilon, z: 30, size: 4.75, cost: 90 * MB },
    { x: -800, z: -800, size: 2, cost: 800 * MB },
  ].map(({ x, z, size, cost }) => ({ lod: 0, x: 0, z: 0,
    bounds: { min: [-250, 0, -250], max: [250, 10, 250] },
    drawBounds: { min: [x, 0, z], max: [x + size, 10, z + size] },
    geometricError: 0, files: [], compressed: 0, decoded: cost, gpu: 0, triangles: 0, draws: 0 }));
  const worst = worstContentCost(source), [wx, wz] = worst.location;
  let best = 0;
  for (let x = -280; x <= 280; x += 5) for (let z = -280; z <= 280; z += 5) best = Math.max(best, nearbyContentCost(source, x, z).playing);
  expect(worst.playing).toBe(best);
  expect(nearbyContentCost(source, wx, wz)).toEqual(worst);
});

test('a tile whose files the library holds is charged once, in the library', () => {
  const file = (hash: string, decoded: number, gpu: number): Shardfile['files'][number] => ({ hash, kind: 'glb', compressed: 1, decoded, gpu, triangles: 0, draws: 0, dependencies: [], critical: false });
  const tile = (files: string[], decoded: number, gpu: number): Shardfile['tiles'][number] => ({ lod: 0, x: 4, z: 4, bounds: { min: [0, 0, 0], max: [62.5, 10, 62.5] }, geometricError: 0,
    files, compressed: 1, decoded, gpu, triangles: 0, draws: 0 });
  const make = (library: string[], declared = 1) => {
    const source = emptyShardfile({ slug: 'library-tiles', name: 'Library tiles', author: 'Test', revision: 1, seed: 9 });
    source.files = [file('a'.repeat(64), 40 * MB, 60 * MB), file('b'.repeat(64), 5 * MB, 5 * MB)];
    source.tiles = [tile(['a'.repeat(64)], 40 * MB * declared, 60 * MB * declared), tile(['b'.repeat(64)], 5 * MB, 5 * MB)];
    source.library = library; source.budgets.library.resident = library.length === 0 ? 0 : 100 * MB;
    return source;
  };
  const streamed = nearbyContentCost(make([]), 30, 30), held = nearbyContentCost(make(['a'.repeat(64)]), 30, 30);
  // the library's 100 MB replaces the tile's own 100 MB: nothing is counted twice; the other tile still counts
  expect(held.accounted).toBe(streamed.accounted);
  // anywhere in the cell, holding the tile's files in the library costs what declaring that tile empty does
  expect(worstContentCost(make(['a'.repeat(64)])).playing).toBe(worstContentCost(make(['a'.repeat(64)], 0)).playing);
});

test('a library KTX2 file is charged its upload only: its decoded mips are dropped once uploaded (D122)', () => {
  const source = emptyShardfile({ slug: 'ktx2-library', name: 'KTX2 library', author: 'Test', revision: 1, seed: 11 });
  source.files = [{ hash: 'c'.repeat(64), kind: 'ktx2', compressed: 1, decoded: 10 * MB, gpu: 5 * MB, triangles: 0, draws: 0, dependencies: [], critical: false },
    { hash: 'd'.repeat(64), kind: 'glb', compressed: 1, decoded: 7 * MB, gpu: 3 * MB, triangles: 0, draws: 0, dependencies: [], critical: false }];
  source.library = ['c'.repeat(64), 'd'.repeat(64)]; source.budgets.library.resident = 25 * MB;
  // no transcode support: only the decoded copy goes, the GPU bound stays the RGBA fallback; a GLB keeps both
  expect(textureLibrarySource(source, new Map()).budgets.library.resident).toBe(15 * MB);
});
