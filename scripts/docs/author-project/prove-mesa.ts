import { starterSpearPack, spearLoadout } from './generators/spear';
import { createCatalogue } from '@wildshard/sdk/commons/catalogue';
import { hashImmutableBytes, encodeCanonicalJson } from '@wildshard/sdk/immutable';
import {
  proveMesaNative, proveSceneClient, proveEquippedItemClient,
  type AuthorProofPage, type MesaProofPlan,
} from '@wildshard/engine/host/headless';
import type { Shardfile } from '@wildshard/format/shardSchema';

/** Every Mesa gate is mandatory; declarations, placeholders and a pre-lit beacon cannot pass. */
export async function proveMesaOutpost(
  shard: Shardfile,
  assets: ReadonlyMap<string, Uint8Array>,
  page: AuthorProofPage,
  plan: MesaProofPlan,
) {
  const built = createCatalogue([
    starterSpearPack({ credit: 'Wildshard starter spear generator', licence: 'First-party' }),
  ]);
  const loadout = spearLoadout(built), spear = loadout.rows[0];
  const declared = shard.items.rows.find(row => row.id === spear?.id);
  if (spear === undefined || shard.items.loadout.primary !== spear.id
    || encodeCanonicalJson(declared) !== encodeCanonicalJson(spear)) {
    throw new Error('Equip the exact commons spear profile');
  }
  for (const entry of built.catalogue.entries) {
    const ref = `commons:${entry.hash}`, bytes = assets.get(ref);
    if (bytes === undefined || hashImmutableBytes(bytes) !== entry.hash
      || !shard.requires.commons.includes(entry.hash) || !shard.library.includes(ref)) {
      throw new Error(`Missing commons spear catalogue closure: ${entry.id}`);
    }
  }
  const native = await proveMesaNative(shard, assets, plan);
  const scene = await proveSceneClient(page, {
    creatures: [...plan.goats, plan.hawk], selectedInteraction: plan.beacon,
  });
  const equipped = await proveEquippedItemClient(page, spear.id, spear.view.asset ?? '');
  return {
    version: 1 as const, pass: true as const, native, scene, equipped,
    catalogue: built.catalogue.entries.map(entry => ({
      id: entry.id, hash: entry.hash, packVersion: entry.packVersion,
    })),
  };
}
