import { starterSpearContent } from '../author-project/generators/spear';
import { emptyShardfile } from '@wildshard/sdk/author';
import { parseShardfile, type Shardfile } from '@wildshard/format/shardSchema';

/** The retained spear is ordinary item rows plus one content-addressed model file. */
export function spearExample(slug = 'spear-outpost'): { source: Shardfile; assets: ReadonlyMap<string, Uint8Array> } {
  const spear = starterSpearContent();
  const shard = emptyShardfile({ slug, name: 'Spear outpost', author: 'Example', revision: 1, seed: 435 });
  shard.items = spear.items;
  shard.files = [{ hash: spear.hash, kind: 'glb', compressed: spear.model.length, decoded: spear.cost.decoded, gpu: spear.cost.gpu, triangles: spear.cost.triangles, draws: spear.cost.draws, dependencies: [], critical: false }];
  shard.library = [spear.hash];
  shard.budgets.library = { resident: spear.cost.decoded + spear.cost.gpu, compressed: spear.model.length };
  return { source: parseShardfile(shard), assets: new Map([[spear.hash, spear.model]]) };
}
