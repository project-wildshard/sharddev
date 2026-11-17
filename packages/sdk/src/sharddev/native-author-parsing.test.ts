import { expect, test } from 'vitest';
import * as v from 'valibot';
import { nativeColliderRecordSchema } from '@wildshard/format/nativePhysics';
import { nativeColliderSourceRows } from './formatJsonSchema';
import { parseSectionValue } from './sections';

const outcome = (run: () => unknown): unknown => { try { return run(); } catch (error: unknown) { return error instanceof Error ? error.message : error; } };

test('native source collider arrays preserve shape, provenance and file-slice refusals', () => {
  const row = { shape: 9, groups: 1, friction: 0.5, at: [0, 0, 0], rot: [0, 0, 0, 1], owner: 'native', vertices: { file: 'hulls.bin', byteOffset: 0, byteLength: 36 } };
  expect(nativeColliderSourceRows([row], [1, 2, 9], 'tagged')).toEqual([row]);
  const { owner: _owner, ...piece } = row;
  expect(nativeColliderSourceRows([{ ...piece, body: 0 }], [1, 2, 9], 'piece')).toEqual([{ ...piece, body: 0 }]);
  for (const owner of ['piece', 'tagged'] as const) {
    const source = v.array(nativeColliderRecordSchema([1, 2, 9], owner, true));
    for (const value of [[], [row], [{ ...row, shape: 6 }], [{ ...row, body: 0 }], [{ ...row, extra: true }], [{ ...row, at: [Infinity, 0, 0] }], [{ ...row, vertices: { file: 'hulls.bin', byteOffset: -1, byteLength: 36 } }], null]) {
      expect(outcome(() => nativeColliderSourceRows(value, [1, 2, 9], owner))).toEqual(outcome(() => v.parse(source, value)));
    }
  }
});

test('separately owned section wire grammars keep native defaults and custom checks', () => {
  const grammar = v.pipe(v.strictObject({ value: v.optional(v.number(), 7) }), v.check(row => row.value % 2 === 1, 'odd rows only'));
  expect(parseSectionValue(grammar, {})).toEqual({ value: 7 });
  for (const value of [{}, { value: 9 }, { value: 2 }, { value: '7' }, { value: 7, extra: 0 }]) {
    expect(outcome(() => parseSectionValue(grammar, value))).toEqual(outcome(() => v.parse(grammar, value)));
  }
});
