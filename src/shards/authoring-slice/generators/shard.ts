// AUTHORING-PARITY AP7: the slice is one scene module. `wildshard build` runs this as the shard's generator (the
// shardfile back end); `wildshard watch` calls its describe() and streams the parts to a running page.
import { defineShard } from '@wildshard/sdk/scene/shard';
import { buildSlice } from './world';

export const slice = defineShard({ slug: 'authoring-slice', name: 'Authoring Slice', author: 'Wildshard', revision: 1, seed: 357 }, buildSlice);
