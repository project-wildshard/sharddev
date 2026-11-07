import { expect, test } from 'vitest';
import * as v from 'valibot';
import { TreeSetSchema } from '@wildshard/format/treeSetRows';
import { TREE_SET } from '../src/shards/pine-hollow/generators/treeSet';
import { TREE_SET as SPRUCE } from '../src/shards/nalati-grasslands/generators/treeSet';

/** An unrelated orchard's set: two apple trees and a pear in its own pool, graphs and asset folder. */
const orchard = {
  product: 'orchard', set: 'orchard-trees',
  geometry: { url: '/assets/orchard/baked/trees.glb', parts: ['apple-a__trunk', 'apple-a__hi'], channels: [{ name: 'aWindWeight', source: '_wind_weight', width: 1 }] },
  looks: { kind: 'graphs', bark: 'orchard-bark', needles: 'orchard-leaves', twigs: 'orchard-twigs', far: 'orchard-far', anisotropy: { cards: 4, far: 2 } }, tintBark: true,
  model: { id: 'orchard/tree', name: 'Orchard tree', file: 'src/shards/orchard/trees.ts' },
  variants: [{ name: 'apple-a', label: 'Apple A', species: 'apple', height: 6, trunk: 0.2, collider: 1 },
    { name: 'apple-b', label: 'Apple B', species: 'apple', height: 5, trunk: 0.18, collider: 1 }, { name: 'pear', label: 'Pear', species: 'pear', height: 7, trunk: 0.22, collider: 1 }],
};
const paint = { rim: 0.2, bands: 0.8, sway: 0.001 };
/** The same orchard painted: vertex colours on four painterly surfaces, no atlases. */
const painted = { ...orchard, looks: { kind: 'painterly', bark: paint, needles: paint, twigs: paint, far: paint } };

test('tree set rows admit an unrelated orchard, graph or painterly, and both shipped sets', () => {
  expect(v.parse(TreeSetSchema, orchard).variants.map(row => row.species)).toEqual(['apple', 'apple', 'pear']);
  expect(v.parse(TreeSetSchema, painted).looks.kind).toBe('painterly');
  expect(v.parse(TreeSetSchema, structuredClone(TREE_SET)).variants).toHaveLength(14);
  const spruce = v.parse(TreeSetSchema, structuredClone(SPRUCE));
  expect(spruce.looks.kind).toBe('painterly');
  expect(spruce.geometry.parts).toHaveLength(spruce.variants.length * 5);
  for (const row of spruce.variants) for (const part of ['trunk', 'hi', 'lo', 'twigs', 'far']) expect(spruce.geometry.parts).toContain(`${row.name}__${part}`);
});

test('tree set rows refuse a factory callback, no variants, an unbounded anisotropy and atlases on painted trees', () => {
  expect(v.safeParse(TreeSetSchema, { ...orchard, build: () => undefined }).success).toBe(false);
  expect(v.safeParse(TreeSetSchema, { ...orchard, variants: [] }).success).toBe(false);
  expect(v.safeParse(TreeSetSchema, { ...orchard, looks: { ...orchard.looks, anisotropy: { cards: 64, far: 2 } } }).success).toBe(false);
  expect(v.safeParse(TreeSetSchema, { ...painted, looks: { ...painted.looks, anisotropy: { cards: 4, far: 2 } } }).success).toBe(false);
  expect(v.safeParse(TreeSetSchema, { ...painted, looks: { ...painted.looks, bark: { ...paint, sway: -1 } } }).success).toBe(false);
});
