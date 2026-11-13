import { expect, test } from 'vitest';
import * as v from 'valibot';
import { namedJsonSchema, namedFormatJsonSchemas } from './formatJsonSchema';
import { WorldSceneSchema } from '@wildshard/format/clientChannels';

test('provenance is granted only to an exact defining format object, without changing default wire schemas', () => {
  const old = namedJsonSchema(WorldSceneSchema);
  expect(old['$comment']).toBeUndefined();
  const marked = namedJsonSchema(WorldSceneSchema, { provenance: true });
  expect(marked['$comment']).toBe('@wildshard/format/clientChannels#WorldSceneSchema');
  const { $comment: source, ...unchanged } = marked;
  expect(unchanged).toEqual(old);
  expect(typeof source).toBe('string');
  expect(() => namedJsonSchema(v.object({}), { provenance: true })).toThrow('defining shared format root');
  const catalogue = namedFormatJsonSchemas();
  expect(catalogue[String(source)]).toEqual(marked);
  for (const [key, value] of Object.entries(catalogue)) expect(value['$comment']).toBe(key);
});
