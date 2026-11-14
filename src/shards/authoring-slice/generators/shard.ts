// AUTHORING-PARITY AP7: the slice is one scene module. `wildshard build` runs this as the shard's generator (the
// shardfile back end); `wildshard watch` calls its describe() and streams the parts to a running page.
import { defineShard } from '@wildshard/sdk/scene/shard';
import { buildSlice } from './world';

/** SHARD-SOURCE AP19: one quest, so a gameplay edit has something to show (`proof.mjs --edit quest` rewrites its objective). */
export const SLICE_QUESTS = {
  flags: ['slice.pond', 'slice.walk'], triggers: [{ id: 'slice.pond', kind: 'region' as const, flag: 'slice.pond', x: -10.4, z: 0.3, radius: 4 }], dialogue: [],
  quests: [{ id: 'slice.walk', title: 'A walk to the pond', completeFlag: 'slice.walk',
    steps: [{ id: 'pond', objective: 'Walk down to the pond', done: { all: ['slice.pond'] } }] }],
};

export const slice = defineShard({ slug: 'authoring-slice', name: 'Authoring Slice', author: 'Wildshard', revision: 1, seed: 357 }, buildSlice,
  { extend: (shard) => ({ ...shard, quests: SLICE_QUESTS }) });
