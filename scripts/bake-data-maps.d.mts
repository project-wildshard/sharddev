import type { MapBakeStamp } from '@wildshard/engine/scripts/map-hash.mjs';
import type { MapRaster } from '../src/sharddev/bake/mapRaster';

/** Existing map geometry and palette declarations, without filesystem roots. */
export interface DataMapSettings {
  readonly painter?: { readonly version: number; readonly terrain?: readonly string[]; readonly props?: readonly string[];
    readonly glbs?: readonly string[]; readonly scenes?: unknown };
  readonly style?: { readonly kind: string } & Readonly<Record<string, unknown>>;
  readonly clipBelow?: number; readonly clipAbove?: number;
  readonly outputs?: Readonly<Record<string, { readonly exclude?: string | readonly string[];
    readonly style?: { readonly kind: string } & Readonly<Record<string, unknown>> }>>;
}
/** Call-scoped input authority; no reader is inferred from a shard name or path. */
export interface DataMapReader {
  input: (file: string) => string | Uint8Array;
  json: (file: string) => unknown;
  bytes: (file: string) => Uint8Array;
}
/** The single existing raster algorithm, returning owned pixels without image/stamp publication. */
export function rasterDataMap(settings: DataMapSettings, data: DataMapReader,
  options?: { output?: string; glbs?: readonly string[]; label?: string }): Promise<{ raster: MapRaster; pixels: Uint8Array }>;

/** SF88g: `output` paints one declared output. `sources` supplies owned terrain/props/scene rows and geometry/GLB bytes by logical input name; omitted inputs retain the declared file path checks. */
export function paintDataMap(root: string, slug: string, options?: { output?: string; glbs?: readonly string[]; sources?: ReadonlyMap<string, Uint8Array> }): Promise<{ raster: MapRaster; stamp: MapBakeStamp }>;
