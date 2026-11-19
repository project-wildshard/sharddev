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
  if(slug==='mossgate')return parseShardfileField('quests',(await import('../../../sdk/src/shards/mossgate/generators/quests.ts')).QUESTS);
  return parseShardfileField('quests',sources[slug]);
}
