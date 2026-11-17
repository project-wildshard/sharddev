import { expect, test } from 'vitest';
import { parseShardfile } from '@wildshard/format/shardSchema';
import { emptyShardfile } from './author';

const fixture = () => emptyShardfile({ slug: 'preflight-test', name: 'Preflight', author: 'Test', revision: 1, seed: 1 });

test('shardfile admission still checks changed raw values on each call', () => {
  const input = fixture(), admitted = parseShardfile(input);
  expect(admitted).toEqual(input);
  expect(admitted).not.toBe(input);
  input.identity.name = '';
  expect(() => parseShardfile(input)).toThrow();
  input.identity.name = 'Again';
  expect(parseShardfile(input).identity.name).toBe('Again');
  input.entryways[0] = { edge: 'north', at: [0, 1, 250], width: 8 };
  expect(() => parseShardfile(input)).toThrow('entryways must be unique edge midpoints at road height y=0');
});

test('the preflight JSON boundary retains canonical, descriptor and cycle refusals', () => {
  const source = fixture(), sparse: unknown[] = [];
  sparse.length = 2;
  const cycle: Record<string, unknown> = {}; cycle['self'] = cycle;
  const hidden = Object.defineProperty({}, 'hidden', { value: 1 });
  const symbolic = { [Symbol('extra')]: 1 };
  let reads = 0;
  const accessor = Object.defineProperty({}, 'value', { enumerable: true, get: () => { reads++; return 1; } });
  for (const bad of [-0, Infinity, Number.NaN, undefined, sparse, cycle, hidden, symbolic, accessor]) {
    expect(() => parseShardfile({ ...source, extra: bad })).toThrow('carries JSON data only');
  }
  const entryGetter = Object.defineProperty({ ...source }, 'entryways', { enumerable: true, get: () => { reads++; return source.entryways; } });
  expect(() => parseShardfile(entryGetter)).toThrow('carries JSON data only');
  expect(reads).toBe(0);
});

test('node, depth, spatial and required-entry limits still refuse before field admission', () => {
  const source = fixture();
  expect(() => parseShardfile({ ...source, extra: Array.from({ length: 100000 }, () => 0) })).toThrow('limit 100000');
  let nested: unknown = 0;
  for (let depth = 0; depth < 65; depth++) nested = [nested];
  expect(() => parseShardfile({ ...source, extra: nested })).toThrow('carries JSON data only');
  expect(() => parseShardfile({ ...source, extra: { min: [0, 0, 0], max: [251, 1, 1] } })).toThrow('manifest admission limits');
  Reflect.deleteProperty(source, 'entryways');
  expect(() => parseShardfile(source)).toThrow('four midpoint entryways are required');
});
