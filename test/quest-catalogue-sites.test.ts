import { expect, test } from 'vitest';
import { floorAtRects } from '../src/shared/engine/physics/box';
import { parseItems } from '@wildshard/format/items';
import { parseQuestData } from '@wildshard/format/quests';
import { installQuestCatalogue } from '../src/client/game/shardfile/clientCatalogue';
import { createShardProduct } from '../src/shared/game/shardfile/shardProduct';
import { PINE as pine } from './fixtures/pine-program';
import { DRIFTWOOD as driftwood } from './fixtures/driftwood-program';
import { PINE_FEATS, PINE_BAG_ITEMS } from '../src/shards/pine-hollow/generators/questInventory';
import { DRIFTWOOD_FEATS, DRIFTWOOD_ITEMS } from '../src/shards/driftwood-isle/generators/questInventory';
import { timberScene } from '../src/shards/pine-hollow/generators/timberSceneContribution';
import { pineQuestSites } from '../src/shards/pine-hollow/generators/bake-timber-scenes.mjs';
import old from './fixtures/legacy-oracles/pine-hollow-log.json' with { type: 'json' };
import { PINE_SOURCES } from './fixtures/pine-sources';

const { TIMBER_MODEL_ROWS, TIMBER_PLACEMENTS } = await timberScene(PINE_SOURCES);

const sites = pineQuestSites(PINE_SOURCES);

test.each([[pine, PINE_BAG_ITEMS, PINE_FEATS], [driftwood, DRIFTWOOD_ITEMS, DRIFTWOOD_FEATS]] as const)(
  '%s registers the original catalogues through the platform sections without gameplay effects', (source, items, feats) => {
    const product = createShardProduct({ slug: source.identity.slug, revision: source.identity.revision, shardfile: source,
      sections: new Map<string, unknown>([['combat/items', { items: source.items }], ['quests/quests', { quests: source.quests }]]),
      files: new Map(), read: () => Promise.reject(new Error('Catalogue registration never reads blobs')) });
    const registered: unknown[] = [];
    installQuestCatalogue({ product, rows: { item: rows => { registered.push(rows); }, feat: rows => { registered.push(rows); } } });
    expect(registered).toEqual([items, feats]);
    expect(() => parseItems({ ...source.items, catalogue: [...items, items[0]] })).toThrow();
    expect(() => parseQuestData({ ...source.quests, achievements: [...feats, feats[0]] })).toThrow();
    const { catalogue: _catalogue, ...oldItems } = source.items;
    const { achievements: _achievements, ...oldQuests } = source.quests;
    expect(parseItems(oldItems)).toEqual(oldItems);
    expect(parseQuestData(oldQuests)).toEqual(oldQuests);
  });

test('baked hollow floor and mouths preserve the frozen live site and the rifle floor', () => {
  // The retired live site (hollowLogSite / insideHollowLog on the baked terrain.bin), frozen in fixtures/legacy-oracles/pine-hollow-log.json.
  const row = sites.hollow;
  expect(row.floorY).toBe(old.floorY); expect(row.mid).toEqual(old.mid);
  expect(row.mouths).toEqual(old.mouths);
  expect(old.inside).toHaveLength(15);
  for (const [dx = 0, dz = 0, inside] of old.inside) {
    expect(floorAtRects([row.floor], row.x + Number(dx), row.z + Number(dz), 'first')).toBe(inside === true ? old.floorY : undefined);
  }
  expect(sites.rifle).toEqual({ x: -13.139577422657654, y: 3.813097448348999, z: -36.01734305173898 });
  expect(TIMBER_PLACEMENTS.find(placement => placement.id === 'quests.hollow-log')?.piece?.floors).toEqual([row.floor]);
  const shelf = TIMBER_MODEL_ROWS.find(model => typeof model === 'object' && model !== null && 'key' in model && model.key === 'token-shelf');
  expect(shelf).toMatchObject({ assembly: 'objects', choices: [{ draws: [{ until: 28 }] }] });
});
