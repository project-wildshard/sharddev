import type { ScriptContract } from '@wildshard/format/scriptContract';
import { assetCost as cost, assetOverdraw as raster, parseAudio as audio, parseGlb as glb, prepareAssetDecoders, type AssetCost as Cost } from '@wildshard/format/product';
import { parseKtx2 as ktx2 } from '@wildshard/format/ktx2Cost';

// Author-only facade: keep synchronous cost APIs ready without suspending app modules.
await prepareAssetDecoders();

/** Actual parsed residency and draw costs, independent of author declarations. */
export type AssetCost = Cost;
/** Admit a self-contained GLB and derive its geometry and instance costs. */
export function parseGlb(bytes: Uint8Array): Cost { return glb(bytes); }
/** Admit bounded KTX2 mip ranges and conservative transcode residency. */
export function parseKtx2(bytes: Uint8Array): Cost { return ktx2(bytes); }
/** Admit bounded PCM WAV or indexed 48 kHz stereo AAC-LC and derive decoded sample residency. */
export function parseAudio(bytes: Uint8Array): Cost { return audio(bytes); }
/** Select the game's shared asset parser for CLI and browser admission. */
export function assetCost(kind: string, bytes: Uint8Array, script?: ScriptContract): Cost { return cost(kind, bytes, script); }
/** Advisory raster layers from actual geometry and material alpha modes, before culling or occlusion. */
export type OverdrawEstimate = ReturnType<typeof raster>;
/** Derive the shared conservative raster estimate without accepting an author-supplied number. */
export function assetOverdraw(kind: string, bytes: Uint8Array, script?: ScriptContract): OverdrawEstimate { return raster(kind, bytes, script); }
