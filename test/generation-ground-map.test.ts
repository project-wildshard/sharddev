// oxlint-disable-next-line import/no-nodejs-modules -- Only resolve the actual author module for its one-chunk boundary proof.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { build } from 'vite';
import { rasterGroundMap } from '../src/sharddev/bake/groundMap';
import { hashImmutableBytes } from '../src/sdk/immutable';
import { templateTerrain } from '../src/shards/_template/generators/terrain';
import { templatePropRows } from '../src/shards/_template/generators/props';
import { pastelTerrain } from '../src/shards/pastel-plain/generators/terrain';
import { pastelProps } from '../src/shards/pastel-plain/generators/props';
import { bakeProps, type BakedProps } from '../src/sharddev/bake/props';
import { assertConfigBoundary } from '../src/sharddev/configBoundary';
import templateSettings from '../src/shards/_template/data/map.json' with { type: 'json' };
import pastelSettings from '../src/shards/pastel-plain/data/map.json' with { type: 'json' };

// Captured with the unchanged legacy MapRaster + stylizeMap, not rasterGroundMap.
// Each digest covers all 4,000,000 RGBA bytes; no pixel sampling or second reference repaint.
async function compare(terrain: ReturnType<typeof templateTerrain>, props: BakedProps, settings: { style: { kind: string } & Record<string, unknown> }, original: string): Promise<void> {
  const actual = await rasterGroundMap(terrain, props, settings.style);
  expect(actual.triangles).toBe(143742);
  expect(actual.pixels.byteLength).toBe(4_000_000);
  expect(hashImmutableBytes(actual.pixels)).toBe(original);
}

test('source-only Template and Pastel ground maps preserve every original RGBA pixel and triangle', async () => {
  await compare(templateTerrain(), templatePropRows(), templateSettings, '4a68dc808e545f44774647e865ed518dca767a9b5bb05e5c1bc6789eede9f19d');
  const fixture = pastelProps(20);
  try { await compare(pastelTerrain(), bakeProps(fixture.source), pastelSettings, '337e2ebb91e28ebd9b3c6edff18009ee844c7496a88005af0cbdb718ef9fc798'); }
  finally { fixture.dispose(); }
});

test('the pure ground map baker fits the unchanged author config import boundary', async () => {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: resolve('src/sharddev/bake/groundMap.ts'), formats: ['es'], fileName: 'map' }, rolldownOptions: { external: [/^node:/u], output: { codeSplitting: false } } } });
  const built = Array.isArray(result) ? result[0] : result;
  if (built === undefined || !('output' in built)) throw new Error('Missing ground map bundle');
  const chunks = built.output.filter(row => row.type === 'chunk'); expect(chunks).toHaveLength(1);
  const chunk = chunks[0]; if (chunk === undefined) throw new Error('Missing ground map chunk');
  expect(() => assertConfigBoundary([...chunk.imports, ...chunk.dynamicImports])).not.toThrow();
});
