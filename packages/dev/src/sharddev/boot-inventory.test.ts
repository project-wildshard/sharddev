// oxlint-disable-next-line import/no-nodejs-modules -- Inspect the author's real production bundle.
import { resolve } from 'node:path';
import { build } from 'vite';
import { expect, test } from 'vitest';
import { filePolicy } from '@wildshard/engine/boot/filePolicy';
import { CLOUD_FIELD_URL } from '@wildshard/engine/boot/bakedApi';
import { RAPIER_WASM_URL } from '@wildshard/engine/physics/wasmUrl';
import { assertConfigBoundary } from '../../../sdk/src/sharddev/configBoundary';
import { bakedBootTextureSource, bootFilePolicy, sharedBootPhysics, sharedBootTextures, type BootInventory } from './bootInventory';

test('native bake texture sources retain their owned namespace and reject path injection', () => {
  const first = bakedBootTextureSource('driftwood-isle');
  expect(first).toEqual({ publicPrefix: '/assets/baked/driftwood-isle/tex/' });
  Reflect.set(first, 'publicPrefix', 'changed');
  expect(bakedBootTextureSource('driftwood-isle')).toEqual({ publicPrefix: '/assets/baked/driftwood-isle/tex/' });
  expect(bakedBootTextureSource('driftwood-isle')).not.toBe(first);
  for (const owner of ['', '..', 'a/b', 'a?b', 'a#b', 'A', 'a'.repeat(65)]) expect(() => bakedBootTextureSource(owner)).toThrow('owner');
});

test('shared boot physics preserves native identity and gives each author independent storage', () => {
  const first = sharedBootPhysics(), second = sharedBootPhysics();
  expect(first).toEqual([RAPIER_WASM_URL]);
  expect(second).not.toBe(first);
  Reflect.set(first, 0, 'changed');
  expect(second).toEqual([RAPIER_WASM_URL]);
  expect(sharedBootPhysics()).toEqual(second);
});

test('explicit boot inventory keeps original phone fallbacks and GPU precedence', () => {
  const inventory: BootInventory = { '/fixture/model.phone.glb': true, '/fixture/paint.phone.webp': 24 };
  const table = {
    phone: { '/fixture/paint.phone.webp': '/fixture/phone-01234567.ktx2' },
    desktop: { '/fixture/paint.webp': '/fixture/desktop-01234567.ktx2' },
  };
  for (const tier of ['phone', 'desktop'] as const) for (const mode of ['img', 'ktx2'] as const) {
    const original = filePolicy(tier, mode, table, inventory), author = bootFilePolicy(tier, mode, table, inventory);
    for (const path of ['/fixture/model.glb', '/fixture/paint.webp', '/fixture/absent.png', '/fixture/rows.bin']) {
      expect(author.phone(path)).toBe(original.phone(path));
      expect(author.gpu(path)).toBe(original.gpu(path));
    }
  }
});

test('boot authoring refuses an omitted inventory instead of borrowing the page', () => {
  expect(() => { Reflect.apply(bootFilePolicy, undefined, ['phone', 'img', { phone: {}, desktop: {} }, undefined]); })
    .toThrow('Boot authoring requires an explicit inventory');
  expect(sharedBootTextures({})).toEqual([]);
  expect(sharedBootTextures({ [CLOUD_FIELD_URL]: true })).toEqual([CLOUD_FIELD_URL]);
});

// QA-FEEDBACK-2026-11-16-mini row 37 (NB18): sdk 0.3.4's bootInventory took engine `boot/bakedApi` for one URL, and that
// module's dynamic imports (bakedTextures, BakedSky, lut) made rolldown emit a second chunk, so `wildshard build` refused any
// shard config importing it ("config must bundle as one module"), as Nine Dragon's src/generators/bootFiles.ts does.
test('boot inventory authoring bundles as one config-safe chunk', async () => {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: resolve('src/sharddev/bootInventory.ts'), formats: ['es'] },
    rolldownOptions: { external: [/^node:/u, 'assemblyscript/dist/asc.js'], output: { codeSplitting: false } } } });
  const built = Array.isArray(result) ? result[0] : result;
  if (built === undefined || !('output' in built)) throw new Error('Missing boot inventory bundle');
  const chunks = built.output.filter(row => row.type === 'chunk');
  expect(chunks.map(row => row.fileName)).toHaveLength(1);
  const chunk = chunks[0]; if (chunk === undefined) throw new Error('Missing boot inventory chunk');
  expect(() => assertConfigBoundary([...chunk.imports, ...chunk.dynamicImports])).not.toThrow();
});
