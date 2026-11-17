import { starterSpearContent } from './generators/spear';
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
  const content = starterSpearContent(), spear = content.items.rows[0];
  const declared = shard.items.rows.find(row => row.id === spear?.id);
  if (spear === undefined || shard.items.loadout.primary !== spear.id
    || encodeCanonicalJson(declared) !== encodeCanonicalJson(spear)) {
    throw new Error('Equip the exact spear profile');
  }
  const bytes = assets.get(content.hash);
  if (bytes === undefined || hashImmutableBytes(bytes) !== content.hash
    || !shard.files.some(file => file.hash === content.hash) || !shard.library.includes(content.hash)) {
    throw new Error('Missing spear model file closure');
  }
  const native = await proveMesaNative(shard, assets, plan);
  const scene = await proveSceneClient(page, {
    creatures: [...plan.goats, plan.hawk], selectedInteraction: plan.beacon,
  });
  const equipped = await proveEquippedItemClient(page, spear.id, spear.view.asset ?? '');
  return {
    version: 1 as const, pass: true as const, native, scene, equipped,
    model: { hash: content.hash, bytes: content.model.length },
  };
}
