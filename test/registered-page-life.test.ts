import { expect, test } from 'vitest';
import { REGISTERED_JSON, validateRegisteredJson } from '@wildshard/format/registeredJson';
import { PageLifeSchema, parsePageLife } from '@wildshard/format/pageLife';
import { registeredJsonSchema, namedJsonSchema } from '@wildshard/sharddev/formatJsonSchema';
import { encodeCanonicalJson } from '@wildshard/engine/host/immutable';
import { nameBlob } from '@wildshard/sharddev/blobs';
import { emptyShardfile } from '@wildshard/sharddev/author';
import { createShardProduct } from '@wildshard/engine/game/shardfile/shardProduct';
import { PAGE_LIFE as coast } from '../src/shards/driftwood-isle/generators/pageLife';
import { PAGE_LIFE as forest } from '../src/shards/pine-hollow/generators/pageLife';
import { fixtureJsonCheck } from './fixtures/productFile';

const name = 'actors/page-life.json';
const source = '@wildshard/format/pageLife#PageLifeSchema';
const encode = (value: unknown) => new TextEncoder().encode(encodeCanonicalJson(value));
const identity = { slug: 'life-contract', name: 'Life contract', author: 'Test', revision: 1, seed: 1 };

test('both actual page-life users keep their original rows and native defining contract', () => {
  expect(REGISTERED_JSON[name].schema).toBe(PageLifeSchema);
  expect(REGISTERED_JSON[name].source).toBe(source);
  const schema = registeredJsonSchema(name);
  expect(schema).toEqual({ ...namedJsonSchema(PageLifeSchema), $comment: source });
  for (const rows of [coast, forest]) {
    const before = encode(rows);
    expect(parsePageLife(rows)).toEqual(rows);
    validateRegisteredJson(name, rows);
    expect(nameBlob(name, 'json', before, { jsonSchema: schema }).bytes).toEqual(before);
    expect(encode(rows)).toEqual(before);
  }
});

test('registration keeps native cross-row ownership refusals beyond structural JSON validation', async () => {
  const first = coast.flocks[0];
  if (first === undefined) throw new Error('Missing original borrowed flock');
  const invalid = [
    { ...coast, flocks: [...coast.flocks, first] },
    { ...coast, flocks: [{ ...first, packed: true, borrowed: true }] },
    Object.fromEntries(Object.entries(forest).filter(([key]) => key !== 'program')),
  ];
  for (const value of invalid) {
    expect(() => parsePageLife(value)).toThrow('Invalid ambient ownership rows');
    expect(() => validateRegisteredJson(name, value)).toThrow('Invalid ambient ownership rows');
    expect(() => nameBlob(name, 'json', encode(value), { jsonSchema: registeredJsonSchema(name) })).toThrow();
    const product = createShardProduct({
      slug: identity.slug, revision: 1, shardfile: emptyShardfile(identity), sections: new Map(),
      files: new Map([[name, { hash: 'a'.repeat(64), url: 'https://example.test/life', jsonSchema: registeredJsonSchema(name) }]]),
      read: () => Promise.resolve(encode(value)), jsonCheck: fixtureJsonCheck,
    });
    await expect(product.json(name)).rejects.toThrow('Invalid ambient ownership rows');
  }
});

test('missing or foreign metadata refuses before any page-life bytes are read', async () => {
  for (const schema of [undefined, {}, { $comment: 'foreign' }]) {
    let reads = 0;
    const product = createShardProduct({
      slug: identity.slug, revision: 1, shardfile: emptyShardfile(identity), sections: new Map(),
      files: new Map([[name, { hash: 'a'.repeat(64), url: 'https://example.test/life', ...(schema === undefined ? {} : { jsonSchema: schema }) }]]),
      read: () => { reads++; return Promise.resolve(encode(coast)); }, builtJson: true,
    });
    await expect(product.json(name)).rejects.toThrow('unregistered named JSON is retired');
    expect(reads).toBe(0);
  }
  const permissive = { $schema: 'http://json-schema.org/draft-07/schema#', $comment: source, type: 'object' };
  expect(() => nameBlob(name, 'json', encode(coast), { jsonSchema: permissive })).toThrow('exact defining format contract');
});
