import { expect, expectTypeOf, test } from 'vitest';
import { sampleCreatureGroup as nativeGroup, selectCreatureSites as nativeSites,
  type CreatureGroupSpec as NativeSpec } from '@wildshard/engine/game/plugin/brain';
import { Rng as NativeRng } from '@wildshard/engine/core/rng';
import { Rng } from '../random';
import { sampleCreatureGroup, selectCreatureSites, type CreatureGroupSpec } from './creaturePlacement';

const ground = { heightAt: (x: number, z: number): number => x - z / 2 };

test('author group contracts and all ordered sampling/continuation bytes equal the native sampler', () => {
  expectTypeOf<CreatureGroupSpec>().toEqualTypeOf<NativeSpec>();
  const points = Array.from({ length: 16 }, (_, i) => ({ x: i - 8, z: i / 3 }));
  const sources: CreatureGroupSpec['source'][] = [
    { kind: 'indexed', points },
    { kind: 'radial', centre: { x: 3, z: -2 }, radius: [1, 7] },
    { kind: 'radial', centre: { x: -3, z: 2 }, radius: [0, 7], radiusLaw: 'area', bearing: 'compass', axes: [0.4, 2], firstAtCentre: true },
    { kind: 'radial', centre: { x: 3, z: -2 }, radius: [1, 7], attempts: 4, fallback: 'centre' },
  ];
  for (const seed of [0, -1, 0x5ea1]) for (const source of sources) for (const count of [0, 4, 16]) {
    const before = new NativeRng(seed), after = new Rng(seed);
    const row: CreatureGroupSpec = { kind: 'boar', count, herd: 3, variant: null, firstVariant: 'lead', source,
      accept: { bound: 12, clear: [{ x: 0, z: 0, r: 1 }], minHeight: -3 } };
    expect(sampleCreatureGroup(row, after, ground)).toEqual(nativeGroup(row, before, ground));
    expect(after.snapshot()).toEqual(before.snapshot());
    expect(after.next()).toBe(before.next());
  }
});

test('facing, fixed yaw, explicit variants, rejection and fallback retain the native draw order', () => {
  for (const fallback of ['skip', 'centre'] as const) for (const facing of ['face', 'yaw', 'random'] as const) {
    const a = new Rng(0xc0), b = new NativeRng(0xc0);
    const row: CreatureGroupSpec = { kind: 'crab', count: 3, herd: -1, variant: null, variants: ['one', null, 'three'],
      ...(facing === 'face' ? { face: { x: 12, z: -4 } } : facing === 'yaw' ? { yaw: -0 } : {}),
      source: { kind: 'radial', centre: { x: 0, z: 0 }, radius: [1, 3], attempts: 3, fallback },
      accept: { band: { x: 0, z: 0, min: 10, max: 12 } } };
    expect(sampleCreatureGroup(row, a)).toEqual(nativeGroup(row, b));
    expect(a.snapshot()).toEqual(b.snapshot());
  }
});

test('all bounded invalid group sources refuse before consuming the injected stream', () => {
  const base: CreatureGroupSpec = { kind: 'crab', count: 1, herd: 0, variant: null,
    source: { kind: 'radial', centre: { x: 0, z: 0 }, radius: [0, 1] } };
  const rows: CreatureGroupSpec[] = [
    { ...base, count: 17 }, { ...base, count: 1.5 }, { ...base, herd: -2 }, { ...base, kind: '' },
    { ...base, yaw: Number.NaN }, { ...base, yaw: 0, face: { x: 0, z: 0 } },
    { ...base, source: { kind: 'indexed', points: [] } },
    { ...base, source: { kind: 'radial', centre: { x: 0, z: 0 }, radius: [0, 1], attempts: 41 } },
    { ...base, source: { kind: 'radial', centre: { x: 0, z: 0 }, radius: [1, 2], radiusLaw: 'area' } },
    { ...base, accept: { minHeight: 0 } },
  ];
  for (const row of rows) {
    const a = new Rng(1), b = new NativeRng(1);
    expect(() => sampleCreatureGroup(row, a)).toThrow(); expect(() => nativeGroup(row, b)).toThrow();
    expect(a.snapshot()).toEqual(b.snapshot()); expect(a.next()).toBe(new Rng(1).next());
  }
});

test('site ranking preserves borrowed identity, callback order, ties, distance gates and greedy spacing', () => {
  const sites = [{ position: { x: -5, z: 0 } }, { position: { x: 2, z: 0 } },
    { position: { x: 2.1, z: 0 } }, { position: { x: 5, z: 0 } }, { position: { x: 20, z: 0 } }];
  const a: unknown[] = [], b: unknown[] = [];
  const options = { count: 3, origin: { x: 0, z: 0 }, minDistance: 1, maxDistance: 9, separation: 1 };
  const actual = selectCreatureSites(sites, options, (site, i, d) => { a.push([site, i, d]); return i === 0 ? null : 7; });
  const original = nativeSites(sites, options, (site, i, d) => { b.push([site, i, d]); return i === 0 ? null : 7; });
  expect(actual).toEqual(original); expect(a).toEqual(b);
  for (const row of actual) expect(row.site).toBe(sites[row.index]);
  for (const [points, option] of [[[{ x: 0, z: 0 }], { count: 17 }],
    [[{ x: Infinity, z: 0 }], { count: 1 }], [Array.from({ length: 1025 }, () => ({ x: 0, z: 0 })), { count: 1 }]] as const) {
    expect(() => selectCreatureSites(points, option, () => 0)).toThrow();
    expect(() => nativeSites(points, option, () => 0)).toThrow();
  }
  expect(() => selectCreatureSites([{ x: 0, z: 0 }], { count: 1 }, () => Number.NaN)).toThrow('Invalid creature site score');
  expect(() => nativeSites([{ x: 0, z: 0 }], { count: 1 }, () => Number.NaN)).toThrow('Invalid creature site score');
});
