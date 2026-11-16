import { expect, test } from 'vitest';
import conditionalSchema from './fixtures/ci21sdk-tail/schema-conditionals.json' with { type: 'json' };
import { fixtureNativeJson } from './fixtures/productFile';
import originalDressing from './fixtures/ci21sdk-tail/nalati-dressing-phone.json' with { type: 'json' };
import { verifyCi21Fixture } from './fixtures/ci21sdk-tail/frozen';

import { validateDefinedJson } from '../src/sharddev/sections';
import { namedJsonSchema } from '../src/sharddev/formatJsonSchema';
import { namedJsonSchema as nativeNamedJsonSchema } from '@wildshard/engine/host/formatJsonSchema';
import { encodeCanonicalJson } from '@wildshard/engine/host/immutable';
import { SceneDressingSchema } from '@wildshard/format/sceneDressing';

verifyCi21Fixture('nalati-dressing-phone.json', originalDressing);
verifyCi21Fixture('schema-conditionals.json', conditionalSchema);

const encode = (value: unknown): Uint8Array => new TextEncoder().encode(encodeCanonicalJson(value));
const accepts = (work: () => unknown): boolean => { try { work(); return true; } catch { return false; } };

test('real dressing retains author/runtime acceptance and nested refusal without schema mutation', async () => {
  const schema = namedJsonSchema(SceneDressingSchema), original = encodeCanonicalJson(schema), schemaBytes = encode(schema);
  expect(encodeCanonicalJson(nativeNamedJsonSchema(SceneDressingSchema))).toBe(original);
  const rows = originalDressing, layer = rows.layers[0], first = rows.statics[0];
  if (layer === undefined || first === undefined) throw new Error('Missing actual dressing rows');
  const candidates = [rows,
    { ...rows, layers: [{ ...layer, far: 'distant' }] },
    { ...rows, statics: [{ ...first, members: [{ model: 42 }] }] },
    { ...rows, geometry: { invalid: { kind: 'baked', url: 8 } } },
  ];
  for (const [index, value] of candidates.entries()) {
    const bytes = encode(value);
    const author = accepts(() => validateDefinedJson(schemaBytes, bytes));
    expect(author).toBe(index === 0);
    expect(await fixtureNativeJson(schema, bytes).then(() => true, () => false)).toBe(author);
  }
  expect(encodeCanonicalJson(schema)).toBe(original);
  // Native factoring size/identity assertions stay in engine test/schema-code-memory.test.ts.
  expect(encodeCanonicalJson(await fixtureNativeJson(schema, encode(rows)))).toBe(encodeCanonicalJson(rows));
});

test('data-valued keywords and existing reference bases retain their original meanings', async () => {
  const data = { properties: { items: { type: 'an actual data string' } }, note: 'x'.repeat(17_000) };
  const schema = { $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', const: data };
  expect(await fixtureNativeJson(schema, encode(data))).toEqual(data);
  await expect(fixtureNativeJson(schema, encode({ ...data, note: 'changed' }))).rejects.toThrow('refuses its schema');
  // Private factoring's reserved-reference passthrough remains in the engine companion.
});

test('factored tuple, dependency, conditional and disjunction rules match the author validator', async () => {
  const schema = { ...conditionalSchema, $comment: 'x'.repeat(17_000) };
  const samples = [
    { mode: 'strict', options: ['x', 2], values: [0, 1] }, { mode: 'loose', trigger: true, count: 1 },
    { mode: 'strict' }, { mode: 'loose', options: ['x'] }, { mode: 'loose', trigger: true },
    { mode: 'strict', options: ['x', 2, 3] }, { mode: 'loose', values: [0] },
  ];
  for (const [index, value] of samples.entries()) {
    const bytes = encode(value), author = accepts(() => validateDefinedJson(encode(schema), bytes));
    expect(author).toBe(index < 2);
    expect(await fixtureNativeJson(schema, bytes).then(() => true, () => false)).toBe(author);
  }
});
