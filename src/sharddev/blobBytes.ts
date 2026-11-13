import { assetCost, prepareAssetDecoders } from '@wildshard/format/product';
import { parseImageAsset } from '@wildshard/format/stillImage';
import { decodeTerrainTile } from '@wildshard/format/terrainTileBytes';
import { outputBlobPath } from '@wildshard/format/outputAddress';
import { encodeCanonicalJson } from './immutable';
import { ownAssetBytes } from './assetOwner';
import type { BlobOptions, NamedBlob, NamedBlobKind } from './blobs';

// Author-only facade; browser admission prepares this codec at its async boundary.
await prepareAssetDecoders();

const MAX_BYTES = 25_000_000;
const logicalName = /^(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*$/u;
const reference = /^(?:commons:)?[a-f0-9]{64}$/u;
const kinds = new Set<NamedBlobKind>(['glb', 'ktx2', 'image', 'audio', 'wasm', 'bin', 'tile', 'json']);

function assertName(name: string): void {
  if (name.length > 240 || !logicalName.test(name) || name.split('/').some(part => part === '.' || part === '..')) throw new Error('Blob logical name must be a bounded relative path');
}

function isTextGltf(bytes: Uint8Array): boolean {
  let json: unknown;
  try { json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { return false; }
  return typeof json === 'object' && json !== null && 'asset' in json && typeof json.asset === 'object'
    && json.asset !== null && 'version' in json.asset && json.asset.version === '2.0';
}

function extension(kind: NamedBlobKind, bytes: Uint8Array): string {
  if (kind === 'image') return ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' })[parseImageAsset(bytes).mime];
  if (kind === 'audio') return new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF' ? 'wav' : 'm4a';
  if (kind === 'tile') { decodeTerrainTile(bytes); return 'wtt'; }
  return kind === 'bin' ? 'bin' : kind;
}

/** Shared exact-byte admission without a schema-compiler dependency. A declared
 * JSON schema requires its validator; omitting it never skips admission. */
export function nameBlobBytes(name: string, kind: NamedBlobKind, input: Uint8Array, options: BlobOptions = {}, validateJson?: (schemaBytes: Uint8Array, bytes: Uint8Array) => unknown): NamedBlob {
  assertName(name);
  if (name.startsWith('custom/')) throw new Error('Custom output names are retired');
  if (!kinds.has(kind)) throw new Error('Unsupported named blob kind');
  if (input.length === 0 || input.length > MAX_BYTES) throw new Error('Blob exceeds its wire byte cap');
  const owned = ownAssetBytes(input), bytes = owned.bytes, suffix = extension(kind, bytes);
  if ((kind === 'bin' || kind === 'json') && isTextGltf(bytes)) throw new Error('Text glTF must compile to GLB, never a JSON or binary blob');
  if (kind !== 'wasm' && options.script !== undefined) throw new Error('Script contract requires a Wasm blob');
  if (options.jsonSchema !== undefined) {
    if (kind !== 'json') throw new Error('JSON schema requires a named JSON blob');
    if (validateJson === undefined) throw new Error('Named JSON schema requires its validator');
    validateJson(new TextEncoder().encode(encodeCanonicalJson(options.jsonSchema)), bytes);
  }
  const actual = assetCost(kind === 'bin' || kind === 'tile' ? 'binary' : kind, bytes, options.script);
  const costs = { decoded: options.decoded ?? actual.decoded, gpu: options.gpu ?? actual.gpu, triangles: options.triangles ?? actual.triangles, draws: options.draws ?? actual.draws };
  for (const key of ['decoded', 'gpu', 'triangles', 'draws'] as const) if (!Number.isSafeInteger(costs[key]) || costs[key] < actual[key]) throw new Error('Blob costs cannot understate actual bytes or geometry');
  const dependencies = [...options.dependencies ?? []];
  if (dependencies.some(hash => !reference.test(hash)) || new Set(dependencies).size !== dependencies.length || (options.critical !== undefined && typeof options.critical !== 'boolean')) throw new Error('Invalid blob dependencies or admission policy');
  if (options.tier !== undefined && (options.critical === true || (options.tier !== 'phone' && options.tier !== 'desktop'))) throw new Error('A tiered named blob is a non-critical phone or desktop file');
  if (options.variantOf !== undefined && (options.critical === true || options.variantOf.length === 0 || options.variantOf.length > 240)) throw new Error('A variant is a non-critical file of a named payload');
  const verified = ownAssetBytes(bytes), hash = verified.hash;
  const file = { name, path: `blobs/${kind}/${hash}.${suffix}`, kind, hash, compressed: bytes.length, ...costs, critical: options.critical ?? false, dependencies,
    ...(options.tier === undefined ? {} : { tier: options.tier }),
    ...(options.variantOf === undefined ? {} : { variantOf: options.variantOf }),
    ...(options.jsonSchema === undefined ? {} : { jsonSchema: structuredClone(Object.fromEntries(Object.entries(options.jsonSchema))) }) };
  outputBlobPath(file);
  return { file, bytes: verified.bytes, ...(options.script === undefined ? {} : { script: { ...options.script } }) };
}
