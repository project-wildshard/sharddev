// SHARD-SOURCE AP15: Mossgate Hollow whole, as one scene module. `wildshard build` runs this as the shard's generator (the
// shardfile back end); `wildshard watch` calls its describe() and streams the parts to a running page. TEMPLATE-E2E TR-12:
// the scene carries the Template's gameplay (play.ts) and `extend` adds its quests, talks and rack (gameplay.ts). TR-12b:
// the Barrow Warden's decision script (`behaviour/warden.as`) is the one `decisions` row.
import { defineShard } from '@wildshard/sdk/scene/shard';
import { DECISIONS } from './fights';
import { gameplay } from './gameplay';
import { buildHollow } from './play';

export const mossgate = defineShard({ slug: 'mossgate', name: 'Mossgate Hollow', author: 'Wildshard', revision: 1, seed: 357 }, buildHollow,
  { extend: gameplay, decisions: DECISIONS });
