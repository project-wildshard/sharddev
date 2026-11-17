import { expect, test } from 'vitest';
import { BoxGeometry } from 'three';
import { ScenarioWorld } from '@wildshard/dev/test/scriptScenario';
import { slabGeometryBytes } from '@wildshard/sdk/bake/slabChunks';
import { createShardProduct } from '@wildshard/engine/game/shardfile/shardProduct';
import { hashImmutableBytes } from '@wildshard/engine/host/immutable';
import { emptyShardfile } from '@wildshard/engine/host/author';
import { fixtureJsonCheck, fixtureProductFile } from '../../sdk/test/fixtures/productFile';
import { builtProduct } from '../../sdk/test/fixtures/builtProduct';
import { TEMPLATE_BOSS, TEMPLATE_SOURCE, templateAssets } from '../../sdk/test/fixtures/templateSource';

// CI21.H5 proves the kit's public imports and actual product admission, rather
// than merely resolving paths. Invalid bytes must still reach the native check.
test('the public scenario/slab kit and fixture products retain their real boundaries', async () => {
  expect(new ScenarioWorld().snapshot()).toMatchObject({ actors: [], players: [] });
  const geometry = new BoxGeometry();
  try { expect(slabGeometryBytes(geometry)).toBeGreaterThan(0); } finally { geometry.dispose(); }
  const source = emptyShardfile({slug: 'ci21-kit', name: 'Kit', author: 'Fixture', revision: 1, seed: 1});
  const name = 'quests/finds.json';
  let checked = 0;
  const make = (input: unknown, extraRequired = false) => {
    const bytes = new TextEncoder().encode(JSON.stringify(input));
    const base = fixtureProductFile(name, {hash: hashImmutableBytes(bytes), url: '/moves'});
    const file = extraRequired ? {...base, jsonSchema: {...base.jsonSchema, required: ['missing']}} : base;
    return createShardProduct({slug: source.identity.slug, revision: 1, shardfile: source, sections: new Map(),
      files: new Map([[name, file]]), jsonCheck: (...args) => {checked++; return fixtureJsonCheck(...args);}, read: () => Promise.resolve(bytes)});
  };
  const schema = {$schema: 'http://json-schema.org/draft-07/schema#', type: 'object'};
  expect(fixtureProductFile(name, {hash: 'explicit', url: '/moves', jsonSchema: schema}).jsonSchema).toBe(schema);
  expect(await make({counters: [], sections: []}).json(name)).toEqual({counters: [], sections: []});
  await expect(make([{id: 'invalid'}]).json(name)).rejects.toThrow();
  await expect(make({counters: [], sections: []}, true).json(name)).rejects.toThrow();
  expect(checked).toBe(3);
  expect(() => builtProduct('../foreign')).toThrow('Invalid built product name');
});

test('the Template fixture admits the real producer and returns independent complete assets', () => {
  expect(TEMPLATE_SOURCE.identity.slug).toBe('template');
  const files = [...TEMPLATE_SOURCE.files.filter(file => file.kind === 'wasm'), TEMPLATE_BOSS];
  expect(files.length).toBeGreaterThan(0);
  const hashes = new Set(files.map(file => file.hash));
  const first = templateAssets(hashes), second = templateAssets(hashes);
  for (const file of files) {
    expect(first.get(file.hash)?.length).toBe(file.compressed);
    expect(second.get(file.hash)).not.toBe(first.get(file.hash));
    const bytes = first.get(file.hash);
    if (bytes === undefined) throw new Error('Missing compiled bytes');
    expect(hashImmutableBytes(bytes)).toBe(file.hash);
    const original = second.get(file.hash)?.[0];
    bytes[0] = (bytes[0] ?? 0) ^ 255;
    expect(second.get(file.hash)?.[0]).toBe(original);
  }
});
