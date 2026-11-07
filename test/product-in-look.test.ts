import { describe, expect, test } from 'vitest';
import type { LookStrategy } from '@wildshard/engine/render/look';
import type { RosterEntry } from '@wildshard/engine/models/live';
import { toLevelSpec } from '../src/client/game/shard/spec';
import type { ShardManifest } from '@wildshard/engine/game/shard/manifest';
import { createShardProduct, ProductError, type ShardProduct } from '@wildshard/engine/game/shardfile/shardProduct';
import { emptyShardfile } from '../src/sharddev/author';
import type { ProjectOutput } from '../src/sharddev/projectOutput';
import { output as driftwoodOutput } from '../src/shards/driftwood-isle/generators/output';
import { PINE_PREPARED_OUTPUT as pineOutput } from './fixtures/pine-program';
import { MANIFEST as driftwood } from '../src/shards/driftwood-isle/discovery.generated';
import { MANIFEST as pine } from '../src/shards/pine-hollow/discovery.generated';
import * as v from 'valibot';
import { defineNamedRows } from '../src/sharddev/formatJsonSchema';
import { encodeCanonicalJson } from '../src/sdk/immutable';
import { enemyPlacements } from '../src/shards/driftwood-isle/generators/enemyPlacement';
import { EnemyPlacementsSchema } from '../src/shards/driftwood-isle/generators/sections';
import { cabinAmbienceRows } from '../src/shards/pine-hollow/generators/ambience';
import { CabinAmbienceSchema } from '../src/shards/pine-hollow/generators/sections';
import { PINE_SOURCES } from './fixtures/pine-sources';
import { ForestPageSchema } from '@wildshard/format/forestPage';

type LookOutput = Pick<ProjectOutput, 'platform' | 'namedFiles' | 'assets'>;
const outputs = new Map<string, LookOutput>([['driftwood-isle', driftwoodOutput], ['pine-hollow', pineOutput]]);
const outputOf = (slug: string): LookOutput => {
  const output = outputs.get(slug);
  if (output === undefined) throw new Error(`Missing look fixture: ${slug}`);
  return output;
};

// progress/shard-platform/product-in-look-o272: the game binds the shard's loaded product into the look and roster loaders
// it hands the engine; the engine's LevelSpec keeps plain zero-argument loaders.
// Platform look rows come from the shard's emitted output.
const emittedSections = (slug: string): Map<string, unknown> => {
  const output = outputOf(slug);
  const sections = new Map<string, unknown>();
  for (const group of [output.platform]) for (const row of group?.sections ?? []) {
    const bytes = group?.files.get(row.path);
    if (bytes !== undefined) sections.set(row.name, JSON.parse(new TextDecoder().decode(bytes)));
  }
  return sections;
};
const productOf = (slug: string): ShardProduct => {
  const sections = emittedSections(slug);
  // This fixture observes product forwarding, with no native specimen roster.
  sections.delete('explore/catalogue');
  return createShardProduct({ slug, revision: 1,
    shardfile: emptyShardfile({ slug, name: slug, author: 'Wildshard', revision: 1, seed: 1 }),
    sections, files: new Map(), read: () => Promise.reject(new Error('no files in this fixture')) });
};

test.each([
  { slug: 'driftwood-isle', section: 'custom/enemyPlacements', name: 'sim/enemy-placement.json',
    original: () => defineNamedRows(EnemyPlacementsSchema).parse(enemyPlacements()) },
])('$slug $name retains the original defining payload exactly', ({ slug, section, name, original }) => {
  const output = outputOf(slug);
  const named = output.namedFiles?.find(row => row.name === name);
  const namedBytes = named === undefined ? undefined : output.assets?.get(named.hash);
  if (namedBytes === undefined) throw new Error('Missing emitted content');
  const decoded: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(namedBytes));
  const expected = original();
  expect(decoded).toEqual(expected);
  expect(namedBytes).toEqual(new TextEncoder().encode(encodeCanonicalJson(expected)));
  expect(output.platform?.sections.some(row => row.name === section)).toBe(false);
}, 30_000);

test('Pine forwards the complete admitted forest page with the original native audio rows', () => {
  const output = outputOf('pine-hollow');
  const file = output.namedFiles?.find(row => row.name === 'world/forest-page.json');
  const bytes = file === undefined ? undefined : output.assets?.get(file.hash);
  if (bytes === undefined) throw new Error('Missing emitted live forest page');
  const forest = v.parse(ForestPageSchema, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  const original = v.parse(CabinAmbienceSchema, cabinAmbienceRows(PINE_SOURCES));
  expect(encodeCanonicalJson({ floors: forest.buildings.floors, firePits: forest.buildings.firePits })).toBe(encodeCanonicalJson(original));
  expect(Object.hasOwn(output, 'custom')).toBe(false);
  expect(output.namedFiles?.some(row => row.name === 'world/ambience.json')).toBe(false);
}, 30_000);

describe('toLevelSpec binds the product', () => {
  const seen: { look: ShardProduct | null; roster: ShardProduct | null } = { look: null, roster: null };
  const manifest: ShardManifest = { ...driftwood,
    render: (product) => { seen.look = product; return Promise.resolve<LookStrategy>({ compose: () => ({}) }); },
    roster: (product) => { seen.roster = product; return Promise.resolve<readonly RosterEntry[]>([]); } };

  test('the look and roster loaders get the loaded product', async () => {
    const product = productOf(driftwood.slug), spec = toLevelSpec(manifest, product);
    await spec.look?.(); await spec.roster?.();
    expect(seen.look).toBe(product); expect(seen.roster).toBe(product);
  }, 60000);

  test('without a product they get an absent one whose reads refuse', async () => {
    const spec = toLevelSpec(manifest);
    await spec.look?.();
    expect(seen.look?.has('quests/quests')).toBe(false);
    expect(() => seen.look?.shardfile).toThrow(ProductError);
  });
});

describe('Driftwood and Pine looks read the product, not shard.config', () => {
  for (const manifest of [driftwood, pine]) test(`${manifest.slug} builds its look from product sections`, async () => {
    const product = productOf(manifest.slug);
    let reads = 0;
    const counted = new Proxy(product, { get(target, key, receiver): unknown {
      if (key === 'section') reads += 1;
      return Reflect.get(target, key, receiver);
    } });
    const look = await toLevelSpec(manifest, counted).look?.();
    expect(look?.backdrop).toBeTypeOf('function');
    expect(reads).toBeGreaterThan(0);
    await expect(toLevelSpec(manifest).look?.()).rejects.toThrow(ProductError);
  }, 60000);

});
