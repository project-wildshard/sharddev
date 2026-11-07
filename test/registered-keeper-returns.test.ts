import keeperFixture from '../src/shards/driftwood-isle/data/nativeKeeper.json' with { type: 'json' };
// oxlint-disable-next-line import/no-nodejs-modules -- Verify actual admitted product bodies without rebuilding them.
import { readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the admitted product member path only.
import { join } from 'node:path';
import { expect, test } from 'vitest';
import * as v from 'valibot';
import { PopulationKeeperRowsSchema } from '@wildshard/format/populationKeeper';
import { PageReturnRowsSchema } from '@wildshard/format/namedJsonContracts';
import { REGISTERED_JSON, validateRegisteredJson } from '@wildshard/format/registeredJson';
import { namedJsonSchema, namedFormatJsonSchema, registeredJsonSchema } from '@wildshard/sharddev/formatJsonSchema';
import { encodeCanonicalJson, hashImmutableBytes } from '@wildshard/engine/host/immutable';
import { nameBlob } from '@wildshard/sharddev/blobs';
import { emptyShardfile } from '@wildshard/sharddev/author';
import { createShardProduct } from '@wildshard/engine/game/shardfile/shardProduct';
import { readBuiltShardfile } from '../scripts/build-shardfiles.mjs';

const folder = readBuiltShardfile(process.cwd(), 'driftwood-isle');
const index = v.parse(v.object({ files: v.array(v.object({ name: v.exactOptional(v.string()), path: v.string(), hash: v.string() })) }), JSON.parse(readFileSync(join(folder, 'shard.json'), 'utf8')));
const names = ['sim/keeper.json', 'sim/returns.json'] as const;
const documents = names.map(name => {
  if(name === names[0])return {name,bytes:new TextEncoder().encode(encodeCanonicalJson(keeperFixture)),value:keeperFixture};
  const row = index.files.find(file => file.name === name);
  if (row === undefined) throw new Error(`Missing admitted native document ${name}`);
  const bytes = new Uint8Array(readFileSync(join(folder, row.path)));
  if (hashImmutableBytes(bytes) !== row.hash) throw new Error('Native document body differs from its admitted hash');
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  return { name, bytes, value };
});
const keeper = documents[0], returns = documents[1];
if (keeper === undefined || returns === undefined) throw new Error('Missing complete population documents');

test('the fixture-only keeper is absent from shipping files and retains every original byte',()=>{
  expect(index.files.some(file=>file.name===names[0])).toBe(false);
  expect(keeper.bytes).toHaveLength(15874);
  expect(hashImmutableBytes(keeper.bytes)).toBe('126875a57f29fd0c563be7ac06f58171e45cb1325c65b13273b57dffc78123c6');
});

for (const document of documents) test(`${document.name} retains the complete native root and exact authored bytes`, () => {
  const contract = REGISTERED_JSON[document.name];
  const oldWire = document.name === names[0] ? namedFormatJsonSchema('populationKeeper.PopulationKeeperRows') : namedJsonSchema(PageReturnRowsSchema);
  expect(contract.schema).toBe(document.name === names[0] ? PopulationKeeperRowsSchema : PageReturnRowsSchema);
  expect(registeredJsonSchema(document.name)).toEqual({ ...oldWire, $comment: contract.source });
  validateRegisteredJson(document.name, document.value);
  expect(new TextEncoder().encode(encodeCanonicalJson(document.value))).toEqual(document.bytes);
  expect(nameBlob(document.name, 'json', document.bytes, { jsonSchema: registeredJsonSchema(document.name) }).bytes).toEqual(document.bytes);
});

test('keeper body phase and return queue envelope keep their native refusals', () => {
  const a = v.parse(PopulationKeeperRowsSchema, keeper.value), b = v.parse(PageReturnRowsSchema, returns.value);
  const invalidKeeper = { ...a, bodyPhase: { ...a.bodyPhase, animateWithin: -1 } };
  const invalidReturns = { ...b, outOfSight: -1 };
  expect(() => validateRegisteredJson(names[0], invalidKeeper)).toThrow();
  expect(() => validateRegisteredJson(names[1], invalidReturns)).toThrow();
  for (const document of documents) {
    const value = document.name === names[0] ? a : b;
    // Program admission remains with the unchanged ReturnProgram owner; its
    // existing envelope field is intentionally unknown at this schema layer.
    for (const key of Object.keys(value).filter(field => document.name !== names[1] || field !== 'program')) {
      const missing: Record<string, unknown> = { ...value }; delete missing[key];
      expect(() => validateRegisteredJson(document.name, missing)).toThrow();
    }
  }
});

test('missing or foreign provenance refuses before a keeper or return program is read', async () => {
  const identity = { slug: 'population-documents', name: 'Population documents', author: 'Test', revision: 1, seed: 357 };
  for (const name of names) for (const jsonSchema of [undefined, {}, { $comment: 'foreign' }]) {
    let reads = 0;
    const product = createShardProduct({ slug: identity.slug, revision: 1, shardfile: emptyShardfile(identity), sections: new Map(), builtJson: true,
      files: new Map([[name, { hash: 'a'.repeat(64), url: 'https://example.test/population', ...(jsonSchema === undefined ? {} : { jsonSchema }) }]]),
      read: () => { reads++; return Promise.reject(new Error('No population read permitted')); } });
    await expect(product.json(name)).rejects.toThrow('unregistered named JSON is retired');
    expect(reads).toBe(0);
  }
});
