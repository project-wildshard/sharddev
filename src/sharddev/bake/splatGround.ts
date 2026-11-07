import { floatPositionError } from './geometryError';
/**
 * Tile streaming (G652) on G227 splat terrain: a shard's native ground (its committed WSTR256 bake, as the live chunk draws
 * it with `terrainChunkGeometry`) cut into 64 L0 + 16 L1 render tiles for a `props.splat` row. Each tile is one GLB primitive
 * in the row's material, carrying positions, normals and the `_SPLAT` weights, plus a `_CANOPY` density channel; the drawn
 * openings (a page's terrain cuts) leave the indices as the runtime punch removes them. Physics stays on the native ground.
 *
 *   const source = splatGroundSource(terrainBin, nativeSplatGround('pine-hollow', terrainBin).canopy, hole);   // hole: the page's openings
 *   const tiles = await bakeSplatGround(source, { material: 'pine.ground', lod1: { targetRatio: 0.25, maxErrorMetres: 1 } });
 *   const files = splatLayerFiles(['forrest_ground_03', ...], PINE_GPU_FILES);   // each tier's layer KTX2s, as the runtime picks them
 *
 * Build time only: geometry and bytes, no textures, renderer, physics or scene.
 */
import { BufferAttribute, BufferGeometry, Float32BufferAttribute, MeshStandardMaterial } from 'three';
import { parseBakedTerrain, bakedSamplers } from '@wildshard/engine/world/BakedTerrain';
import { canopyChannel, terrainChunkGeometry } from '@wildshard/engine/world/Terrain';
import { _installBakedTerrain } from '@wildshard/engine/world/Heightfield';
import { filePolicy } from '@wildshard/engine/boot/filePolicy';
import type { Ktx2Table } from '@wildshard/engine/boot/gpuFiles';
import { sliceNativeLattice, type NativeLatticeAttribute, type NativeLatticeSource, type NativeLatticeTile } from './nativeLattice';
import { staticGlb } from './glb';
import { simplifyNativeLatticeTile } from './worldLod';
import { parseGlb, type AssetCost } from '../assets';

const CHANNELS = { normal: 3, splat: 4, canopy: 1 } as const;
const CUSTOM = { _SPLAT: 'splat', _CANOPY: 'canopy' } as const;
export interface SplatGroundTile { tile: NativeLatticeTile; bytes: Uint8Array; cost: AssetCost; geometricError: number }
/** A drawn opening's triangle test (world corners a, b, c), as `punchPageTerrain` applies it. */
export type SplatGroundHole = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) => boolean;
/** The tiles' material name (the `props.splat` row binds it) and the L1 simplification (`simplifyNativeLatticeTile`). */
/** Splat weights (layer i = channel i). */
export type SplatWeights = readonly [number, number, number, number];
/**
 * The tiles' material name (the `props.splat` row binds it), the L1 simplification (`simplifyNativeLatticeTile`) and, for a
 * coarse tier the rings can draw without the splat layers (a coarse tile may not depend on the library the layers live
 * in), `coarse`: L1 tiles then carry vertex colours (`colourAt` over each vertex's height, slope, splat weights and canopy)
 * in their own material name, which the props family draws, beside the same `_SPLAT` / `_CANOPY` channels, so a client that
 * draws the splat ground can draw them with it in one mesh (no layer dependency: their material is not the splat one).
 */
export interface SplatGroundOptions {
  readonly material: string; readonly lod1: { readonly targetRatio: number; readonly maxErrorMetres: number };
  readonly coarse?: { readonly material: string; readonly colourAt: (h: number, slope: number, splat: SplatWeights, canopy: number) => readonly [number, number, number] };
}

/** The live chunk's ground over the committed bake, `canopy` (a 256² density, `canopyMapOf`) as a channel, the openings cut. */
export function splatGroundSource(bytes: Uint8Array, canopy: ArrayLike<number>, hole?: SplatGroundHole): NativeLatticeSource {
  const grid = parseBakedTerrain(Uint8Array.from(bytes).buffer);
  if (grid?.res !== 256 || grid.size !== 500) throw new Error('Splat ground requires a native WSTR256');
  if (canopy.length !== 256 * 256) throw new Error('Splat ground canopy must be 256²');
  const geometry = terrainChunkGeometry(bakedSamplers(grid));
  try {
    const position = geometry.getAttribute('position'), index = geometry.getIndex();
    if (position.itemSize !== 3 || position.count !== 256 ** 2 || index === null) throw new Error('Chunk geometry changed its native lattice');
    geometry.setAttribute('canopy', new BufferAttribute(canopyChannel(position, canopy, 256), 1));
    const positions = Float32Array.from({ length: position.count * 3 }, (_, i) => position.getComponent(Math.floor(i / 3), i % 3));
    const attributes: Record<string, NativeLatticeAttribute> = {};
    for (const [name, width] of Object.entries(CHANNELS)) {
      const channel = geometry.getAttribute(name);
      if (channel.itemSize !== width || channel.count !== position.count) throw new Error(`Chunk geometry lost channel ${name}`);
      attributes[name] = { itemSize: width, values: Float32Array.from({ length: channel.count * width }, (_, i) => channel.getComponent(Math.floor(i / width), i % width)) };
    }
    const kept: number[] = [];
    for (let t = 0; t < index.count; t += 3) {
      const a = index.getX(t), b = index.getX(t + 1), c = index.getX(t + 2);
      if (hole?.(position.getX(a), position.getY(a), position.getZ(a), position.getX(b), position.getY(b), position.getZ(b), position.getX(c), position.getY(c), position.getZ(c)) === true) continue;
      kept.push(a, b, c);
    }
    return { resolution: 256, positions, indices: Uint32Array.from(kept), attributes };
  } finally { geometry.dispose(); }
}

/** The 64 L0 tiles at native detail, then the 16 L1 tiles simplified; each one primitive that receives shadow, never casts. */
export async function bakeSplatGround(source: NativeLatticeSource, options: SplatGroundOptions): Promise<SplatGroundTile[]> {
  const lod1: { tile: NativeLatticeTile; errorMetres: number }[] = [];
  for (const tile of sliceNativeLattice(source, 1)) lod1.push(await simplifyNativeLatticeTile(tile, options.lod1.targetRatio, options.lod1.maxErrorMetres));
  const material = new MeshStandardMaterial({ color: 0xffffff, metalness: 0, roughness: 1 });
  material.name = options.material;
  const coarse = options.coarse === undefined ? null : new MeshStandardMaterial({ color: 0xffffff, metalness: 0, roughness: 1, vertexColors: true });
  if (coarse !== null && options.coarse !== undefined) coarse.name = options.coarse.material;
  try {
    return [...sliceNativeLattice(source, 0).map(tile => ({ tile, errorMetres: 0 })), ...lod1].map(({ tile, errorMetres }) => {
      const geometry = new BufferGeometry();
      let bytes: Uint8Array;
      try {
        geometry.setAttribute('position', new Float32BufferAttribute(tile.positions, 3));
        geometry.setIndex(new BufferAttribute(tile.indices, 1));
        if (tile.lod === 1 && coarse !== null && options.coarse !== undefined) {
          geometry.setAttribute('normal', new Float32BufferAttribute(channelOf(tile, 'normal', 3), 3));
          geometry.setAttribute('color', new Float32BufferAttribute(coarseColours(tile, options.coarse.colourAt), 3));
          for (const name of ['splat', 'canopy'] as const) { const width = CHANNELS[name]; geometry.setAttribute(name, new Float32BufferAttribute(channelOf(tile, name, width), width)); }
          bytes = staticGlb([{ geometry, material: coarse, castShadow: false, customAttributes: CUSTOM }], `${options.coarse.material}.l1.${String(tile.x)}.${String(tile.z)}`);
        } else {
          for (const [name, channel] of Object.entries(tile.attributes)) geometry.setAttribute(name, new Float32BufferAttribute(channel.values, channel.itemSize));
          bytes = staticGlb([{ geometry, material, castShadow: false, customAttributes: CUSTOM }], `${options.material}.l${String(tile.lod)}.${String(tile.x)}.${String(tile.z)}`);
        }
      } finally { geometry.dispose(); }
      return { tile, bytes, cost: parseGlb(bytes), geometricError: errorMetres + floatPositionError(tile.positions) };
    });
  } finally { material.dispose(); coarse?.dispose(); }
}

function channelOf(tile: NativeLatticeTile, name: string, width: number): Float64Array {
  const channel = tile.attributes[name];
  if (channel?.itemSize !== width) throw new Error(`Splat ground tile lost channel ${name}`);
  return channel.values;
}
/** A coarse tile's vertex colours: `colourAt` over each vertex's height, slope (1 - normal y), splat weights and canopy. */
function coarseColours(tile: NativeLatticeTile, colourAt: NonNullable<SplatGroundOptions['coarse']>['colourAt']): Float32Array {
  const normal = channelOf(tile, 'normal', 3), splat = channelOf(tile, 'splat', 4), canopy = channelOf(tile, 'canopy', 1), n = tile.positions.length / 3;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const rgb = colourAt(tile.positions[i * 3 + 1] ?? 0, 1 - (normal[i * 3 + 1] ?? 1), [splat[i * 4] ?? 0, splat[i * 4 + 1] ?? 0, splat[i * 4 + 2] ?? 0, splat[i * 4 + 3] ?? 0], canopy[i] ?? 0);
    out.set(rgb, i * 3);
  }
  return out;
}

/** One tier's four splat layers by role, as public asset paths. */
export interface SplatLayerPaths { colour: string[]; normal: string[]; arm: string[] }
/**
 * The KTX2 files four native ground layers (`groundLayers` ids, in splat channel order) draw from on each tier, exactly as the
 * runtime's texture arrays resolve them (`filePolicy(tier, 'ktx2', table).layer`: the engine table under the shard's own,
 * the phone's `.phone` variants, found in `inventory`: the public files, keyed by URL); throws when a layer has no `#layer` KTX2.
 */
export function splatLayerFiles(ids: readonly string[], table: Ktx2Table, inventory: Readonly<Record<string, number | true>>): { desktop: SplatLayerPaths; phone: SplatLayerPaths } {
  if (ids.length !== 4) throw new Error('A splat ground has four layers');
  const tier = (name: 'phone' | 'desktop'): SplatLayerPaths => {
    const policy = filePolicy(name, 'ktx2', table, inventory), roles: SplatLayerPaths = { colour: [], normal: [], arm: [] };
    for (const id of ids) {
      const [colour, normal, arm] = policy.pbr(id).map(url => {
        const file = policy.layer(url);
        if (!file.endsWith('.ktx2')) throw new Error(`Splat layer ${url} has no ${name} #layer KTX2`);
        return file;
      });
      if (colour === undefined || normal === undefined || arm === undefined) throw new Error(`Splat layer ${id} lost a role`);
      roles.colour.push(colour); roles.normal.push(normal); roles.arm.push(arm);
    }
    return roles;
  };
  return { desktop: tier('desktop'), phone: tier('phone') };
}
