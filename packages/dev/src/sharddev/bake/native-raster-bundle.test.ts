import { expect, test } from 'vitest';
import { build } from 'vite';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the tracked author source used by both actual bundlers.
import { resolve } from 'node:path';
import { bundleNativeRaster, type NativeRasterBundle } from './nativeRaster';

const profiles: readonly Omit<NativeRasterBundle, 'root' | 'entry'>[] = [
  { format: 'iife', name: 'ReferenceRaster' },
  { format: 'es', fileName: 'referencePage' },
  { format: 'es', discardModuleSideEffects: true },
];

test.each(profiles)('native raster bundle keeps complete original code for %j', async profile => {
  const root = resolve('.'), entry = resolve('test/fixtures/native-raster-entry.ts');
  const expected = await build({ configFile: false, logLevel: 'silent', publicDir: false, root,
    build: { write: false, target: 'esnext', minify: false,
      lib: { entry, formats: [profile.format], ...(profile.name === undefined ? {} : { name: profile.name }), ...(profile.fileName === undefined ? {} : { fileName: profile.fileName }) },
      rolldownOptions: { ...(profile.discardModuleSideEffects === true ? { treeshake: { moduleSideEffects: false } } : {}), output: { codeSplitting: false } } } });
  const code = (Array.isArray(expected) ? expected : [expected]).flatMap(bundle => 'output' in bundle ? bundle.output : []).find(chunk => chunk.type === 'chunk')?.code;
  expect(code).toBeDefined();
  expect(await bundleNativeRaster({ ...profile, root, entry })).toBe(code);
  expect(await bundleNativeRaster({ ...profile, root: new URL('../../../', import.meta.url),
    entry: new URL('../../../test/fixtures/native-raster-entry.ts', import.meta.url) })).toBe(code);
});

test('native raster bundling preserves missing source refusal', async () => {
  await expect(bundleNativeRaster({ root: resolve('.'), entry: resolve('test/fixtures/absent-native-raster-entry.ts'), format: 'es' })).rejects.toThrow();
  await expect(bundleNativeRaster({ root: new URL('../../../', import.meta.url),
    entry: new URL('../../../test/fixtures/absent-native-raster-entry.ts', import.meta.url), format: 'es' })).rejects.toThrow();
});

test('native author bundle URLs refuse network schemes before building', async () => {
  const root = new URL('../../../', import.meta.url), entry = new URL('../../../test/fixtures/native-raster-entry.ts', import.meta.url);
  await expect(bundleNativeRaster({ root: new URL('https://invalid.test/'), entry, format: 'es' })).rejects.toThrow('scheme');
  await expect(bundleNativeRaster({ root, entry: new URL('https://invalid.test/source.ts'), format: 'es' })).rejects.toThrow('scheme');
});
