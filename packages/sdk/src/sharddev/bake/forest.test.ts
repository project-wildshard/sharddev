import { expect, test } from 'vitest';
import { build } from 'vite';
// oxlint-disable-next-line import/no-nodejs-modules -- Inspect the author module's real production bundle.
import { resolve } from 'node:path';
import { bakeForestPlacements } from './forest';
import { buildTerrain } from '@wildshard/engine/world/terrainField';
import { selectedLevel } from '@wildshard/engine/level/selection';
import { assertConfigBoundary } from '../configBoundary';
import { isJsonData } from '@wildshard/format/json';

const source = {
  ...buildTerrain(77, { landscape: () => 0, trails: [], cabinSites: [] }), seed: 77, treeCount: 12,
  forest: { spacing: 13, densityFreq: .03, clearings: [-.7, .2] as [number, number], maxSlope: .8,
    tintHue: .25, tintHueJitter: [-.01, .02] as [number, number], tintSat: [.4, .7] as [number, number],
    tintLight: [.5, .8] as [number, number], largeVariantChance: .2 },
};
const variants = Array.from({ length: 4 }, (_, i) => ({ trunkRadius: .2 + i * .1, height: 5 + i }));

test('owned forest data preserves the complete predecessor and its spatial query identities', () => {
  const before = selectedLevel(), made = bakeForestPlacements(source, variants);
  const text = JSON.stringify(made.trees);
  expect(made.trees).toHaveLength(12); expect(isJsonData(made.trees)).toBe(true);
  const first = made.trees[0]; if (first === undefined) throw new Error('Missing predecessor tree');
  expect(made.nearby(first.x, first.z)).toContain(first);
  const next = bakeForestPlacements(source, variants), other = next.trees[0];
  if (other === undefined) throw new Error('Missing independent tree');
  expect(next.trees).toEqual(made.trees); expect(other).not.toBe(first); expect(other.tint).not.toBe(first.tint);
  Reflect.set(first, 'x', first.x + 1); Reflect.set(first.tint, '0', -1);
  expect(JSON.stringify(next.trees)).toBe(text); expect(selectedLevel()).toBe(before);
  expect(bakeForestPlacements({ ...source, treeCount: 0 }, variants).trees).toEqual([]);
  const { forest: _forest, ...empty } = source;
  expect(bakeForestPlacements(empty, variants).trees).toEqual([]);
});

test('the forest author module is one config-safe chunk without Node service imports', async () => {
  const built = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: resolve('src/sharddev/bake/forest.ts'), formats: ['es'] },
    rolldownOptions: { external: [/^node:/u], output: { codeSplitting: false } } } });
  const output = Array.isArray(built) ? built[0] : built;
  if (output === undefined || !('output' in output)) throw new Error('Missing forest author bundle');
  const chunks = output.output.filter(row => row.type === 'chunk'); expect(chunks).toHaveLength(1);
  const chunk = chunks[0]; if (chunk === undefined) throw new Error('Missing forest author chunk');
  expect([...chunk.imports, ...chunk.dynamicImports]).toEqual([]);
  expect(() => assertConfigBoundary([...chunk.imports, ...chunk.dynamicImports])).not.toThrow();
});
