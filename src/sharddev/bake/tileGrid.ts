import * as v from 'valibot';
import { CHUNK_HALF, CHUNK_SIZE, CONTENT_CAPS } from '@wildshard/format/contentBounds';
import { TilesSchema } from '@wildshard/format/shardSections';
import type { Shardfile } from '@wildshard/format/shardSchema';

/** Native local-cell footprint in [minX, maxX, minZ, maxZ] order, owned by each author call. */
export function authorCellBounds(): readonly [number, number, number, number] {
  return [-CHUNK_HALF, CHUNK_HALF, -CHUNK_HALF, CHUNK_HALF];
}

function checkedTiles(input: readonly Shardfile['tiles'][number][]): Shardfile['tiles'] {
  const tiles = v.parse(TilesSchema, input), seen = new Set<string>();
  for (const tile of tiles) {
    const size = tile.lod === 0 ? CONTENT_CAPS.l0.size : CONTENT_CAPS.l1.size, count = CHUNK_SIZE / size;
    const key = `${tile.lod}/${tile.x}/${tile.z}`;
    if (seen.has(key) || tile.x >= count || tile.z >= count
      || tile.bounds.min[0] !== -CHUNK_HALF + tile.x * size || tile.bounds.max[0] !== -CHUNK_HALF + (tile.x + 1) * size
      || tile.bounds.min[2] !== -CHUNK_HALF + tile.z * size || tile.bounds.max[2] !== -CHUNK_HALF + (tile.z + 1) * size)
      throw new Error(`Invalid tile grid address or bounds: ${key}`);
    seen.add(key);
  }
  return tiles;
}

/** A full-world emitter declares vacant L0 squares explicitly, without fake
 * assets or model rows. Existing tiles retain their order and exact metadata;
 * sparse library/partial packers do not call this completion step. */
export function completeL0Tiles(input: readonly Shardfile['tiles'][number][]): Shardfile['tiles'] {
  const tiles = checkedTiles(input), seen = new Set(tiles.map(tile => `${tile.lod}/${tile.x}/${tile.z}`));
  const size = CONTENT_CAPS.l0.size, count = CHUNK_SIZE / size;
  for (let z = 0; z < count; z++) for (let x = 0; x < count; x++) {
    if (seen.has(`0/${x}/${z}`)) continue;
    tiles.push({ lod: 0, x, z, bounds: { min: [-CHUNK_HALF + x * size, 0, -CHUNK_HALF + z * size],
      max: [-CHUNK_HALF + (x + 1) * size, 0, -CHUNK_HALF + (z + 1) * size] },
    geometricError: 0, files: [], compressed: 0, decoded: 0, gpu: 0, triangles: 0, draws: 0 });
  }
  return tiles;
}

/** Declare only L1 parents whose four explicit L0 children are empty. A
 * partial/unknown inventory cannot establish absence. Occupied parents need
 * real coarse geometry; this never creates a proxy or replaces an L1 row. */
export function completeEmptyL1Tiles(input: readonly Shardfile['tiles'][number][]): Shardfile['tiles'] {
  const tiles = checkedTiles(input), children = new Map<string, boolean>();
  const fineCount = CHUNK_SIZE / CONTENT_CAPS.l0.size;
  for (const tile of tiles) if (tile.lod === 0) {
    const zero = tile.compressed === 0 && tile.decoded === 0 && tile.gpu === 0 && tile.triangles === 0 && tile.draws === 0;
    if (tile.files.length === 0 && (!zero || tile.geometricError !== 0)) throw new Error('Unknown L0 payload cannot prove an empty parent');
    children.set(`${tile.x}/${tile.z}`, tile.files.length === 0);
  }
  if (children.size !== fineCount ** 2) throw new Error('Empty L1 completion requires every explicit L0 child');
  const existing = new Set(tiles.filter(tile => tile.lod === 1).map(tile => `${tile.x}/${tile.z}`));
  const size = CONTENT_CAPS.l1.size, count = CHUNK_SIZE / size;
  for (let z = 0; z < count; z++) for (let x = 0; x < count; x++) {
    if (existing.has(`${x}/${z}`) || ![children.get(`${2 * x}/${2 * z}`), children.get(`${2 * x + 1}/${2 * z}`),
      children.get(`${2 * x}/${2 * z + 1}`), children.get(`${2 * x + 1}/${2 * z + 1}`)].every(value => value === true)) continue;
    tiles.push({ lod: 1, x, z, bounds: { min: [-CHUNK_HALF + x * size, 0, -CHUNK_HALF + z * size],
      max: [-CHUNK_HALF + (x + 1) * size, 0, -CHUNK_HALF + (z + 1) * size] },
    geometricError: 0, files: [], compressed: 0, decoded: 0, gpu: 0, triangles: 0, draws: 0 });
  }
  return tiles;
}
