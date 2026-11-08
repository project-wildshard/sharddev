// Independent original author leaves, never a copied product snapshot.
import {parseShardfileField} from '@wildshard/engine/host/shardfile';
import template from '../../src/shards/_template/data/quests.json' with {type:'json'};
import pastel from '../../src/shards/pastel-plain/data/quests.json' with {type:'json'};
import ink from '../../src/shards/ink-cel-valley/data/quests.json' with {type:'json'};
const sources={'_template':template,'pastel-plain':pastel,'ink-cel-valley':ink};
export function questSource(slug){return parseShardfileField('quests',sources[slug]);}
