import { expect, test } from 'vitest';
import { BoxGeometry, BufferAttribute, Vector3, type BufferGeometry } from 'three';
import { Rng as NativeRng } from '@wildshard/engine/core/rng';
import { rock, tris, log, beam, plank, rope, sagLine, wobble } from '@wildshard/engine/world/geometryKit';
import { Rng } from '../random';
import { bakeRock, bakeTriangles, bakeLog, bakeBeam, bakePlank, bakeRope, bakeSagLine, bakeWobble } from './primitives';

function exact(actual: BufferGeometry, original: BufferGeometry): void {
  expect(Object.keys(actual.attributes)).toEqual(Object.keys(original.attributes));
  for (const [name, attribute] of Object.entries(original.attributes)) {
    const output = actual.getAttribute(name);
    expect(output.itemSize).toBe(attribute.itemSize);
    expect(output.normalized).toBe(attribute.normalized);
    expect(output.array.constructor).toBe(attribute.array.constructor);
    expect(new Uint8Array(output.array.buffer, output.array.byteOffset, output.array.byteLength))
      .toEqual(new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
  }
  expect(actual.index?.array).toEqual(original.index?.array);
}

test('author boulders preserve all native geometry bytes and RNG continuations', () => {
  for (const seed of [0, -1, 0x5e1, 0x5417]) for (const detail of [0, 1]) {
    const source = new NativeRng(seed), author = new Rng(seed);
    const expected = rock(0.47, detail, source, 0.6, 0.25), actual = bakeRock(0.47, detail, author, 0.6, 0.25);
    try { exact(actual, expected); expect(author.snapshot()).toEqual(source.snapshot()); }
    finally { actual.dispose(); expected.dispose(); }
  }
});

test('author triangle soups retain native Float32 coercion and signed zero', () => {
  const values = [-0, 1 / 3, 1e-46, 1, -1, 0, Math.PI, 0.25, -2];
  const expected = tris(values), actual = bakeTriangles(values);
  try { exact(actual, expected); }
  finally { actual.dispose(); expected.dispose(); }
});


test('author timbers and cables preserve native segment/channel order', () => {
  for (const [a, b] of [
    [new Vector3(1, -2, 3), new Vector3(-4, 5, 6)],
    [new Vector3(), new Vector3(0, -3, 0)],
    [new Vector3(-0, 0, 0), new Vector3(-0, 0, 0)],
  ]) {
    if (a === undefined || b === undefined) throw new Error('Incomplete segment');
    const path = sagLine(a, b, 0.7, 6), made = bakeSagLine(a, b, 0.7, 6);
    expect(made).toEqual(path);
    const pairs = [
      [bakeLog(a, b, 0.3, 0.1, 7, 0.4), log(a, b, 0.3, 0.1, 7, 0.4)],
      [bakeBeam(a, b, 0.2, 0.7, -0.4), beam(a, b, 0.2, 0.7, -0.4)],
      [bakeBeam(a, b, 0.2, 0.7), beam(a, b, 0.2, 0.7)],
      [bakeRope(made, 0.03, 5), rope(path, 0.03, 5)],
    ];
    for (const [actual, original] of pairs) {
      if (actual === undefined || original === undefined) throw new Error('Incomplete geometry');
      try { exact(actual, original); }
      finally { actual.dispose(); original.dispose(); }
    }
  }
});

test('author planks retain native shared-corner wobble and stream continuation', () => {
  for (const seed of [0, -1, 0x3ec4]) for (const wob of [0, 0.01, 0.12]) {
    const source = new NativeRng(seed), author = new Rng(seed);
    const original = plank(1.2, 0.3, 0.07, source, wob), actual = bakePlank(1.2, 0.3, 0.07, author, wob);
    try { exact(actual, original); expect(author.snapshot()).toEqual(source.snapshot()); }
    finally { actual.dispose(); original.dispose(); }
  }
});

test('standalone author wobble retains every duplicate corner and RNG continuation', () => {
  for (const seed of [0, -1, 791]) for (const amp of [0, 0.012, 0.7]) {
    const source = new NativeRng(seed), author = new Rng(seed), original = new BoxGeometry(1.3, 0.71, 2.9), actual = original.clone();
    try {
      wobble(original, amp, source); bakeWobble(actual, amp, author);
      exact(actual, original); expect(author.snapshot()).toEqual(source.snapshot());
      const expected = original.getAttribute('position'), output = actual.getAttribute('position');
      if (!(expected instanceof BufferAttribute) || !(output instanceof BufferAttribute)) throw new Error('Unexpected interleaved box');
      expect(output.version).toBe(expected.version);
    } finally { original.dispose(); actual.dispose(); }
  }
});
