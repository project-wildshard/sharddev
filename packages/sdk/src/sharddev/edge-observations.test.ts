import { expect, it } from 'vitest';
import { emptyShardfile } from '@wildshard/sdk/author';
import { edgeObservationsOf, withEdgeObservations } from './edgeObservations';

const base = emptyShardfile({ slug: 'edge-test', name: 'Edge', author: 'Test', revision: 1, seed: 3 });
const manifest = (ground: { structures: true } | undefined, level?: number) =>
  ({ ...(ground === undefined ? {} : { ground }), minimap: level === undefined ? {} : { openWater: { level, deepDepth: 6 } } }) as never;
const sides = (row: object) => ({ north: row, east: row, south: row, west: row });

it('observes void for structures with no terrain, ground otherwise, and open water at 0 m or above (the engine rule)', () => {
  expect(edgeObservationsOf({ manifest: manifest({ structures: true }), terrain: null })).toEqual(sides({ geometry: 'void' }));
  expect(edgeObservationsOf({ manifest: manifest({ structures: true }), terrain: base.terrain ?? ({} as never) })).toEqual(sides({ geometry: 'ground' }));
  expect(edgeObservationsOf({ manifest: undefined, terrain: null })).toEqual(sides({ geometry: 'ground' }));
  expect(edgeObservationsOf({ manifest: manifest(undefined, 0), terrain: null })).toEqual(sides({ geometry: 'ground', waterSurface: 0 }));
  expect(edgeObservationsOf({ manifest: manifest(undefined, -2), terrain: null })).toEqual(sides({ geometry: 'ground' }));
});

it('keeps observations a product already declares', () => {
  const declared = sides({ geometry: 'void' }) as never;
  expect(withEdgeObservations({ manifest: undefined, terrain: null, edgeObservations: declared }).edgeObservations).toBe(declared);
  expect(withEdgeObservations({ manifest: undefined, terrain: null }).edgeObservations).toEqual(sides({ geometry: 'ground' }));
});
