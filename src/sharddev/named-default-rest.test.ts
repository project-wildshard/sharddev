import { expect, expectTypeOf, test } from 'vitest';
import * as v from 'valibot';
import { defineNamedRows, namedJsonSchema, type NamedRowInput } from './formatJsonSchema';

const description = { kind: 'object', mode: 'strip', entries: {
  anchors: { kind: 'optional', default: { riders: [] }, item: { kind: 'object', mode: 'strip', entries: {
    riders: { kind: 'optional', default: [], item: { kind: 'array', item: { kind: 'number' } } },
  } } },
  extra: { kind: 'optional', item: { kind: 'number' } },
  exact: { kind: 'exact-optional', item: { kind: 'number' } },
  effects: { kind: 'tuple-rest', items: [{ kind: 'string' }, { kind: 'tuple', items: [{ kind: 'number' }, { kind: 'number' }] }], rest: { kind: 'unknown' } },
} } as const;
const contract = defineNamedRows(description);
const native = v.object({
  anchors: v.optional(v.object({ riders: v.optional(v.array(v.number()), []) }), { riders: [] }),
  extra: v.optional(v.number()), exact: v.exactOptional(v.number()),
  effects: v.tupleWithRest([v.string(), v.tuple([v.number(), v.number()])], v.unknown()),
});

test('defaulted optional and rest tuples retain complete native mutable input and output types', () => {
  expectTypeOf<ReturnType<typeof contract.parse>>().toEqualTypeOf<v.InferOutput<typeof native>>();
  expectTypeOf<NamedRowInput<typeof description>>().toEqualTypeOf<v.InferInput<typeof native>>();
  const input: NamedRowInput<typeof description> = { effects: ['orchard', [1, 2], { opaque: true }], extra: undefined };
  const value = contract.parse(input);
  value.anchors.riders.push(9); value.effects[1][0] = 4;
  expect(value.anchors.riders).toEqual([9]);
  expect(contract.parse(input)).toEqual(v.parse(native, input));
  expect(contract.jsonSchema).toEqual(namedJsonSchema(native));
  expect(contract.admit(input)).toBe(input); expect(Object.hasOwn(input, 'anchors')).toBe(false);
});

test('nested defaults, exact undefined and rest tuple failures retain native issue paths', () => {
  const outcome = (make: () => unknown): unknown => {
    try { return make(); } catch (error) {
      if (!(error instanceof v.ValiError)) throw error;
      return { issues: JSON.stringify(error.issues) };
    }
  };
  for (const input of [{ effects: ['x', [1, 2]] }, { anchors: {}, effects: ['x', [1, 2, 3], false, null] },
    { anchors: undefined, extra: undefined, effects: ['x', [1, 2]] },
    { exact: undefined, effects: ['x', [1, 2]] }, { effects: ['x'] },
    { anchors: { riders: ['bad'] }, effects: ['x', [1, 2]] }])
    expect(outcome(() => contract.parse(input))).toEqual(outcome(() => v.parse(native, input)));
});

test('nested admitted leaves preserve transformed native input separately from parse output', () => {
  const leaf = defineNamedRows(v.pipe(v.string(), v.transform(Number)));
  const source = { kind: 'object', entries: { count: leaf.schema } } as const;
  const nested = defineNamedRows(source);
  expectTypeOf<NamedRowInput<typeof source>>().toEqualTypeOf<{ count: string }>();
  expectTypeOf<ReturnType<typeof nested.parse>>().toEqualTypeOf<{ count: number }>();
  const original = { count: '7' };
  expect(nested.admit(original)).toBe(original); expect(original.count).toBe('7');
  expect(nested.parse(original)).toEqual({ count: 7 });
  expect(() => nested.jsonSchema).toThrow();
});
