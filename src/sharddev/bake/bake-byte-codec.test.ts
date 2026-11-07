// oxlint-disable-next-line import/no-nodejs-modules -- Compare the original pinned native codec bytes and decoding.
import { constants, deflateSync, zstdCompressSync, zstdDecompressSync } from 'node:zlib';
import { zlibSync, unzlibSync } from 'fflate';
import { expect, test } from 'vitest';
import { decodeBuildDeflate, encodeBuildBytes } from './byteCodec';

const input = Uint8Array.from({ length: 4096 }, (_, index) => (index * 13) % 256);
test('default deflate is the original level9 stream, including view offsets', () => {
  const view = input.subarray(17, 1031);
  const bytes = encodeBuildBytes(view, 'deflate');
  expect(bytes).toEqual(zlibSync(view, { level: 9 }));
  expect(unzlibSync(bytes)).toEqual(view);
  expect(encodeBuildBytes(view, 'deflate', 0)).toEqual(zlibSync(view, { level: 0 }));
});
test('default zstd is the original level19 stream with exact decoded bytes', () => {
  const bytes = encodeBuildBytes(input, 'zstd');
  expect(bytes).toEqual(new Uint8Array(zstdCompressSync(input, { params: { [constants.ZSTD_c_compressionLevel]: 19 } })));
  expect(new Uint8Array(zstdDecompressSync(bytes))).toEqual(input);
  expect(encodeBuildBytes(input, 'zstd', 1)).toEqual(new Uint8Array(zstdCompressSync(input, { params: { [constants.ZSTD_c_compressionLevel]: 1 } })));
});
test('outputs own their bytes and do not alter the source or another invocation', () => {
  const source = input.slice(), first = encodeBuildBytes(source, 'deflate'), second = encodeBuildBytes(source, 'deflate');
  first.fill(0);
  expect(source).toEqual(input);
  expect(second).toEqual(zlibSync(input, { level: 9 }));
  expect(first.buffer).not.toBe(second.buffer);
});
test.each([
  ['deflate', -1], ['deflate', 10], ['deflate', 0.5], ['deflate', Number.NaN],
  ['zstd', 0], ['zstd', 23], ['zstd', Infinity], ['zstd', 1.5], ['gzip', 9], ['zstd', null],
])('refuses invalid codec/level %s/%s', (codec, level) => {
  expect(() => { Reflect.apply(encodeBuildBytes, undefined, [input, codec, level]); }).toThrow();
});
test('refuses non-byte and shared inputs before compression', () => {
  for (const bytes of [[], new DataView(new ArrayBuffer(8)), new Uint8Array(new SharedArrayBuffer(8))]) {
    expect(() => { Reflect.apply(encodeBuildBytes, undefined, [bytes, 'deflate']); }).toThrow();
  }
});
test('detached input refuses and empty owned input remains valid', () => {
  const bytes = new Uint8Array(8);
  structuredClone(bytes.buffer, { transfer: [bytes.buffer] });
  expect(() => encodeBuildBytes(bytes, 'deflate')).toThrow();
  expect(unzlibSync(encodeBuildBytes(new Uint8Array(), 'deflate'))).toEqual(new Uint8Array());
});


test('explicit native deflate preserves every bounded Node level and owns the selected view', () => {
  const source = input.slice(), view = source.subarray(17, 1031);
  for (const level of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const first = encodeBuildBytes(view, 'deflate', level, 'native');
    expect(first).toEqual(new Uint8Array(deflateSync(view, { level })));
    expect(unzlibSync(first)).toEqual(view);
    first.fill(0);
    expect(encodeBuildBytes(view, 'deflate', level, 'native')).toEqual(new Uint8Array(deflateSync(view, { level })));
  }
  expect(source).toEqual(input);
  expect(encodeBuildBytes(view, 'deflate', undefined, 'native')).toEqual(new Uint8Array(deflateSync(view, { level: 9 })));
});

test('native selection retains codec, level and backing refusals', () => {
  for (const args of [[input, 'deflate', 10, 'native'], [input, 'deflate', -1, 'native'],
    [input, 'deflate', 0.5, 'native'], [input, 'deflate', Number.NaN, 'native'],
    [input, 'zstd', 19, 'native'], [input, 'deflate', 9, 'other'], [input, 'deflate', 9, null],
    [new Uint8Array(new SharedArrayBuffer(8)), 'deflate', 9, 'native']]) {
    expect(() => { Reflect.apply(encodeBuildBytes, undefined, args); }).toThrow();
  }
  const detached = new Uint8Array(8); structuredClone(detached.buffer, { transfer: [detached.buffer] });
  expect(() => encodeBuildBytes(detached, 'deflate', 9, 'native')).toThrow();
});

test('bounded build decoding owns the selected zlib view and accepts an exact empty stream', () => {
  const encoded = deflateSync(input), backing = new Uint8Array(encoded.length + 17);
  backing.set(encoded, 11);
  const view = backing.subarray(11, 11 + encoded.length), before = view.slice();
  const decoded = decodeBuildDeflate(view, input.length);
  expect(decoded).toEqual(input); decoded.fill(0);
  expect(view).toEqual(before); expect(decodeBuildDeflate(view, input.length)).toEqual(input);
  expect(decodeBuildDeflate(deflateSync(new Uint8Array()), 0)).toEqual(new Uint8Array());
});

test('build decoding refuses corrupt, truncated, undersized and oversized declarations', () => {
  const encoded = deflateSync(input);
  for (const bytes of [new Uint8Array(), encoded.subarray(0, -1), new Uint8Array([1, 2, 3])]) {
    expect(() => decodeBuildDeflate(bytes, input.length)).toThrow();
  }
  for (const size of [0, input.length - 1, input.length + 1, -1, 0.5, Infinity, Number.NaN, 256_000_001]) {
    expect(() => decodeBuildDeflate(encoded, size)).toThrow();
  }
  const detached = new Uint8Array(encoded); structuredClone(detached.buffer, { transfer: [detached.buffer] });
  for (const bytes of [detached, [], new Uint8Array(new SharedArrayBuffer(8))]) {
    expect(() => { Reflect.apply(decodeBuildDeflate, undefined, [bytes, input.length]); }).toThrow();
  }
});
