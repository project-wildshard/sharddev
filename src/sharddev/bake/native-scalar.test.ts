import { expect, test } from 'vitest';
import { zlibSync } from 'fflate';
import { build } from 'vite';
// oxlint-disable-next-line import/no-nodejs-modules -- Inspect the actual author bundle.
import { resolve } from 'node:path';
import { readScalarLattice } from '@wildshard/engine/world/scalarChannel';
import { selectedLevel } from '@wildshard/engine/level/selection';
import { readNativeScalarField } from './terrain';
import { assertConfigBoundary } from '../configBoundary';
// oxlint-disable-next-line import/no-nodejs-modules -- Exercise the unchanged confined authoring resolver.
import { execFileSync } from 'node:child_process';

const values = new Float32Array([-0, 1, 2, 3, 4, 5, 6, 7, 8]);
const bytes = new Uint8Array(values.buffer), compressed = zlibSync(bytes);
const rows = { res: 3, size: 12, values: { type: 'f32', count: 9, data: { file: 'fields/native.bin' } } };
const blocks = new Map([['fields/native.bin', compressed]]);

test('native scalar intake owns all original f32 bytes and exact clamped query results', () => {
  const before = selectedLevel(), input = structuredClone(rows), original = Uint8Array.from(compressed);
  const made = readNativeScalarField(input, blocks), next = readNativeScalarField(input, blocks);
  const predecessor = readScalarLattice(input, blocks);
  expect(made.resolution).toBe(3); expect(made.size).toBe(12);
  expect(new Uint8Array(made.values.buffer, made.values.byteOffset, made.values.byteLength)).toEqual(bytes);
  expect(Object.is(made.values[0], -0)).toBe(true); expect(next.values).not.toBe(made.values);
  for (const x of [-Infinity, -100, -6, -5.99, -3, 0, .25, 3, 5.99, 6, 100, Infinity, Number.NaN])
    for (const z of [-100, -6, -1.5, 0, 2.25, 6, 100, Number.NaN]) expect(made.sample(x, z)).toBe(predecessor(x, z));
  made.values[4] = -2; expect(made.sample(0, 0)).toBe(-2); expect(next.sample(0, 0)).toBe(4);
  expect(input).toEqual(rows); expect(compressed).toEqual(original); expect(selectedLevel()).toBe(before);
});

test('native scalar intake retains count, missing-block, finite, type and path refusals', () => {
  expect(() => readNativeScalarField(rows, new Map())).toThrow('Missing scalar block');
  expect(() => readNativeScalarField({ ...rows, values: { ...rows.values, data: 'AAAAAAAA' } }, blocks))
    .toThrow('declared block');
  for (const input of [
    { ...rows, res: 1 }, { ...rows, res: 2049 }, { ...rows, size: Infinity },
    { ...rows, values: { ...rows.values, count: 8 } }, { ...rows, values: { ...rows.values, type: 'f64' } },
    { ...rows, values: { ...rows.values, data: { file: '../escaped.bin' } } },
  ]) expect(() => readNativeScalarField(input, blocks)).toThrow();
  for (const array of [new Float32Array([0, 1]), new Float32Array([...values, 9]), new Float32Array([...values.slice(0, 8), Number.NaN]),
    new Float32Array([...values.slice(0, 8), Infinity])]) {
    expect(() => readNativeScalarField(rows, new Map([['fields/native.bin', zlibSync(new Uint8Array(array.buffer))]]))).toThrow();
  }
  expect(() => readNativeScalarField(rows, new Map([['fields/native.bin', compressed.subarray(0, 4)]]))).toThrow();
});

test('the complete terrain author graph resolves under the unchanged source-only loader', () => {
  execFileSync(process.execPath, ['--experimental-transform-types', '--import', './src/sharddev/bake/source-loader.mjs',
    '--input-type=module', '--eval', `
      import assert from 'node:assert/strict';
      import { zlibSync } from 'fflate';
      import { readNativeScalarField } from '@wildshard/sharddev/bake/terrain';
      import { parseInteractionRows } from '@wildshard/sharddev/interactions';
      import { templateTerrain } from './src/shards/_template/generators/terrain.ts';
      const raw = new Float32Array([-0,1,2,3]);
      const rows={res:2,size:500,values:{type:'f32',count:4,data:{file:'scalar.bin'}}};
      const made=readNativeScalarField(rows,new Map([['scalar.bin',zlibSync(new Uint8Array(raw.buffer))]]));
      assert.equal(typeof templateTerrain,'function');
      assert.equal(typeof parseInteractionRows,'function');
      assert.equal(Object.is(made.values[0],-0),true);assert.equal(made.sample(0,0),1.5);
    `, 'src/shards/_template/generators/terrain.ts']);
});

test('the terrain author module keeps one config-safe chunk with scalar intake included', async () => {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: resolve('src/sharddev/bake/terrain.ts'), formats: ['es'] },
    rolldownOptions: { external: [/^node:/u], output: { codeSplitting: false } } } });
  const built = Array.isArray(result) ? result[0] : result;
  if (built === undefined || !('output' in built)) throw new Error('Missing terrain author bundle');
  const chunks = built.output.filter(row => row.type === 'chunk'); expect(chunks).toHaveLength(1);
  for (const chunk of chunks) expect(() => assertConfigBoundary([...chunk.imports, ...chunk.dynamicImports])).not.toThrow();
});
