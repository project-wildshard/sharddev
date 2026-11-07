// oxlint-disable-next-line import/no-nodejs-modules -- Author builds emit immutable product files.
import { mkdirSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The caller supplies its owned output directory.
import { resolve } from 'node:path';
import type { ScriptAdmissionRows } from '@wildshard/format/scriptContract';
import { parseShardfile, type Shardfile } from '@wildshard/format/shardSchema';
import { admitShardfileProduct, assertProductTargets as assertTargets } from '@wildshard/format/productValidation';
import { offlineMemoryAdmission, prepareAssetDecoders } from '@wildshard/format/product';
import { validationRevision, validationSourceBytes } from '@wildshard/format/validationReceipt';
import { preflightDeclaredCosts } from '@wildshard/format/assetAdmission';
import { encodeCanonicalJson, hashImmutableBytes } from '@wildshard/engine/host/immutable';
import { hashAssetBytes } from './assetHandle';

// Author-only facade: direct synchronous writers need the same readiness as the CLI.
await prepareAssetDecoders();

/** Refuse the same target overages as the author CLI; warning policy belongs only to trusted checkout callers. */
export function assertProductTargets(source: Shardfile, policy: 'warn' | 'refuse'): void {
  // Execution has not run yet; report only the targets actually checked.
  assertTargets(source, policy);
}

/** Each product admitProduct returned: the assets map, policy and script rows it was admitted with, and its exact JSON then
 *  (by object identity only: a different object, even an equal one, is admitted in full) */
const admitted = new WeakMap<object, { readonly assets: ReadonlyMap<string, Uint8Array>; readonly policy: 'warn' | 'refuse'; readonly scripts: string; readonly snapshot: string }>();

/** Admit declared costs and actual immutable bytes through the browser's defining contracts, without a config loader. */
export function admitProduct(input: unknown, assets: ReadonlyMap<string, Uint8Array>, policy: 'warn' | 'refuse' = 'refuse', scripts: ScriptAdmissionRows = []): Shardfile {
  const product = admitShardfileProduct(input, assets, hashAssetBytes, policy, scripts);
  rememberAdmitted(product, assets, policy, scripts);
  return product;
}

/** Record a product format validation just admitted, so a writer handed that same object does not admit it twice. */
export function rememberAdmitted(product: Shardfile, assets: ReadonlyMap<string, Uint8Array>, policy: 'warn' | 'refuse', scripts: ScriptAdmissionRows): void {
  admitted.set(product, { assets, policy, scripts: JSON.stringify(scripts), snapshot: JSON.stringify(product) });
}

/**
 * CI6: the product this very call chain just admitted, handed straight back to a writer that would admit it again: the same
 * object admitProduct returned, with the same assets map, policy and script rows, and JSON unchanged since (nothing wrote
 * to it). Its admission's own result then is a fresh parse of it; any other input (a copy, a mutated object, another map
 * or policy) returns null and takes the full admission. The written folder's own re-admission never depends on this.
 */
export function readmitted(input: unknown, assets: ReadonlyMap<string, Uint8Array>, policy: 'warn' | 'refuse', scripts: ScriptAdmissionRows): Shardfile | null {
  if (typeof input !== 'object' || input === null) return null;
  const row = admitted.get(input);
  if (row === undefined || row.assets !== assets || row.policy !== policy || row.scripts !== JSON.stringify(scripts) || row.snapshot !== JSON.stringify(input)) return null;
  return parseShardfile(input);
}

/** Emit a complete product: canonical shard.json, every charged local/commons asset and the informational validation receipt.
 * Config builds and author-only cold producers share this writer. No client, runtime, cache or retained product is read.
 * Default admission refuses overages; a trusted caller alone may request the existing warning policy. */
export function writeProduct(input: unknown, assets: ReadonlyMap<string, Uint8Array>, destination: string, policy: 'warn' | 'refuse' = 'refuse'): Shardfile {
  const shard = admitProduct(input, assets, policy);
  shard.files.sort((a, b) => a.hash.localeCompare(b.hash));
  shard.tiles.sort((a, b) => a.lod - b.lod || a.x - b.x || a.z - b.z);
  mkdirSync(destination, { recursive: true });
  const emitted = new Set<string>();
  for (const [ref, bytes] of assets) {
    const hash = ref.replace('commons:', '');
    if (emitted.has(hash)) continue;
    writeFileSync(resolve(destination, hash), bytes); emitted.add(hash);
  }
  writeFileSync(resolve(destination, 'shard.json'), encodeCanonicalJson(shard));
  writeFileSync(resolve(destination, 'validation.json'), encodeCanonicalJson({ revision: validationRevision(), sourceHash: hashImmutableBytes(validationSourceBytes(shard)), worst: preflightDeclaredCosts(shard, offlineMemoryAdmission(policy)).worst }));
  return shard;
}
