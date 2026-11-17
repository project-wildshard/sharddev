// SHARD-SOURCE AP15: Mossgate Hollow whole, as one scene module. `wildshard build` runs this as the shard's generator (the
// shardfile back end); `wildshard watch` calls its describe() and streams the parts to a running page.
import { defineShard } from '@wildshard/sdk/scene/shard';
import { buildMossgate } from './world';

export const mossgate = defineShard({ slug: 'mossgate', name: 'Mossgate Hollow', author: 'Wildshard', revision: 1, seed: 357 }, buildMossgate);
