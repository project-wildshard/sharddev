import type { Shardfile } from '@wildshard/format/shardSchema';
import { PropsSchema, type ShardProps } from '@wildshard/format/props';
import * as v from 'valibot';
import { assetCost } from '../assets';
import { ownAssetBytes } from '../assetOwner';
import type { NativeLatticeTile } from './nativeLattice';
import { checkStaticMaterialDependencies, staticMaterialNames } from './staticMaterials';
import { checkTileMaterialNames, splatTextureRefs } from '@wildshard/format/splatTerrain';

type FileRow = Shardfile['files'][number];
type TileRow = Shardfile['tiles'][number];
/** One final self-contained tile GLB, from native ground, authored props, or their combined geometry. */
export interface WorldTileEntry {
  lod: 0 | 1; x: number; z: number; bytes: Uint8Array;
  bounds: TileRow['bounds']; geometricError?: number; dependencies?: readonly string[];
}
/** Native ground producers hand their unchanged GLB to the same row packing used for static authored placements. */
export interface WorldGroundEntry { tile: Pick<NativeLatticeTile, 'lod' | 'x' | 'z' | 'bounds'>; bytes: Uint8Array }
/** Ordinary compiled rows. This render-only packer neither creates collision nor asserts product admission. */
export interface BakedWorldRows {
  files: Shardfile['files']; tiles: Shardfile['tiles']; props: ShardProps;
  critical: string[]; assets: Map<string, Uint8Array>;
}
const order = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const copyFile = (row: FileRow): FileRow => ({ ...row, dependencies: [...row.dependencies] });
const copyTile = (row: TileRow): TileRow => ({ ...row, files: [...row.files], bounds: { min: [...row.bounds.min], max: [...row.bounds.max] } });

/** Hash actual immutable bytes once, derive their costs, and pack ground/props through one deterministic file table.
 * Supply dependencies before their users. One final GLB owns each tile address: duplicate different GLBs refuse,
 * so a later prop pass cannot silently replace terrain. Combine authored geometry before submitting that address. */
export class WorldBakeRows {
  private readonly files = new Map<string, FileRow>();
  private readonly assets = new Map<string, Uint8Array>();
  private readonly tiles = new Map<string, TileRow>();
  private readonly models = new Map<string, ShardProps['tiles'][number]>();

  /** Store an admitted payload with byte-derived cost; repeat bytes deduplicate, conflicting metadata refuses. */
  asset(input: Uint8Array, kind: FileRow['kind'], dependencies: readonly string[] = [], critical = false): FileRow {
    const owned = ownAssetBytes(input), bytes = owned.bytes, hash = owned.hash, refs = [...new Set(dependencies)].sort(order);
    if (refs.length !== dependencies.length || refs.some(ref => !this.files.has(ref) || ref === hash)) throw new Error('World asset needs unique previously packed dependencies');
    const known = this.files.get(hash);
    if (known !== undefined) {
      if (known.kind !== kind || JSON.stringify(known.dependencies) !== JSON.stringify(refs)) throw new Error('Conflicting world asset metadata');
      if (critical) known.critical = true;
      return copyFile(known);
    }
    const row: FileRow = { hash, kind, compressed: bytes.length, ...assetCost(kind, bytes), dependencies: refs, critical };
    this.files.set(hash, row); this.assets.set(hash, bytes);
    return copyFile(row);
  }

  /** Convenience seam for a native-lattice ground producer; preserves its GLB and exact clipped bounds. */
  ground(entry: WorldGroundEntry, dependencies: readonly string[] = []): ShardProps['tiles'][number] {
    return this.tile({ ...entry.tile, bytes: entry.bytes, dependencies });
  }

  /** Pack an ordinary GLB tile and the whole distinct dependency closure, without applying category cap refusals. */
  tile(entry: WorldTileEntry): ShardProps['tiles'][number] {
    const { lod, x, z, bounds } = entry, count = lod === 0 ? 8 : 4, size = 500 / count, error = entry.geometricError ?? 0;
    if (!Number.isInteger(x) || !Number.isInteger(z) || x < 0 || z < 0 || x >= count || z >= count
      || [...bounds.min, ...bounds.max, error].some(n => !Number.isFinite(n)) || error < 0
      || bounds.min.some((n, i) => n > (bounds.max[i] ?? -Infinity))
      || bounds.min[0] < -250 + x * size || bounds.max[0] > -250 + (x + 1) * size || bounds.min[2] < -250 + z * size || bounds.max[2] > -250 + (z + 1) * size) throw new Error('Invalid world tile address or bounds');
    const key = `${lod}/${x}/${z}`;
    if (this.tiles.has(key)) throw new Error(`World tile ${key} already packed; combine ground and props before packing`);
    const file = this.asset(entry.bytes, 'glb', entry.dependencies), closure = new Set<string>(), pending = [file.hash];
    const sums = { compressed: 0, decoded: 0, gpu: 0, triangles: 0, draws: 0 };
    while (pending.length > 0) {
      const ref = pending.pop(); if (ref === undefined || closure.has(ref)) continue;
      const row = this.files.get(ref); if (row === undefined) throw new Error('Missing world dependency');
      closure.add(ref); pending.push(...row.dependencies);
      for (const component of ['compressed', 'decoded', 'gpu', 'triangles', 'draws'] as const) sums[component] += row[component];
    }
    this.tiles.set(key, { lod, x, z, bounds: { min: [...bounds.min], max: [...bounds.max] }, geometricError: error, files: [file.hash], ...sums });
    const model = { lod, x, z, file: file.hash }; this.models.set(key, model); return { ...model };
  }

  /** Snapshot deterministic rows. Named packing checks every GLB material and its own texture dependencies; family remains the legacy fallback. */
  finish(family: string, named?: { materials?: NonNullable<ShardProps['materials']>; splat?: NonNullable<ShardProps['splat']> }): BakedWorldRows {
    if (!/^[a-z][a-z0-9.-]{0,127}$/.test(family)) throw new Error('Invalid world material catalogue ID');
    const files = [...this.files.values()].sort((a, b) => order(a.hash, b.hash)).map(copyFile);
    const tiles = [...this.tiles.values()].sort((a, b) => a.lod - b.lod || a.z - b.z || a.x - b.x).map(copyTile);
    const props: ShardProps = { version: 1, family, tiles: tiles.map(row => {
      const model = this.models.get(`${row.lod}/${row.x}/${row.z}`); if (model === undefined) throw new Error('Missing world model'); return { ...model };
    }), panels: [], models: [], textures: [], colliders: [], far: null };
    const admittedProps = named === undefined ? props : v.parse(PropsSchema, { ...props,
      ...(named.materials === undefined ? {} : { materials: named.materials }), ...(named.splat === undefined ? {} : { splat: named.splat }) });
    if (named !== undefined) for (const file of files) if (file.kind === 'glb') {
      const bytes = this.assets.get(file.hash); if (bytes === undefined) throw new Error('Missing named world GLB');
      checkTileMaterialNames(named.materials, named.splat, bytes);
      if (named.materials !== undefined) {
        const slots = named.splat === undefined ? named.materials : { ...named.materials, [named.splat.material]: { id: family, colour: null, normal: null, metallicRoughness: null, occlusion: null, emissive: null } };
        checkStaticMaterialDependencies(bytes, slots, file.dependencies);
      }
      if (named.splat !== undefined && staticMaterialNames(bytes).includes(named.splat.material)
        && splatTextureRefs(named.splat).some(ref => !file.dependencies.includes(ref))) throw new Error('Splat terrain GLB must directly declare every layer dependency');
    }
    return { files, tiles, props: admittedProps, critical: files.filter(row => row.critical).map(row => row.hash), assets: new Map(files.map(row => {
      const bytes = this.assets.get(row.hash); if (bytes === undefined) throw new Error('Missing world bytes'); return [row.hash, ownAssetBytes(bytes).bytes];
    })) };
  }
}
