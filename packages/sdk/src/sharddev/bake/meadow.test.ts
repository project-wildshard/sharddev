import { expect, test } from 'vitest';
import { build } from 'vite';
// oxlint-disable-next-line import/no-nodejs-modules -- Inspect the author's real production bundle.
import { resolve } from 'node:path';
import { GrassField, type GrassFieldPorts } from '@wildshard/engine/game/systems/looks/grassField';
import { selectedLevel } from '@wildshard/engine/level/selection';
import { bakeMeadowField } from './meadow';
import { assertConfigBoundary } from '../configBoundary';

const source: GrassFieldPorts = { seed: 77, half: 16, heightAt: (x, z) => 3 + x / 32 + z / 64,
  normalAt: () => [0, 1, 0], splatAt: () => [.6, .1, .2, .1], trailDistance: x => Math.abs(x),
  cabinMask: x => x < 0 ? .25 : 0, pondMask: (_x, z) => z < -12 ? 1 : 0, waterLevel: () => -20,
  paint: (x, z, _y, _s, out) => { out[0] = (x + 16) / 32; out[1] = (z + 16) / 32; out[2] = .3; return true; }, layout: null };

test('native meadow snapshots preserve complete predecessor bytes and original query laws', () => {
  const before = selectedLevel(), plain = bakeMeadowField(source), next = bakeMeadowField(source);
  expect(plain.resolution).toBe(9); expect(plain.values.byteLength).toBe(2592);
  expect(next.values).toEqual(plain.values); expect(next.values).not.toBe(plain.values);
  const authored: GrassFieldPorts = { ...source, layout: { short: [{ x: 0, z: 0, r: 3, h: .2 }], tall: [{ x: 5, z: 5, r: 4, h: 1.2 }],
    bare: [{ x: 2, z: -2, r: 1, h: 0 }], valley: .65, plateau: .8, riverZ: (x: number) => x / 16, riverHalf: () => 2 } };
  for (const input of [source, authored]) {
    const expected = new GrassField(input), made = bakeMeadowField(input);
    for (const x of [-Infinity, -20, -16, -15.5, -3.9, 0, .25, 2, 3.9, 14.5, 15.5, 16, 20, Infinity, Number.NaN])
      for (const z of [-16, -2, 0, 5.5, 16]) {
        for (let ch = 0; ch < 8; ch++) expect(made.sample(x, z, ch)).toBe(expected.sample(x, z, ch));
        for (const td of [undefined, 0, 1.6, 1.95, 3.4, 3.9, 4.25, 5.7, Infinity]) for (const exact of [false, true])
          expect(made.baseHeightAt(x, z, td, exact)).toBe(expected.baseHeightAt(x, z, td, exact));
      }
    for (const height of [0, .2, .7, 1.2]) for (const td of [0, 1.6, 1.95, 3.4, 3.9, 4.25, 5.7, Infinity])
      expect(made.trailGrass(height, td)).toBe(expected.trailGrass(height, td));
  }
  const sample = plain.sample(0, 0, 1); plain.values.fill(-1);
  expect(plain.sample(0, 0, 1)).toBe(sample); expect(next.values).not.toEqual(plain.values);
  expect(selectedLevel()).toBe(before);
  for (const half of [0, -1, 250.01, Infinity, Number.NaN]) expect(() => bakeMeadowField({ ...source, half })).toThrow('Native meadow');
  for (const seed of [.5, Infinity, Number.NaN]) expect(() => bakeMeadowField({ ...source, seed })).toThrow('Native meadow');
});

test('native meadow authoring bundles as one config-safe chunk without Node services', async () => {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: resolve('src/sharddev/bake/meadow.ts'), formats: ['es'] },
    rolldownOptions: { external: [/^node:/u], output: { codeSplitting: false } } } });
  const built = Array.isArray(result) ? result[0] : result;
  if (built === undefined || !('output' in built)) throw new Error('Missing meadow author bundle');
  const chunks = built.output.filter(row => row.type === 'chunk'); expect(chunks).toHaveLength(1);
  const chunk = chunks[0]; if (chunk === undefined) throw new Error('Missing meadow author chunk');
  expect([...chunk.imports, ...chunk.dynamicImports]).toEqual([]);
  expect(() => assertConfigBoundary([...chunk.imports, ...chunk.dynamicImports])).not.toThrow();
});
