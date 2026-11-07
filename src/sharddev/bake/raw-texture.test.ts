import { expect, test } from 'vitest';
import { build } from 'vite';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the actual author helper for its sealed bundle proof.
import { resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Inspect every original numerical pixel after native Zstd decompression.
import { zstdDecompressSync } from 'node:zlib';
import { bakeRawColourPixels } from './rawTexture';
import { bakeRawColourTexture } from './texture';
import { writeImagePixels } from './image';
import { hashImmutableBytes } from '@wildshard/engine/host/immutable';
import { assertConfigBoundary } from '../configBoundary';

const original = [
  { colourSpace: 'srgb', flipY: false, hash: '799eebeb9aa1f36d53900c7b75745903ff3795a42ade080105065e27cfe7f94e' },
  { colourSpace: 'srgb', flipY: true, hash: '00cc1558a009823876e280af0286a899c95a93b46b248d3e94ce931c1c598405' },
  { colourSpace: 'linear', flipY: false, hash: 'f8537fed4da195f356480c427670fce71fca91beb3f9c676171345581ccdde99' },
  { colourSpace: 'linear', flipY: true, hash: 'aceae14fefb090f8eca2a5dbdf2b6eb4896163831bc099c2b7039157ec1a9e71' },
] as const;

test.each(original)('retains the full original $colourSpace / flip=$flipY KTX2 bytes', async row => {
  const pixels = Uint8ClampedArray.from({ length: 24 }, (_, i) => (i * 31 + 17) % 256);
  const image = { width: 2, height: 3, pixels };
  const legacy = await bakeRawColourTexture(await writeImagePixels(image), row);
  const ordered = row.flipY ? Uint8ClampedArray.from([...pixels.slice(16, 24), ...pixels.slice(8, 16), ...pixels.slice(0, 8)]) : pixels;
  const actual = bakeRawColourPixels({ ...image, pixels: ordered }, row);
  for (const bytes of [actual, legacy]) {
    expect(bytes.byteLength).toBe(229); expect(hashImmutableBytes(bytes)).toBe(row.hash);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const start = Number(view.getBigUint64(80, true)), size = Number(view.getBigUint64(88, true));
    expect([...zstdDecompressSync(bytes.subarray(start, start + size))]).toEqual([...ordered]);
  }
});

test('a linear black texel owns only the selected source view', () => {
  const backing = new Uint8ClampedArray([91, 92, 93, 94, 0, 0, 0, 255, 95, 96, 97, 98]);
  const bytes = bakeRawColourPixels({ width: 1, height: 1, pixels: backing.subarray(4, 8) }, { colourSpace: 'linear' });
  const want = hashImmutableBytes(bytes);
  expect([...backing]).toEqual([91, 92, 93, 94, 0, 0, 0, 255, 95, 96, 97, 98]);
  backing.fill(0); expect(hashImmutableBytes(bytes)).toBe(want);
});

test('refuses invalid dimensions, incomplete/shared/detached pixels and unknown transfer', () => {
  const image = { width: 1, height: 1, pixels: new Uint8ClampedArray(4) };
  for (const width of [0, -1, 1.5, Number.NaN, Infinity, 4097]) expect(() => bakeRawColourPixels({ ...image, width })).toThrow('Invalid bounded RGBA raster');
  expect(() => bakeRawColourPixels({ ...image, pixels: new Uint8ClampedArray(3) })).toThrow('Invalid bounded RGBA raster');
  expect(() => bakeRawColourPixels({ ...image, pixels: new Uint8ClampedArray(new SharedArrayBuffer(4)) })).toThrow('Invalid bounded RGBA raster');
  const detached = new Uint8ClampedArray(4); structuredClone(detached, { transfer: [detached.buffer] });
  expect(() => bakeRawColourPixels({ ...image, pixels: detached })).toThrow('Invalid bounded RGBA raster');
  expect(() => { Reflect.apply(bakeRawColourPixels, undefined, [image, { colourSpace: 'unknown' }]); }).toThrow('Invalid texture colour space');
});

test('bundles the real pixel packer without filesystem, image or compiler services', async () => {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: resolve('src/sharddev/bake/rawTexture.ts'), formats: ['es'] }, rolldownOptions: { external: [/^node:/u] } } });
  const built = Array.isArray(result) ? result[0] : result;
  if (built === undefined || !('output' in built)) throw new Error('Missing raw texture bundle');
  const chunks = built.output.filter(row => row.type === 'chunk'); expect(chunks).toHaveLength(1);
  for (const chunk of chunks) {
    assertConfigBoundary([...chunk.imports, ...chunk.dynamicImports]);
    expect(Object.keys(chunk.modules).some(name => name.endsWith('/bake/image.ts'))).toBe(false);
  }
});
