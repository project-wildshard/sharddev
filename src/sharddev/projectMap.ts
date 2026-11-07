import { parseShardfile, type Shardfile } from '@wildshard/format/shardSchema';
import { assetCost } from '@wildshard/format/product';
import { hashAssetBytes } from './assetHandle';

/** Build input for a baked map; paths and URLs never enter the authored product. */
export interface ProjectMap { readonly bytes: Uint8Array; readonly tilesHash: string }

/** Pack a bounded still image once into the charged library, retaining the exact authored pixels. */
export function packProjectMap(source: Shardfile, map: ProjectMap): { shard: Shardfile; hash: string } {
  const hash = hashAssetBytes(map.bytes), cost = assetCost('image', map.bytes);
  if (source.map !== undefined && (source.map.image !== hash || source.map.tilesHash !== map.tilesHash)) throw new Error('Build map differs from the declared map');
  const existing = source.files.find(file => file.hash === hash);
  if (existing !== undefined && (existing.kind !== 'image' || existing.compressed !== map.bytes.length || existing.decoded !== cost.decoded || existing.gpu !== cost.gpu)) throw new Error('Build map differs from its declared image cost');
  const included = source.library.includes(hash);
  return { hash, shard: parseShardfile({ ...source, map: { image: hash, tilesHash: map.tilesHash },
    files: existing === undefined ? [...source.files, { hash, kind: 'image', compressed: map.bytes.length, ...cost, dependencies: [], critical: false }] : source.files,
    library: included ? source.library : [...source.library, hash],
    budgets: { ...source.budgets, library: { ...source.budgets.library,
      ...(source.budgets.library.downloadAllowance === undefined ? {} : { downloadAllowance: source.budgets.library.downloadAllowance + (included ? 0 : map.bytes.length) }),
      compressed: source.budgets.library.compressed + (included ? 0 : map.bytes.length),
      resident: source.budgets.library.resident + (included ? 0 : cost.decoded + cost.gpu) } },
  }) };
}

/** Encode the source program's fixed 1000-square RGBA lattice through the original lossless map codec.
 * The root adapter may supply its exact world-input key; standalone builds use their bundled program identity. */
export async function generatedProjectMap(input: unknown, tilesHash: string): Promise<{ map: ProjectMap; name: string | undefined }> {
  if (typeof input !== 'object' || input === null || !('pixels' in input) || !(input.pixels instanceof Uint8Array)
    || input.pixels.length !== 1000 * 1000 * 4 || Object.keys(input).some(key => key !== 'pixels' && key !== 'name')
    || 'name' in input && typeof input.name !== 'string' || !/^[a-f0-9]{64}$/u.test(tilesHash)) throw new Error('Invalid generated map lattice or source identity');
  const { default: sharp } = await import('sharp');
  const pixels = new Uint8Array(input.pixels);
  const bytes = new Uint8Array(await sharp(pixels, { raw: { width: 1000, height: 1000, channels: 4 } }).webp({ lossless: true, effort: 6 }).toBuffer());
  return { map: { bytes, tilesHash }, name: 'name' in input && typeof input.name === 'string' ? input.name : undefined };
}
