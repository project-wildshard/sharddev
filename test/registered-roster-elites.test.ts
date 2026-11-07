// oxlint-disable-next-line import/no-nodejs-modules -- Verify actual admitted product bodies without rebuilding them.
import { readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the admitted product member path only.
import { join } from 'node:path';
import { expect, test } from 'vitest';
import * as v from 'valibot';
import { NativePopulationRowsSchema, parseNativePopulationRows } from '@wildshard/format/populationRoster';
import { EliteFeatureSchema, parseEliteFeature } from '@wildshard/format/eliteFeature';
import { REGISTERED_JSON, validateRegisteredJson } from '@wildshard/format/registeredJson';
import { namedJsonSchema, namedFormatJsonSchema, registeredJsonSchema } from '@wildshard/sharddev/formatJsonSchema';
import { encodeCanonicalJson, hashImmutableBytes } from '@wildshard/engine/host/immutable';
import { nameBlob } from '@wildshard/sharddev/blobs';
import { emptyShardfile } from '@wildshard/sharddev/author';
import { createShardProduct } from '@wildshard/engine/game/shardfile/shardProduct';
import { readBuiltShardfile } from '../scripts/build-shardfiles.mjs';

const folder = readBuiltShardfile(process.cwd(), 'pine-hollow');
const index = v.parse(v.object({ files: v.array(v.object({ name: v.exactOptional(v.string()), path: v.string(), hash: v.string() })) }), JSON.parse(readFileSync(join(folder, 'shard.json'), 'utf8')));
const names = ['actors/roster.json', 'actors/elites.json'] as const;
const documents = names.map(name => {
  const row = index.files.find(file => file.name === name);
  if (row === undefined) throw new Error(`Missing admitted native document ${name}`);
  const bytes = new Uint8Array(readFileSync(join(folder, row.path)));
  if (hashImmutableBytes(bytes) !== row.hash) throw new Error('Native document body differs from its admitted hash');
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  return { name, bytes, value };
});
const roster = documents[0], elites = documents[1];
if (roster === undefined || elites === undefined) throw new Error('Missing complete population documents');

for (const document of documents) test(`${document.name} retains the complete native root and exact authored bytes`, () => {
  const contract = REGISTERED_JSON[document.name];
  const oldWire = document.name === names[0] ? namedFormatJsonSchema('populationRoster.NativePopulationRows') : namedJsonSchema(EliteFeatureSchema);
  expect(contract.schema).toBe(document.name === names[0] ? NativePopulationRowsSchema : EliteFeatureSchema);
  expect(registeredJsonSchema(document.name)).toEqual({ ...oldWire, $comment: contract.source });
  validateRegisteredJson(document.name, document.value);
  expect(new TextEncoder().encode(encodeCanonicalJson(document.value))).toEqual(document.bytes);
  expect(nameBlob(document.name, 'json', document.bytes, { jsonSchema: registeredJsonSchema(document.name) }).bytes).toEqual(document.bytes);
});

test('registered roster admission keeps cross-row bounds beyond the structural schema', () => {
  const rows = parseNativePopulationRows(roster.value);
  const invalid = { ...rows, bodyCount: rows.limit + 1 };
  expect(() => v.parse(NativePopulationRowsSchema, invalid)).not.toThrow();
  expect(() => parseNativePopulationRows(invalid)).toThrow('native population row bounds');
  expect(() => validateRegisteredJson(names[0], invalid)).toThrow('native population row bounds');
});

test('registered elites retain identity, slot and complete spawn-program checks', () => {
  const rows = parseEliteFeature(elites.value), first = rows.fights[0];
  if (first === undefined) throw new Error('Missing actual elite');
  const cases = [
    { ...rows, bounds: [rows.bounds[1], rows.bounds[0], rows.bounds[2], rows.bounds[3]] },
    { ...rows, fights: [...rows.fights, first] },
    { ...rows, fights: [{ ...first, main: 'missing-slot' }, ...rows.fights.slice(1)] },
    { ...rows, fights: [{ ...first, program: {} }, ...rows.fights.slice(1)] },
  ];
  for (const invalid of cases) {
    // These structurally accepted values must still reach the full parser.
    expect(() => v.parse(EliteFeatureSchema, invalid)).not.toThrow();
    expect(() => parseEliteFeature(invalid)).toThrow();
    expect(() => validateRegisteredJson(names[1], invalid)).toThrow();
  }
});

test('missing or foreign provenance refuses before a population or elite program is read', async () => {
  const identity = { slug: 'population-actors', name: 'Population documents', author: 'Test', revision: 1, seed: 357 };
  for (const name of names) for (const jsonSchema of [undefined, {}, { $comment: 'foreign' }]) {
    let reads = 0;
    const product = createShardProduct({ slug: identity.slug, revision: 1, shardfile: emptyShardfile(identity), sections: new Map(), builtJson: true,
      files: new Map([[name, { hash: 'a'.repeat(64), url: 'https://example.test/population', ...(jsonSchema === undefined ? {} : { jsonSchema }) }]]),
      read: () => { reads++; return Promise.reject(new Error('No population read permitted')); } });
    await expect(product.json(name)).rejects.toThrow('unregistered named JSON is retired');
    expect(reads).toBe(0);
  }
});
