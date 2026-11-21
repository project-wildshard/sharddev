// Independent original author leaves, never a copied product snapshot.
import {parseShardfileField} from '@wildshard/format/shardSchema';
import pastel from '../../../sdk/src/shards/pastel-plain/data/quests.json' with {type:'json'};
import ink from '../../../sdk/src/shards/ink-cel-valley/data/quests.json' with {type:'json'};
const sources={'pastel-plain':pastel,'ink-cel-valley':ink};
/** TEMPLATE-E2E TR-11 (J434): Mossgate, which took the retired Template's quests, is TypeScript source: its authored
 * section is `generators/quests.ts`' QUESTS, and its scene adds the region triggers (and their flags) itself, so a
 * Mossgate product holds the authored rows plus the scene's. Load the engine's sim-node-loader first. */
export const SCENE_TRIGGERS=new Set(['mossgate']);
export async function questSource(slug){
  // MZ16: "The lay of the Hollow" reads every place's flag, and the places' region triggers declare them in the scene, so
  // the authored section alone admits only with those flags added
  if(slug==='mossgate'){
    const {QUESTS}=await import('../../../sdk/src/shards/mossgate/generators/quests.ts');
    const {PLACE_FLAGS}=await import('../../../sdk/src/shards/mossgate/generators/places.ts');
    const {mossgate}=await import('../../../sdk/src/shards/mossgate/generators/shard.ts');
    const {withLandings}=await import('../../../sdk/src/sharddev/scene/landing.ts');
    // MZ23 adds authored scene beats to the leaf quests before they reach the product.
    const landings=mossgate.describe().anchored.landings ?? [];
    return parseShardfileField('quests',{...QUESTS,quests:withLandings(QUESTS.quests,landings),flags:[...new Set([...QUESTS.flags,...PLACE_FLAGS])]});
  }
  return parseShardfileField('quests',sources[slug]);
}
