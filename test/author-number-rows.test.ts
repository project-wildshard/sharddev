import { expect, expectTypeOf, test } from 'vitest';
import * as v from 'valibot';
import { numberTupleRows, numberArrayRows } from '../src/sharddev/rows';

function sparseNumbers(length: number): number[] { const rows: number[] = []; rows.length = length; return rows; }

test('numeric tuple ports retain exact fixed-length native output types', () => {
  expectTypeOf(numberTupleRows([1, 2, 3], 3)).toEqualTypeOf<[number, number, number]>();
  expectTypeOf(numberTupleRows([1, 2, 3, 4], 4)).toEqualTypeOf<[number, number, number, number]>();
  expectTypeOf(numberTupleRows([1, 2, 3, 4, 5], 5)).toEqualTypeOf<[number, number, number, number, number]>();
});

for (const width of [3, 4, 5] as const) test(`native ${width}-word tuple admission and ownership stay exact`, () => {
  const schema = width === 3 ? v.tuple([v.number(), v.number(), v.number()]) : width === 4 ? v.tuple([v.number(), v.number(), v.number(), v.number()]) : v.tuple([v.number(), v.number(), v.number(), v.number(), v.number()]);
  for (const input of [[-0, 2, 3, 4, 5], [Infinity, -Infinity, 0, 4, 5], [1, 2, 3, 4, 5, 6]]) {
    const rows = numberTupleRows(input, width), native = v.parse(schema, input);
    expect(rows).toEqual(native); expect(rows).not.toBe(input);
    expect(Object.is(rows[0], -0)).toBe(Object.is(native[0], -0));
  }
  for (const bad of [null, {}, [1, 2], [1, Number.NaN, 3, 4], [1, '2', 3, 4], new Float32Array(4), sparseNumbers(4)]) {
    expect(() => numberTupleRows(bad, width)).toThrow();
    expect(() => v.parse(schema, bad)).toThrow();
  }
});

test('native numeric record admission retains full words, ownership and malformed-array refusals', () => {
  const schema = v.array(v.number());
  for (const input of [[], [-0, Infinity, -Infinity, 1.5]]) {
    const actual = numberArrayRows(input), native = v.parse(schema, input);
    expect(actual).toEqual(native); expect(actual).not.toBe(input);
    expect(Object.is(actual[0], -0)).toBe(Object.is(native[0], -0));
  }
  for (const bad of [null, {}, [Number.NaN], ['1'], sparseNumbers(2), new Float64Array(4)]) {
    expect(() => numberArrayRows(bad)).toThrow();
    expect(() => v.parse(schema, bad)).toThrow();
  }
  expect(() => { Reflect.apply(numberTupleRows, undefined, [[1, 2], 2]); }).toThrow('tuple width');
});
