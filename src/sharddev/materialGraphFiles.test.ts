import { expect, test } from 'vitest';
import { lowerMaterialGraphs } from './materialGraphFiles';
import { encodeCanonicalJson, hashImmutableBytes } from './immutable';

const texture = 'a'.repeat(64);
const graph = (colour: number): Record<string, unknown> => ({ version: 1, kind: 'material', nodes: { c: { op: 'constant', value: colour } },
  params: { map: { type: 'texture', value: texture }, lent: { type: 'texture', role: 'lent' } }, stages: { surface: { colour: 'c' } } });

test('inline graphs become shared content-addressed files of the closure, charged to the library budget', () => {
  const declaration = { look: { materials: { a: { family: 'graph', graph: graph(1) }, b: { family: 'graph', graph: graph(1) }, c: { family: 'graph', graph: graph(2) },
    d: { family: 'toon' } } }, files: [{ hash: texture, kind: 'ktx2' }], library: [texture],
    budgets: { library: { resident: 10, compressed: 5 }, sim: { resident: 0, compressed: 0 } } };
  const { declaration: lowered, assets } = lowerMaterialGraphs(declaration);
  const one = new TextEncoder().encode(encodeCanonicalJson(graph(1))), two = new TextEncoder().encode(encodeCanonicalJson(graph(2)));
  const first = hashImmutableBytes(one), second = hashImmutableBytes(two);
  expect(lowered).toMatchObject({ look: { materials: { a: { family: 'graph', file: first }, b: { family: 'graph', file: first }, c: { family: 'graph', file: second }, d: { family: 'toon' } } },
    library: [texture, first, second], budgets: { library: { compressed: 5 + one.length + two.length } } });
  expect([...assets.keys()]).toEqual([first, second]);
  // the file row names the graph's own texture, never its lent one
  expect(lowered).toMatchObject({ files: [{ hash: texture }, { hash: first, kind: 'json', compressed: one.length, dependencies: [texture], critical: false }, { hash: second }] });
  expect(declaration.look.materials.a).toEqual({ family: 'graph', graph: graph(1) });
});

test('a declaration without inline graphs is returned as it is', () => {
  const declaration = { look: { materials: { d: { family: 'toon' } } }, files: [], library: [] };
  expect(lowerMaterialGraphs(declaration).declaration).toBe(declaration);
  expect(lowerMaterialGraphs(undefined).assets.size).toBe(0);
});
