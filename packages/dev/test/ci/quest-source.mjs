// Independent original author leaves, never a copied product snapshot.
import {parseShardfileField} from '@wildshard/format/shardSchema';
import template from '../../../sdk/src/shards/_template/data/quests.json' with {type:'json'};
import hermit from '../../../sdk/src/shards/_template/data/npcs/hermit.json' with {type:'json'};
import pastel from '../../../sdk/src/shards/pastel-plain/data/quests.json' with {type:'json'};
import ink from '../../../sdk/src/shards/ink-cel-valley/data/quests.json' with {type:'json'};
// Mossgate keeps one file per NPC (J361): each data/npcs/<name>.json adds its dialogue to the quests.
const sources={'_template':{...template,dialogue:[...template.dialogue,hermit.npc.dialogue]},'pastel-plain':pastel,'ink-cel-valley':ink};
export function questSource(slug){return parseShardfileField('quests',sources[slug]);}
