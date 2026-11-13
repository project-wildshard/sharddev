import * as v from 'valibot';
import { assetCost, type AssetCost } from './assets';
import { encodeCanonicalJson } from './immutable';
import { ownAssetBytes } from './assetOwner';
import { SHARDFILE_ADMISSION_LIMITS as limits } from './admission';
import type { CommonsCosts } from './commonsCosts';

const id = v.pipe(v.string(), v.minLength(1), v.maxLength(128), v.regex(/^[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*$/u));
const version = v.pipe(v.string(), v.maxLength(32), v.regex(/^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/u));
const kind: v.PicklistSchema<["binary", "glb", "ktx2", "audio"], undefined> = v.picklist(['binary', 'glb', 'ktx2', 'audio']);
const metadata = v.strictObject({ id, kind, credit: v.pipe(v.string(), v.minLength(1), v.maxLength(4096)), licence: v.pipe(v.string(), v.minLength(1), v.maxLength(128)) });

/** One build-time pack input; only its copied bytes and validated metadata enter a product. */
export interface CommonsAsset {
  id: string; kind: v.InferOutput<typeof kind>; bytes: Uint8Array; credit: string; licence: string;
}
/** A pinned author-tool pack; runtime code never imports or executes it. */
export interface CommonsPack { id: string; version: string; entries: readonly CommonsAsset[] }
/** Actual byte-derived cost and provenance of a stable catalogue entry. */
export interface CommonsEntry {
  id: string; pack: string; packVersion: string; hash: string; kind: CommonsAsset['kind'];
  wire: number; cost: AssetCost; credit: string; licence: string;
}
/** Version zero catalogue data, independent of package installation paths and build time. */
export interface CommonsCatalogue { format: 'wildshard.commons'; version: 0; entries: readonly CommonsEntry[] }
/** Owned build output; aliases with identical bytes share one hash-named asset. */
export interface BuiltCommons { catalogue: CommonsCatalogue; json: string; assets: ReadonlyMap<string, Uint8Array> }

/** Compile bounded packs deterministically, deriving costs from actual bytes instead of declared numbers. */
export function buildCommons(packs: readonly CommonsPack[]): BuiltCommons {
  if (packs.length > limits.files) throw new Error('Commons packs exceed admission cap');
  const entries: CommonsEntry[] = [], assets = new Map<string, Uint8Array>(), hashes = new Map<string, CommonsAsset['kind']>(), ids = new Set<string>(), packIds = new Set<string>();
  let wire = 0;
  for (const pack of packs) {
    v.parse(id, pack.id); v.parse(version, pack.version);
    if (packIds.has(pack.id)) throw new Error('Duplicate commons pack'); packIds.add(pack.id);
    if (entries.length + pack.entries.length > limits.files) throw new Error('Commons entries exceed admission cap');
    for (const input of pack.entries) {
      const row = v.parse(metadata, { id: input.id, kind: input.kind, credit: input.credit, licence: input.licence });
      const key = `${pack.id}/${row.id}`; v.parse(id, key);
      if (ids.has(key)) throw new Error('Duplicate commons entry'); ids.add(key);
      if (input.bytes.byteLength > limits.wireBytes) throw new Error('Commons wire exceeds admission cap');
      const owned = ownAssetBytes(input.bytes), hash = owned.hash, previous = hashes.get(hash);
      if (previous !== undefined && previous !== row.kind) throw new Error('Commons hash has conflicting kinds');
      if (!assets.has(hash)) {
        wire += input.bytes.byteLength; if (wire > limits.wireBytes) throw new Error('Commons total wire exceeds admission cap');
        assets.set(hash, owned.bytes); hashes.set(hash, row.kind);
      }
      const bytes = assets.get(hash); if (bytes === undefined) throw new Error('Missing owned commons bytes');
      entries.push({ id: key, pack: pack.id, packVersion: pack.version, hash, kind: row.kind, wire: bytes.byteLength, cost: assetCost(row.kind, bytes), credit: row.credit, licence: row.licence });
    }
  }
  entries.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const catalogue: CommonsCatalogue = { format: 'wildshard.commons', version: 0, entries };
  return { catalogue, json: encodeCanonicalJson(catalogue), assets: new Map([...assets].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) };
}

/** Emit unique manifest requirements from selected pinned bytes, never copied author cost declarations. */
export function commonsRequirements(built: BuiltCommons, entryIds: readonly string[]): { commons: string[]; commonsWire: Record<string, number>; commonsCosts: CommonsCosts } {
  if (entryIds.length > limits.files) throw new Error('Commons selection exceeds admission cap');
  const entries = new Map(built.catalogue.entries.map(entry => [entry.id, entry])), selected = new Map<string, { wire: number; cost: AssetCost }>();
  for (const entryId of entryIds) {
    const entry = entries.get(entryId); if (entry === undefined) throw new Error(`Unknown commons entry: ${entryId}`);
    if (selected.has(entry.hash)) continue;
    if (selected.size >= limits.commons) throw new Error('Commons hashes exceed admission cap');
    const bytes = built.assets.get(entry.hash);
    if (bytes === undefined || ownAssetBytes(bytes).hash !== entry.hash) throw new Error('Pinned commons bytes differ from catalogue hash');
    selected.set(entry.hash, { wire: bytes.length, cost: assetCost(entry.kind, bytes) });
  }
  const commons = [...selected.keys()].sort();
  const commonsWire: Record<string, number> = {}, commonsCosts: CommonsCosts = {};
  for (const hash of commons) {
    const entry = selected.get(hash); if (entry === undefined) throw new Error('Missing pinned commons selection');
    commonsWire[hash] = entry.wire; commonsCosts[hash] = entry.cost;
  }
  return { commons, commonsWire, commonsCosts };
}
