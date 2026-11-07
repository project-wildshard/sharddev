import { expect, test } from 'vitest';
import { parse } from 'valibot';
import { TreeSetSchema } from '@wildshard/format/treeSetRows';
import { treeSetRows } from './forest';

const input = {
  product: 'orchard', set: 'orchard-trees', tintBark: true,
  geometry: { url: 'models/trees.glb', parts: ['apple__trunk', 'apple__hi'], channels: [{ name: 'wind', source: '_WIND', width: 1, parts: ['apple__hi'] }] },
  looks: { kind: 'graphs', bark: 'bark', needles: 'leaves', twigs: 'twigs', far: 'far', anisotropy: { cards: 4, far: 2 } },
  model: { id: 'orchard/tree', name: 'Apple', file: 'trees.ts' },
  variants: [{ name: 'apple', label: 'Apple', species: 'apple', height: 6, trunk: 0.2, collider: 1 }],
};
const paint = { rim: 0.2, bands: 0.8, sway: 0.001 };
const painted = { ...input, looks: { kind: 'painterly', bark: paint, needles: paint, twigs: paint, far: paint } };

test.each([input, painted])('author tree sets retain every defining field', row => {
  expect(treeSetRows(row)).toEqual(parse(TreeSetSchema, row));
});

test('author tree sets retain empty roster, vector, material and callback refusals', () => {
  for (const row of [{ ...input, variants: [] }, { ...input, build: () => undefined },
    { ...input, geometry: { ...input.geometry, channels: [{ name: 'wind', source: '_WIND', width: 5 }] } },
    { ...input, looks: { ...input.looks, anisotropy: { cards: 64, far: 2 } } },
    { ...painted, looks: { ...painted.looks, bark: { ...paint, sway: -1 } } }]) {
    expect(() => parse(TreeSetSchema, row)).toThrow();
    expect(() => treeSetRows(row)).toThrow();
  }
});
