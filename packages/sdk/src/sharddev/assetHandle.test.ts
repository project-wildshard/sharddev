import { expect, it } from 'vitest';
import { copyAssetBytes, hashAssetBytes, immutableAsset, verifyAssetBytes } from './assetHandle';
import { ownAssetBytes } from './assetOwner';
import { withAssetOwner } from './assetScope';
import { hashImmutableBytes } from './immutable';

it('carries a private snapshot through owned copies and refuses later mutation', () => {
  const source = new Uint8Array([3, 5, 7]), original = immutableAsset(source);
  const copy = copyAssetBytes(source);
  expect(copy).not.toBe(source);
  expect(immutableAsset(copy)).toBe(original);
  source.fill(9);
  expect(hashAssetBytes(source)).toBe(hashImmutableBytes(source));
  expect(hashAssetBytes(source)).not.toBe(original.hash);
  expect(original.copy()).toEqual(new Uint8Array([3, 5, 7]));
  copy[1] = 8;
  expect(immutableAsset(copy)).not.toBe(original);
  expect(original.copy()).toEqual(new Uint8Array([3, 5, 7]));
});

it('certifies actual disk bytes only against a genuine private snapshot', () => {
  const original = immutableAsset(new Uint8Array([2, 4, 6])), disk = original.copy();
  expect(verifyAssetBytes(disk, original.hash, original)).toBe(true);
  expect(immutableAsset(disk)).toBe(original);
  disk[0] = 10;
  expect(verifyAssetBytes(disk, original.hash, original)).toBe(false);
  const forged = { hash: original.hash, byteLength: 3, copy: () => disk };
  expect(verifyAssetBytes(disk, original.hash, forged)).toBe(false);
  expect(verifyAssetBytes(disk, hashImmutableBytes(disk), forged)).toBe(true);
});

it('checks the exact native view despite outside mutations or authored iteration', () => {
  const backing = new Uint8Array([0, 1, 2, 3, 0]), view = backing.subarray(1, 4), handle = immutableAsset(view);
  backing[0] = 9;
  expect(immutableAsset(view)).toBe(handle);
  backing[2] = 9;
  expect(immutableAsset(view)).not.toBe(handle);
  class AuthoredView extends Uint8Array {
    override *[Symbol.iterator](): ArrayIterator<number> { yield 8; yield 8; yield 8; }
  }
  const authored = new AuthoredView([1, 2, 3]);
  expect(immutableAsset(authored).copy()).toEqual(new Uint8Array([1, 2, 3]));
});

it('does not retain a mutable shared-memory identity', () => {
  const source = new Uint8Array(new SharedArrayBuffer(3));
  source.set([1, 2, 3]);
  const old = immutableAsset(source);
  source[0] = 7;
  expect(hashAssetBytes(source)).toBe(hashImmutableBytes(source));
  expect(hashAssetBytes(source)).not.toBe(old.hash);
  expect(old.copy()).toEqual(new Uint8Array([1, 2, 3]));
});

it('keeps explicit async producer ownership detached and propagates failures', async () => {
  const input = new Uint8Array([4, 5, 6]);
  const owned = await withAssetOwner(async () => {
    await Promise.resolve();
    return ownAssetBytes(input);
  });
  expect(owned.bytes).not.toBe(input);
  expect(owned.hash).toBe(hashImmutableBytes(input));
  input.fill(0);
  expect(owned.bytes).toEqual(new Uint8Array([4, 5, 6]));
  await expect(withAssetOwner(() => Promise.reject(new Error('author refused')))).rejects.toThrow('author refused');
  expect(ownAssetBytes(input).hash).toBe(hashImmutableBytes(input));
});

it('refuses other typed-array families at a JavaScript ownership boundary', () => {
  expect(() => { Reflect.apply(immutableAsset, undefined, [new Uint16Array([256])]); }).toThrow('Uint8Array');
  expect(() => { Reflect.apply(hashAssetBytes, undefined, [new Uint16Array(new SharedArrayBuffer(2))]); }).toThrow('Uint8Array');
});

it('keeps unscoped config-safe copies private across public mutations', () => {
  const source = new Uint8Array([1, 2, 3]), first = ownAssetBytes(source);
  source.fill(7);
  expect(first.bytes).toEqual(new Uint8Array([1, 2, 3]));
  first.bytes.fill(8);
  const next = ownAssetBytes(source);
  expect(next.hash).toBe(hashImmutableBytes(source));
  expect(next.bytes).toEqual(source);
  expect(next.bytes).not.toBe(source);
});

it('keeps exact owner-port bytes across word tails and view alignments', () => {
  const key = Symbol.for('wildshard.sdk.asset-owner.v1'), previous = Object.getOwnPropertyDescriptor(globalThis, key);
  let issued: Uint8Array = new Uint8Array();
  Object.defineProperty(globalThis, key, { configurable: true, value: {
    current: () => (input: Uint8Array) => ({ bytes: issued, hash: hashImmutableBytes(input) }),
  } });
  try {
    for (const length of [0, 1, 3, 4, 31, 32, 33, 64, 65]) for (const a of [0, 1, 2, 3]) for (const b of [0, 1, 2, 3]) {
      const source = new Uint8Array(new ArrayBuffer(length + a), a, length);
      issued = new Uint8Array(new ArrayBuffer(length + b), b, length);
      for (let i = 0; i < length; i++) source[i] = issued[i] = (i * 71 + length) % 256;
      expect(ownAssetBytes(source).bytes).toEqual(source);
      for (const index of new Set([0, Math.floor(length / 2), length - 1])) {
        if (index < 0 || index >= length) continue;
        const byte = issued[index]; if (byte === undefined) throw new Error('Missing test byte');
        issued[index] = byte ^ 1;
        expect(() => ownAssetBytes(source)).toThrow('did not preserve its input bytes');
        issued[index] = byte;
      }
    }
  } finally {
    if (previous === undefined) Reflect.deleteProperty(globalThis, key); else Object.defineProperty(globalThis, key, previous);
  }
});

it('uses intrinsic byte slots while retaining authored, shared and resizable fallbacks', () => {
  class AuthoredBytes extends Uint8Array { override *[Symbol.iterator](): ArrayIterator<number> { yield 99; } }
  const ordinary = new Uint8Array(65).fill(7), authored = new AuthoredBytes(65).fill(7);
  let reads = 0;
  for (const input of [ordinary, authored]) for (const name of ['buffer', 'byteOffset', 'byteLength']) Object.defineProperty(input, name, {
    get: () => { reads++; throw new Error('Authored byte slot read'); },
  });
  expect(ownAssetBytes(ordinary).bytes).toEqual(new Uint8Array(65).fill(7));
  expect(ownAssetBytes(authored).bytes).toEqual(new Uint8Array(65).fill(7));
  expect(reads).toBe(0);
  const resizable: unknown = Reflect.construct(ArrayBuffer, [65, { maxByteLength: 128 }]);
  if (!(resizable instanceof ArrayBuffer)) throw new Error('Native resizable buffer required');
  const resize: unknown = Reflect.get(resizable, 'resize');
  if (typeof resize !== 'function') throw new Error('Native resize method required');
  const view = new Uint8Array(resizable).fill(3), first = ownAssetBytes(view);
  Reflect.apply(resize, resizable, [33]);
  expect(first.bytes).toEqual(new Uint8Array(65).fill(3));
  expect(ownAssetBytes(view).bytes).toEqual(new Uint8Array(33).fill(3));
  const shared = new Uint8Array(new SharedArrayBuffer(65)).fill(5), old = ownAssetBytes(shared);
  shared[64] = 6;
  expect(old.bytes).toEqual(new Uint8Array(65).fill(5)); expect(ownAssetBytes(shared).bytes[64]).toBe(6);
});
