import { expect, test } from 'vitest';
import { emptyShardfile } from '../author';
import { parseMovers } from '@wildshard/format/movers';
import { parseShardfile, shardfileRules } from '@wildshard/format/shardSchema';

// A valid primitive alone never grants the pure data client a joint restore owner.
test('pure data chains refuse before a native restore owner is installed', () => {
  const base = emptyShardfile({ slug: 'chain-fixture', name: 'Chain', author: 'Test', seed: 1, revision: 1 });
  const module = '1371d8959aebb567404fc8db59592b0d63f7afeb7060f0b74ea4f12389e6bafd';
  const rot = { x: 0, y: 0, z: 0, w: 1 };
  const movers = parseMovers([{ id: 'chain', entity: 1, module, kind: 'chain',
    at: { x: 0, y: 0, z: 0 }, euler: { x: 0, y: 0, z: 0 }, enabled: true, boxes: [], input: [],
    chain: { hx: 1, hy: 0.1, mass: 1, segments: [
      { x: 0, y: 0, z: 0, rot, hz: 1 }, { x: 0, y: 0, z: 2, rot, hz: 1 },
    ] } }]);
  const source = { ...base, movers, sim: { ...base.sim, scripts: [module] }, critical: [module],
    files: [{ hash: module, kind: 'wasm' as const, compressed: 1297, decoded: 1297,
      gpu: 0, triangles: 0, draws: 0, dependencies: [], critical: true }] };
  expect(shardfileRules(source)).toContain('compiled mover chains require native joint restore support');
  expect(() => parseShardfile(source)).toThrow('shardfile semantic rules');
});
