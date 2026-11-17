import { expect, test } from 'vitest';
import { zlibSync, unzlibSync } from 'fflate';
import { encodePortableBytes, decodePortableBytes } from './portableBytes';

test('portable source codec retains full compressed bytes and owns sliced inputs and decoded output', () => {
  const bank = Uint8Array.from({ length: 65539 }, (_, i) => i * 31 % 256), input = bank.subarray(3, -4);
  for (const level of [0, 6, 9] as const) {
    const native = zlibSync(input, { level }), encoded = encodePortableBytes(input, level);
    expect(encoded).toEqual(native);
    const wrapped = new Uint8Array(native.length + 7); wrapped.set(native, 3);
    const decoded = decodePortableBytes(wrapped.subarray(3, native.length + 3));
    expect(decoded).toEqual(input); expect(decoded).toEqual(unzlibSync(native));
    decoded.fill(0); expect(decodePortableBytes(encoded)).toEqual(input);
    expect(wrapped.subarray(3, native.length + 3)).toEqual(native);
  }
});

test('portable source codec retains malformed-stream refusal and rejects unowned input storage', () => {
  expect(() => decodePortableBytes(Uint8Array.of(1, 2, 3))).toThrow();
  expect(() => decodePortableBytes(new Uint8Array(new SharedArrayBuffer(4)))).toThrow('unshared');
  expect(() => { Reflect.apply(decodePortableBytes, undefined, [null]); }).toThrow('unshared');
});
