import { starterSpearPack, spearLoadout } from '../author-project/generators/spear';
import { createCatalogue, catalogueRef } from '@wildshard/sdk/commons/catalogue';
import { commonsRequirements, type BuiltCommons } from '@wildshard/sdk/commons';
import { emptyShardfile } from '@wildshard/sdk/author';
import { parseShardfile, type Shardfile } from '@wildshard/engine/host/shardfile';

/** An equipped commons spear: its retained generator, exact asset/contact closure and ordinary author client. */
export function spearExample(slug = 'spear-outpost'): { source: Shardfile; built: BuiltCommons; model: ReturnType<typeof catalogueRef>; contacts: ReturnType<typeof catalogueRef> } {
  const built = createCatalogue([starterSpearPack({ credit: 'Wildshard starter spear generator', licence: 'First-party' })]);
  const model = catalogueRef(built.catalogue, 'starter-spear/model');
  const contacts = catalogueRef(built.catalogue, 'starter-spear/contacts');
  const shard = emptyShardfile({ slug, name: 'Spear outpost', author: 'Example', revision: 1, seed: 435 });
  shard.requires = { ...shard.requires, ...commonsRequirements(built, [model.entry.id, contacts.entry.id]) };
  shard.library = [model.ref, contacts.ref];
  shard.items = spearLoadout(built);
  return { source: parseShardfile(shard), built, model, contacts };
}
