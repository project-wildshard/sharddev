import { PAINTED_TERRAIN_ATTRIBUTES } from '@wildshard/format/materialFamilies';
import { CELL_ABOVE, CELL_BELOW, CONTENT_CAPS } from '@wildshard/format/contentBounds';
import { bilinearTerrainSamplers, decodeTerrainTile, encodeTerrainTile, terrainTileCost, terrainTileHeight, type TerrainTileData } from '@wildshard/format/terrainTileBytes';
import { validateTerrainAssets } from '@wildshard/format/product';
import { TerrainSchema, type ShardTerrain } from '@wildshard/format/terrain';
import type { Shardfile } from '@wildshard/format/shardSchema';
import * as v from 'valibot';
import { hashImmutableBytes as contentHash } from '../immutable';
import { parseBakedTerrain, type BakedGrid } from '@wildshard/format/bakedTerrainBytes';
import { bakedSamplers, type BakedTerrainSamplers } from '@wildshard/format/bakedTerrainSampling';
import { ScalarLatticeSchema, decodeScalarStorage } from '@wildshard/format/scalarChannel';
import { unzlibSync } from 'fflate';

/** Read an owned WTT source using its original native triangular sampling law.
 * No resampling, physics owner or rendering allocation is introduced. */
export function readTerrainTileSource(bytes: Uint8Array): { heightAt: (x: number, z: number) => number } {
  const ground = decodeTerrainTile(bytes);
  return { heightAt: (x, z) => terrainTileHeight(ground, x, z) };
}
/** Original renderer lattice and its defining native queries; this is not a physics-grid substitute. */
export interface NativeTerrainSource extends BakedTerrainSamplers { readonly grid: BakedGrid }

/** Admit bounded original WSTR bytes for author placements, keeping native samples, clamping and arithmetic exact.
 * Copies only the supplied byte view; it never reads a host, selects a level or installs runtime services. */
export function readNativeTerrain(bytes: Uint8Array): NativeTerrainSource {
  if (bytes.byteLength < 24 || bytes.byteLength > 8_000_000) throw new Error('Native terrain byte cap');
  const buffer = Uint8Array.from(bytes).buffer, header = new DataView(buffer);
  const resolution = header.getUint32(8, true), size = header.getFloat32(12, true);
  if ((resolution !== 256 && resolution !== 257) || !Number.isFinite(size) || size <= 0 || size > 500) throw new Error('Native terrain grid cap');
  const end = 24 + resolution ** 2 * 8;
  if (buffer.byteLength > end && (buffer.byteLength < end + 16 || header.getUint32(end + 8, true) > 4_000_000
    || header.getUint32(end + 12, true) > 64)) throw new Error('Native terrain placement cap');
  const grid = parseBakedTerrain(buffer);
  if (grid === null || grid.heights.some(height => !Number.isFinite(height) || height < -CELL_BELOW || height > CELL_ABOVE)
    || (grid.undergrowth !== null && !Number.isFinite(grid.undergrowth.checksum.sum))) throw new Error('Invalid native terrain lattice');
  return { grid, ...bakedSamplers(grid) };
}

/** Owned native f32 field and the original clamped bilinear query over that same storage. */
export interface NativeScalarField {
  readonly resolution: number;
  readonly size: number;
  readonly values: Float32Array;
  readonly sample: (x: number, z: number) => number;
}

/** Admit an existing bounded scalar lattice and its declared compressed blocks for native authors.
 * Decode once with the defining scalar intake; preserve every f32 bit and the original sampling law.
 * Separate calls own their storage, never select a page or install terrain, and retain no input block. */
export function readNativeScalarField(input: unknown, blocks: ReadonlyMap<string, Uint8Array>): NativeScalarField {
  const row = v.parse(ScalarLatticeSchema, input);
  if (typeof row.values.data === 'string') throw new Error('Native scalar field requires a declared block');
  const block = blocks.get(row.values.data.file);
  if (block === undefined) throw new Error('Missing scalar block');
  const values = decodeScalarStorage(row.values, block, (bytes, out) => unzlibSync(bytes, { out }));
  if (!(values instanceof Float32Array)) throw new Error('Native scalar fields require f32 storage');
  const { heightAt } = bakedSamplers({ res: row.res, size: row.size, heights: values, seed: 0,
    landscapeHash: 0, splat: new Uint8Array(0), undergrowth: null });
  return { resolution: row.res, size: row.size, values, sample: heightAt };
}

/** An admitted, detached column-major lattice and its original clamped triangular query. */
export interface NativeTriangleField {
  readonly resolution: number;
  readonly x: number; readonly z: number; readonly size: number;
  readonly heights: Float32Array;
  readonly sample: (x: number, z: number) => number;
}

/** Admit original author collision samples without transposing or resampling them.
 * The native column-major law keeps its per-cell diagonal and operation order.
 * Each call owns its storage; no landscape, runtime binding or collider is installed. */
export function readNativeTriangleField(input: Pick<TerrainTileData, 'resolution' | 'x' | 'z' | 'size' | 'heights'>): NativeTriangleField {
  if (!Number.isSafeInteger(input.resolution) || input.resolution < 2 || input.resolution > 257
    || !Number.isFinite(input.size) || input.size <= 0 || input.size > 500
    || !Number.isFinite(input.x) || !Number.isFinite(input.z)
    || input.heights.length !== input.resolution ** 2
    || input.heights.some(height => !Number.isFinite(height) || height < -CELL_BELOW || height > CELL_ABOVE)) {
    throw new Error('Invalid native triangular field');
  }
  const data = { resolution: input.resolution, x: input.x, z: input.z, size: input.size, heights: Float32Array.from(input.heights) };
  return { ...data, sample: (x, z) => terrainTileHeight(data, x, z, { layout: 'column-major', boundary: 'clamp' }) };
}

/** Original-lattice query metadata; no render or collision mesh is generated. */
export interface QueryTerrainBakeOptions { normalEpsilon?: number; datum?: number; family?: string }
/** One critical, charged WTT query root; its runtime owner keeps rendering and collision. */
export interface BakedQueryTerrain {
  terrain: ShardTerrain; files: Shardfile['files']; critical: string[]; assets: Map<string, Uint8Array>;
}

/** Encode the original native lattice directly, without sampling, patches, colours or render tiles.
 * The query-only form requires runtime.binds terrain. Its compatibility collider reference names
 * this same query root and never installs collision. Native placement logs are not query data. */
export function bakeQueryTerrain(source: NativeTerrainSource, options: QueryTerrainBakeOptions = {}): BakedQueryTerrain {
  const { grid } = source;
  if ((grid.res !== 256 && grid.res !== 257) || grid.size !== 500) throw new Error('Native query terrain needs its original 500 m grid');
  const data: TerrainTileData = { resolution: grid.res, x: -grid.size / 2, z: -grid.size / 2,
    size: grid.size, heights: grid.heights, splat: grid.splat };
  const bytes = encodeTerrainTile(data), hash = contentHash(bytes);
  const terrain = v.parse(TerrainSchema, { version: 1, form: 'query', family: options.family ?? 'toon', tiles: [],
    sampling: { law: 'bilinear', file: hash, normalEpsilon: options.normalEpsilon ?? 0.6, datum: options.datum ?? 0 } });
  const result: BakedQueryTerrain = { terrain, files: [{ hash, kind: 'binary', compressed: bytes.length,
    ...terrainTileCost(data), dependencies: [], critical: true }], critical: [hash], assets: new Map([[hash, bytes]]) };
  bilinearTerrainSamplers(data, options.normalEpsilon ?? 0.6, options.datum ?? 0);
  return result;
}

/** An ordered build-time patch, blended across a circular footprint; it changes rendering and collision together. */
export interface TerrainOverride { x: number; z: number; radius: number; height: number; mode: 'replace' | 'lower' | 'raise' }
/** Trusted generator inputs. These closures run only while baking and never enter shard.json or the client. */
export interface TerrainBakeSource {
  heightAt: (x: number, z: number) => number;
  colourAt: (x: number, z: number, height: number) => readonly [number, number, number];
  overrides?: readonly TerrainOverride[]; family?: string;
  /** Independent original native query lattice; does not replace or install the compiled collider. */
  sampling?: { source: NativeTerrainSource; normalEpsilon?: number; datum?: number };
}
/** Immutable wire files plus the ordinary shardfile rows and a validated terrain section. */
export interface BakedTerrain {
  terrain: ShardTerrain; tiles: Shardfile['tiles']; files: Shardfile['files']; edge: Shardfile['edge'];
  critical: string[]; assets: Map<string, Uint8Array>;
}

/** Bake a shared 257² lattice into 64 L0 and 16 L1 tiles, with an independent whole-sim collision file. */
export function bakeTerrain(source: TerrainBakeSource): BakedTerrain {
  for (const patch of source.overrides ?? []) if (![patch.x, patch.z, patch.radius, patch.height].every(Number.isFinite) || patch.radius <= 0 || patch.x < -250 || patch.x > 250 || patch.z < -250 || patch.z > 250 || patch.height < -CELL_BELOW || patch.height > CELL_ABOVE || !['replace', 'lower', 'raise'].includes(patch.mode)) throw new Error('Invalid terrain override');
  const heights = new Float32Array(257 ** 2), colours = new Float32Array(257 ** 2 * 3);
  for (let z = 0; z < 257; z++) for (let x = 0; x < 257; x++) {
    const px = -250 + x * 500 / 256, pz = -250 + z * 500 / 256;
    let h = source.heightAt(px, pz);
    if (!Number.isFinite(h) || h < -CELL_BELOW || h > CELL_ABOVE) throw new Error('Invalid terrain generator height');
    for (const patch of source.overrides ?? []) {
      const t = Math.max(0, 1 - Math.hypot(px - patch.x, pz - patch.z) / patch.radius), weight = t * t * (3 - 2 * t);
      const target = patch.mode === 'lower' ? Math.min(h, patch.height) : patch.mode === 'raise' ? Math.max(h, patch.height) : patch.height;
      h += (target - h) * weight;
    }
    const i = z * 257 + x; heights[i] = h;
    const rgb = [...source.colourAt(px, pz, heights[i] ?? 0)];
    if (rgb.length !== 3 || rgb.some((c) => !Number.isFinite(c) || c < 0 || c > 1)) throw new Error('Invalid terrain generator colour');
    colours.set(rgb, i * 3);
  }
  const grid: TerrainTileData = { resolution: 257, x: -250, z: -250, size: 500, heights };
  const assets = new Map<string, Uint8Array>(), files: Shardfile['files'] = [];
  const store = (data: TerrainTileData, critical: boolean): string => {
    const bytes = encodeTerrainTile(data), hash = contentHash(bytes);
    if (!assets.has(hash)) { assets.set(hash, bytes); files.push({ hash, kind: 'binary', compressed: bytes.length, ...terrainTileCost(data), dependencies: [], critical }); }
    return hash;
  };
  const collider = store(grid, true), tiles: Shardfile['tiles'] = [], entries: ShardTerrain['tiles'] = [];
  for (const lod of [0, 1] as const) {
    const size = lod === 0 ? 62.5 : 125, resolution = lod === 0 ? 33 : 17, count = 500 / size, stride = lod === 0 ? 1 : 4;
    for (let tz = 0; tz < count; tz++) for (let tx = 0; tx < count; tx++) {
      const tileHeights = new Float32Array(resolution ** 2), tileColours = new Float32Array(resolution ** 2 * 3);
      for (let z = 0; z < resolution; z++) for (let x = 0; x < resolution; x++) {
        const gx = tx * size / (500 / 256) + x * stride, gz = tz * size / (500 / 256) + z * stride, i = z * resolution + x, g = gz * 257 + gx;
        tileHeights[i] = heights[g] ?? 0; tileColours.set(colours.subarray(g * 3, g * 3 + 3), i * 3);
      }
      const tile: TerrainTileData = { resolution, x: -250 + tx * size, z: -250 + tz * size, size, heights: tileHeights, colours: tileColours };
      let geometricError = 0;
      for (let z = 0; z <= size / (500 / 256); z++) for (let x = 0; x <= size / (500 / 256); x++) {
        const px = tile.x + x * 500 / 256, pz = tile.z + z * 500 / 256;
        geometricError = Math.max(geometricError, Math.abs(terrainTileHeight(tile, px, pz) - terrainTileHeight(grid, px, pz)));
      }
      const file = store(tile, false), cost = terrainTileCost(tile), cap = lod === 0 ? CONTENT_CAPS.l0 : CONTENT_CAPS.l1;
      const min = Math.min(...tileHeights), max = Math.max(...tileHeights), compressed = assets.get(file)?.length ?? 0;
      if (cost.decoded + cost.gpu > cap.resident || compressed > cap.compressed || cost.triangles > cap.triangles || cost.draws > cap.draws) throw new Error('Terrain tile exceeds content caps');
      tiles.push({ lod, x: tx, z: tz, bounds: { min: [tile.x, min - (lod === 0 ? size / 16 : 0), tile.z], max: [tile.x + size, max, tile.z + size] }, geometricError, files: [file], compressed, ...cost });
      entries.push({ lod, x: tx, z: tz, file });
    }
  }
  const edgeAt = (side: 'north' | 'east' | 'south' | 'west'): Shardfile['edge']['north'] => {
    const samples: number[] = [], rgb: [number, number, number][] = [];
    for (let i = 0; i < 257; i++) {
      const x = side === 'east' ? 256 : side === 'west' ? 0 : i, z = side === 'north' ? 256 : side === 'south' ? 0 : i, at = z * 257 + x;
      samples.push(heights[at] ?? 0); rgb.push([colours[at * 3] ?? 0, colours[at * 3 + 1] ?? 0, colours[at * 3 + 2] ?? 0]);
    }
    return { heights: samples, colours: rgb, roadHeight: 0 };
  };
  const critical = [collider];
  const sampling = source.sampling === undefined ? undefined : (() => {
    const { grid: native } = source.sampling.source;
    const file = store({ resolution: native.res, x: -250, z: -250, size: native.size,
      heights: native.heights, splat: native.splat }, true);
    critical.push(file);
    return { law: 'bilinear' as const, file, normalEpsilon: source.sampling.normalEpsilon ?? 0.6, datum: source.sampling.datum ?? 0 };
  })();
  const terrain = v.parse(TerrainSchema, { version: 1, family: source.family ?? 'toon', collider, tiles: entries,
    ...(sampling === undefined ? {} : { sampling }) });
  const result: BakedTerrain = { terrain, tiles, files, critical, assets, edge: { north: edgeAt('north'), east: edgeAt('east'), south: edgeAt('south'), west: edgeAt('west') } };
  validateTerrainAssets(terrain, assets, result); return result;
}

/** Defining per-vertex terrain masks, track vectors and zone channel layout. */
export function paintedTerrainAttributes(): typeof PAINTED_TERRAIN_ATTRIBUTES { return PAINTED_TERRAIN_ATTRIBUTES; }
