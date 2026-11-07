// oxlint-disable-next-line import/no-nodejs-modules -- The fixture owns only its isolated cache.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve repository scratch without borrowing the shared cache.
import { resolve } from 'node:path';
import { expect, test, vi } from 'vitest';
import * as codec from '../src/sharddev/bake/byteCodec';
import { encodeZstdBytesMemo } from '../src/sharddev/bake/zstdBytesMemo';
import { bakeRawColourPixels } from '../src/sharddev/bake/rawTexture';

function isolated(run: (root: string) => void): void {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp/zstd-memo-'));
  const previous = process.env['WILDSHARD_ZSTD_BYTES_CACHE'];
  process.env['WILDSHARD_ZSTD_BYTES_CACHE'] = root;
  try { run(root); }
  finally {
    if (previous === undefined) delete process.env['WILDSHARD_ZSTD_BYTES_CACHE'];
    else process.env['WILDSHARD_ZSTD_BYTES_CACHE'] = previous;
    vi.restoreAllMocks(); rmSync(root, { recursive: true, force: true });
  }
}

test('native Zstd uses exact owned bytes across cold, disk-hit, changed-input and changed-level calls', () => isolated(() => {
  const data = Uint8Array.from({ length: 24_576 }, (_v, i) => (i * 31 + (i >>> 6)) % 251);
  const expected = codec.encodeBuildBytes(data, 'zstd', 19);
  const encode = vi.spyOn(codec, 'encodeBuildBytes');
  const cold = encodeZstdBytesMemo(data), warm = encodeZstdBytesMemo(new Uint8Array(data));
  expect(cold).toEqual(expected); expect(warm).toEqual(expected); expect(warm).not.toBe(cold);
  expect(encode).toHaveBeenCalledTimes(1);
  warm.fill(0); expect(encodeZstdBytesMemo(data)).toEqual(expected);
  expect(encode).toHaveBeenCalledTimes(1);
  const backing = new Uint8Array(data.length + 8); backing.set(data, 4);
  expect(encodeZstdBytesMemo(backing.subarray(4, -4))).toEqual(expected);
  expect(encode).toHaveBeenCalledTimes(1);
  encodeZstdBytesMemo(data, 3); expect(encode).toHaveBeenCalledTimes(2);
  data[0] = 99; encodeZstdBytesMemo(data); expect(encode).toHaveBeenCalledTimes(3);
}));

test('damaged or unavailable storage recomputes original bytes rather than admitting a damaged result', () => isolated(root => {
  const data = new Uint8Array([1, 2, 3, 4]);
  const expected = codec.encodeBuildBytes(data, 'zstd', 19);
  encodeZstdBytesMemo(data);
  const encode = vi.spyOn(codec, 'encodeBuildBytes');
  for (const extension of ['.bin', '.json']) {
    const file = readdirSync(root).find(name => name.endsWith(extension));
    if (file === undefined) throw new Error('Missing native memo file');
    writeFileSync(resolve(root, file), 'damaged');
    expect(encodeZstdBytesMemo(data)).toEqual(expected);
  }
  expect(encode).toHaveBeenCalledTimes(2);
  const blocker = resolve(root, 'not-a-directory'); writeFileSync(blocker, 'file');
  process.env['WILDSHARD_ZSTD_BYTES_CACHE'] = blocker;
  expect(encodeZstdBytesMemo(data)).toEqual(expected);
  expect(encode).toHaveBeenCalledTimes(3);
}));

test('the native memo preserves unshared bounded input and level admission before disk access', () => isolated(root => {
  const data = new Uint8Array([1]); encodeZstdBytesMemo(data);
  const before = readdirSync(root);
  for (const level of [0, 23, 1.5, Number.NaN, Infinity]) expect(() => encodeZstdBytesMemo(data, level)).toThrow('Zstd level');
  expect(() => encodeZstdBytesMemo(new Uint8Array(new SharedArrayBuffer(4)))).toThrow('bounded unshared');
  const detached = new Uint8Array(4); structuredClone(detached, { transfer: [detached.buffer] });
  expect(() => encodeZstdBytesMemo(detached)).toThrow();
  expect(readdirSync(root)).toEqual(before);
}));

test('the injected encoder leaves full KTX2 bytes and all raster and KTX2 checks intact', () => isolated(() => {
  const pixels = Uint8ClampedArray.from({ length: 24 }, (_v, i) => i * 7);
  const image = { width: 2, height: 3, pixels };
  const encode = vi.fn(encodeZstdBytesMemo);
  for (const colourSpace of ['srgb', 'linear'] as const) {
    const expected = bakeRawColourPixels(image, { colourSpace });
    expect(bakeRawColourPixels(image, { colourSpace }, encode)).toEqual(expected);
    expect(bakeRawColourPixels(image, { colourSpace }, encode)).toEqual(expected);
  }
  expect(encode).toHaveBeenCalledTimes(4);
  expect(encode.mock.calls.every(([, level]) => level === 19)).toBe(true);
  for (const width of [0, 4097, 1.5, Number.NaN])
    expect(() => bakeRawColourPixels({ ...image, width }, {}, encode)).toThrow('bounded RGBA');
  expect(encode).toHaveBeenCalledTimes(4);
  expect(() => bakeRawColourPixels(image, {}, () => new Uint8Array())).toThrow();
}));
