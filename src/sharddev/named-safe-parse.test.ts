import { expect, expectTypeOf, test } from 'vitest';
import * as v from 'valibot';
import { defineNamedRows } from './formatJsonSchema';

test('paired non-throwing admission retains native defaults, output ownership and full issues', () => {
  const named = defineNamedRows({ kind: 'object', mode: 'strip', entries: {
    count: { kind: 'optional', item: { kind: 'number' }, default: 2 },
    points: { kind: 'array', item: { kind: 'tuple', items: [{ kind: 'number' }, { kind: 'number' }] } },
  } });
  const native = v.object({ count: v.optional(v.number(), 2), points: v.array(v.tuple([v.number(), v.number()])) });
  const input = { points: [[1, 2], [3, 4]], unrelated: true };
  const parsed = named.safeParse(input);
  expect(parsed).toEqual(v.safeParse(native, input));
  if (!parsed.success) throw new Error('Original safe source admission refused');
  expectTypeOf(parsed.output).toEqualTypeOf<v.InferOutput<typeof native>>();
  expect(parsed.output).not.toBe(input); expect(parsed.output.points).not.toBe(input.points);
  expect(Object.hasOwn(input, 'count')).toBe(false); expect(parsed.output.count).toBe(2);
  for (const invalid of [null, {}, { points: [[1]] }, { count: 'bad', points: [[false, true]] }])
    expect(named.safeParse(invalid)).toEqual(v.safeParse(native, invalid));
});
