import { expect, expectTypeOf, test } from 'vitest';
import * as v from 'valibot';
import { defineNamedRows, namedJsonSchema } from './formatJsonSchema';

const number = { kind: 'number', finite: true, integer: true, min: -1, max: 8 } as const;
const text = { kind: 'string', min: 1, max: 8, startsWith: 'a' } as const;
const nativeNumber = v.pipe(v.number(), v.finite(), v.integer(), v.minValue(-1), v.maxValue(8));
const nativeText = v.pipe(v.string(), v.minLength(1), v.maxLength(8), v.startsWith('a'));
const shape = defineNamedRows({ kind: 'object', mode: 'strict', entries: {
  n: number, text, enabled: { kind: 'boolean' }, pick: { kind: 'picklist', values: ['a', 'b', 1] },
  list: { kind: 'array', item: number, min: 1, max: 3, length: 2 },
  pair: { kind: 'tuple', items: [number, text] }, constant: { kind: 'literal', value: 'source' },
  maybe: { kind: 'exact-optional', item: { kind: 'nullable', item: number } },
  lookup: { kind: 'record', key: { kind: 'string' }, value: number },
  native: v.literal('native'), nil: { kind: 'null' }, raw: { kind: 'unknown' },
} });
const native = v.strictObject({ n: nativeNumber, text: nativeText, enabled: v.boolean(), pick: v.picklist(['a', 'b', 1]),
  list: v.pipe(v.array(nativeNumber), v.minLength(1), v.maxLength(3), v.length(2)),
  pair: v.tuple([nativeNumber, nativeText]), constant: v.literal('source'), maybe: v.exactOptional(v.nullable(nativeNumber)),
  lookup: v.record(v.string(), nativeNumber), native: v.literal('native'), nil: v.null(), raw: v.unknown() });

function outcome(read: () => unknown): unknown {
  try { return { rows: read() }; }
  catch (error) {
    if (error instanceof v.ValiError) return { issues: JSON.stringify(error.issues) };
    throw error;
  }
}

test('source contracts retain complete mutable object, tuple, optional and native leaf types', () => {
  expectTypeOf<ReturnType<typeof shape.parse>>().toEqualTypeOf<v.InferOutput<typeof native>>();
  const rows: ReturnType<typeof shape.parse> = { n: 2, text: 'a', enabled: true, pick: 1, list: [1, 2], pair: [1, 'a'],
    constant: 'source', lookup: { slot: 1 }, native: 'native', nil: null, raw: null };
  rows.n = 4; rows.pair[0] = 3; rows.list.push(2); rows.list.pop();
  expect(shape.parse(rows)).toEqual(v.parse(native, rows));
  expect(shape.jsonSchema).toEqual(namedJsonSchema(native));
  for (const bad of [null, {}, { ...rows, n: Number.NaN }, { ...rows, n: Infinity }, { ...rows, n: 9 },
    { ...rows, text: 'bad' }, { ...rows, list: [1] }, { ...rows, maybe: undefined },
    { ...rows, pair: [1, 2, 3] }, { ...rows, lookup: { slot: 'bad' } }, { ...rows, extra: true }])
    expect(outcome(() => shape.parse(bad))).toEqual(outcome(() => v.parse(native, bad)));
});

test('strict, strip and loose object modes retain native output, metadata and refusal paths', () => {
  for (const mode of ['strict', 'strip', 'loose'] as const) {
    const compiled = defineNamedRows({ kind: 'object', mode, entries: { n: number } });
    const original = mode === 'strict' ? v.strictObject({ n: nativeNumber }) : mode === 'loose' ? v.looseObject({ n: nativeNumber }) : v.object({ n: nativeNumber });
    expect(outcome(() => compiled.parse({ n: 2, extra: { retained: true } })))
      .toEqual(outcome(() => v.parse(original, { n: 2, extra: { retained: true } })));
    expect(compiled.jsonSchema).toEqual(namedJsonSchema(original));
  }
  const tuple = defineNamedRows({ kind: 'tuple', items: [number, text] });
  expect(tuple.parse([2, 'a', 'strip this'])).toEqual(v.parse(v.tuple([nativeNumber, nativeText]), [2, 'a', 'strip this']));
  const loose = defineNamedRows({ kind: 'object', mode: 'loose', entries: { n: number } });
  expectTypeOf<ReturnType<typeof loose.parse>>().toEqualTypeOf<v.InferOutput<ReturnType<typeof v.looseObject<{ n: typeof nativeNumber }>>>>();
});

test('source refinements keep original order/messages and cannot silently become wire admission', () => {
  const compiled = defineNamedRows(shape.schema, row => row.n < row.pair[0], 'ordered source');
  const original = v.pipe(native, v.check(row => row.n < row.pair[0], 'ordered source'));
  const rows = { n: 3, text: 'a', enabled: true, pick: 1, list: [1, 2], pair: [2, 'a'],
    constant: 'source', lookup: {}, native: 'native', nil: null, raw: null };
  expect(outcome(() => compiled.parse(rows))).toEqual(outcome(() => v.parse(original, rows)));
  expect(outcome(() => compiled.parse({ ...rows, n: Infinity }))).toEqual(outcome(() => v.parse(original, { ...rows, n: Infinity })));
  expect(() => compiled.jsonSchema).toThrow(); expect(() => namedJsonSchema(original)).toThrow();
});

test('native unions, discriminated variants and bounded records retain exact admission', () => {
  const count = { kind: 'number', safeInteger: true, min: 0 } as const;
  const word = { kind: 'string', regex: /^[a-f0-9]{4}$/u } as const;
  const a = { kind: 'object', mode: 'strip', entries: { kind: { kind: 'literal', value: 'a' }, count } } as const;
  const b = { kind: 'object', entries: { kind: { kind: 'literal', value: 'b' }, word } } as const;
  const va = v.object({ kind: v.literal('a'), count: v.pipe(v.number(), v.safeInteger(), v.minValue(0)) });
  const vb = v.strictObject({ kind: v.literal('b'), word: v.pipe(v.string(), v.regex(/^[a-f0-9]{4}$/u)) });
  const variants = defineNamedRows({ kind: 'variant', key: 'kind', options: [a, b] });
  const original = v.variant('kind', [va, vb]);
  expectTypeOf<ReturnType<typeof variants.parse>>().toEqualTypeOf<v.InferOutput<typeof original>>();
  for (const input of [{ kind: 'a', count: 2, extra: 4 }, { kind: 'b', word: 'a09f' }, null, {},
    { kind: 'c' }, { kind: 'a', count: Number.MAX_SAFE_INTEGER + 1 }, { kind: 'a', count: -1 },
    { kind: 'b', word: 'nope' }, { kind: 'b', word: 'ffff', extra: 1 }])
    expect(outcome(() => variants.parse(input))).toEqual(outcome(() => v.parse(original, input)));
  expect(() => variants.jsonSchema).toThrow(); expect(() => namedJsonSchema(original)).toThrow();
  const combined = defineNamedRows({ kind: 'union', options: [count, word] });
  const nativeUnion = v.union([va.entries.count, vb.entries.word]);
  expectTypeOf<ReturnType<typeof combined.parse>>().toEqualTypeOf<v.InferOutput<typeof nativeUnion>>();
  for (const input of [0, '0000', Infinity, 1.5, 'bad', null])
    expect(outcome(() => combined.parse(input))).toEqual(outcome(() => v.parse(nativeUnion, input)));
  const records = defineNamedRows({ kind: 'record', key: { kind: 'string' }, value: count, maxEntries: 2 });
  const nativeRecord = v.pipe(v.record(v.string(), va.entries.count), v.maxEntries(2));
  for (const input of [{}, { a: 1, b: 2 }, { a: 1, b: 2, c: 3 }, { a: Infinity }])
    expect(outcome(() => records.parse(input))).toEqual(outcome(() => v.parse(nativeRecord, input)));
  expect(records.jsonSchema).toEqual(namedJsonSchema(nativeRecord));
});

test('admit preserves native assertion identity and unknown fields without skipping guards', () => {
  const contract = defineNamedRows({ kind: 'object', mode: 'strip', entries: { count: number } });
  const input = { extra: { ordered: true }, count: 2 };
  expect(contract.admit(input)).toBe(input); expect(Object.keys(input)).toEqual(['extra', 'count']);
  expect(contract.accepts(input)).toBe(true); expect(contract.accepts({ count: Infinity })).toBe(false);
  expect(contract.parse(input)).toEqual({ count: 2 }); expect(contract.parse(input)).not.toBe(input);
  const original = v.object({ count: nativeNumber });
  for (const bad of [{ count: Infinity }, {}, null])
    expect(outcome(() => contract.admit(bad))).toEqual(outcome(() => { v.assert(original, bad); return bad; }));
});

test('native transformed leaves retain input types and identity for admit', () => {
  const transformed = v.pipe(v.string(), v.transform(value => value.length));
  const contract = defineNamedRows({ kind: 'object', entries: { size: transformed } });
  expectTypeOf<ReturnType<typeof contract.admit>>().toEqualTypeOf<{ size: string }>();
  expectTypeOf<ReturnType<typeof contract.parse>>().toEqualTypeOf<{ size: number }>();
  const input = { size: 'abcd' };
  expect(contract.admit(input)).toBe(input); expect(contract.parse(input)).toEqual({ size: 4 });
});
