import type { ShardManifest } from '@wildshard/engine/game/shard/manifest';
import type { BakedGrid } from '@wildshard/engine/world/BakedTerrain';
/** Prepare exact scalar bytes from the project or its declared public assets before native queries. */
export function prepareNativeScalarBlocks(def: ShardManifest, root: string): void;
/** Preconfigure live samplers from original native bytes before authored terrain/forest/model construction. */
export function prepareNativeTerrain(def: ShardManifest, options: { root: string; bytes: Uint8Array }): Promise<BakedGrid>;
