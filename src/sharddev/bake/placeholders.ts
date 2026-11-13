import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { BufferAttribute, BufferGeometry, Color, Float32BufferAttribute, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, SRGBColorSpace, Vector3 } from 'three';
import { CONTENT_CAPS } from '@wildshard/engine/core/config';
import { parseBakedTerrain } from '@wildshard/engine/world/BakedTerrain';
import { decodeTerrainTile } from '@wildshard/format/terrainTileBytes';
import type { PlaceholderTree } from '@wildshard/format/placeholderSource';
import { NEAR_COLOUR, NEAR_LIGHT, NEAR_PLACEHOLDER_LIMITS } from '@wildshard/format/nearPlaceholder';
import { MEASURE_SLOT, parseFamilyMaterial, type FamilyMaterialParams } from '@wildshard/format/materialFamilies';
import { materialGraphIr } from '@wildshard/format/materials';
import type { Shardfile } from '@wildshard/format/shardSchema';
import { placeholderGeometry, placeholderLeanDrop, type PlaceholderGrid, type PlaceholderLook, type PlaceholderLookRuntime, type PlaceholderPart } from '@wildshard/engine/game/plugin/placeholderGeometry';
import { assetCost } from '@wildshard/format/product';
import { parseGlb } from '../assets';
import { encodeCanonicalJson, hashImmutableBytes } from '../immutable';
import { staticGlb } from './glb';
import { bakeFarImpostor } from './farImpostor';
import { nearGroundReducer, nearPlaceholderParts, type NearPlaceholderOptions, type NearPlaceholderReport, type NearPrototype } from './nearPlaceholder';

/**
 * G348 (Jake: *"near and far placeholders are generic things that we're doing inside the engine for arbitrary shards
 * being loaded into the MMO"*): the far proxy (SF23) and the near placeholder (G342) of any shard, from its own height
 * grid, its own look and its own world. `wildshard build` bakes both for every shardfile project
 * (`projectPlaceholders`); the repo's runners (`scripts/bake/far-proxies.mjs`, `scripts/bake/near-placeholder.mjs`) call
 * the same bakers with what a shard declares in `data/placeholder.ts` (`@wildshard/format/placeholderSource`). Nothing
 * here knows a shard.
 */

/**
 * The near bake's budget (measured, G342): the ground sampled at the height field's own ~2 m (64 quads a 125 m region)
 * and reduced to `groundError` metres (round 3), a content triangle budget, a sanity triangle cap and the per-cell
 * resident ceiling. Round 3 (Jake: Nalati's terrain "super low poly") measured the dense ground at 0.5 m on 2026-10-12:
 * Nalati 24k triangles / 1.9 MB, Pine 20k / 1.67 MB, Driftwood 16k / 1.38 MB (the L1-density ground was 10k / 0.77 MB);
 * whole cells Nalati 5.47, Driftwood 5.81 and Pine 8.07 MB with its 40k props, so the ceiling went 6 → 8.5 MB
 * (coordinator approval, G342 / E435): four cells 34 MB on the near line, inside the 1.0 GB Explorer envelope.
 */
export const NEAR_BAKE = { quads: 64, groundError: 0.5, contentTriangles: 42_000, triangles: 160_000, residentBytes: 8_500_000, landTriangles: 60_000, modelScale: 16 } as const;
/*
 * G380: `landTriangles` is the budget of a shard whose land is models (Sky Reach's floating islands, its far row's
 * `parts`), on top of the content budget as a height field's ground is; `modelScale` is how many times the far share
 * of triangles its model tools keep for the near bake before that budget reduces them (`placeholderModelTools`).
 */
/**
 * G342 near round 5: the near ground leans back from the cell border (`FarEdgeLean`) instead of ending in a 60–120 m
 * boundary face (Nalati's snow ring stands 100 m at its west edge, Pine's north ridge 62 m). `top` is the seam's tallest
 * face (`SEAM_FACE_TOP`, 14 m: the seam's cliff carries the ground to it), `grade` 1.6 (58°) varied ±45 % along the border.
 */
export const NEAR_EDGE_LEAN = { top: 14, grade: 1.6, jitter: 0.45 } as const;
/** The forest's triangle budget inside the near placeholder (on top of the props' own content budget). */
export const NEAR_TREE_TRIANGLES = 30_000;
/** Half a cell (m): copies leaving it are dropped. */
const HALF = 250;

/** The paint a model's vertex samples: its base colour texture area-averaged to this square (a placeholder vertex stands
 *  for metres of paint), read bilinearly. */
const MODEL_PAINT = 96;
const linearOf = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/**
 * SF49 / G380: the model tools a shard's declared model `parts` (`placeholder.far.parts`, a land of models such as
 * floating islands) are built with, shared by the far and the near bake: `model` reads a GLB under `root` (every
 * primitive in world space, welded by position with seams averaged, its base colour texture sampled per vertex, linear
 * RGB) and `decimate` is meshoptimizer's simplifier toward a triangle count (the sloppy one when topology stops it short).
 * `scale` multiplies every count `decimate` is asked for (the near bake keeps `NEAR_BAKE.modelScale` times the far share,
 * then reduces the whole land to its own budget). Nothing here knows a shard.
 */
export async function placeholderModelTools(root: string, scale = 1): Promise<{
  model: (path: string) => Promise<{ positions: Float32Array; colours: Float32Array; index: Uint32Array }>;
  decimate: (positions: Float32Array, index: Uint32Array, triangles: number) => Uint32Array;
}> {
  await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const paint = async (image: Uint8Array | null | undefined): Promise<((u: number, v: number) => [number, number, number]) | null> => {
    if (image === null || image === undefined) return null;
    const { data } = await sharp(image).resize(MODEL_PAINT, MODEL_PAINT, { fit: 'fill', kernel: 'cubic' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (ix: number, iy: number, c: number): number => (data[(iy * MODEL_PAINT + ix) * 3 + c] ?? 0) / 255;
    return (u, v) => {
      const x = Math.min(MODEL_PAINT - 1.001, Math.max(0, (((u % 1) + 1) % 1) * MODEL_PAINT - 0.5)), y = Math.min(MODEL_PAINT - 1.001, Math.max(0, (((v % 1) + 1) % 1) * MODEL_PAINT - 0.5));
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      const ch = (c: number): number => linearOf((at(ix, iy, c) * (1 - fx) + at(ix + 1, iy, c) * fx) * (1 - fy) + (at(ix, iy + 1, c) * (1 - fx) + at(ix + 1, iy + 1, c) * fx) * fy);
      return [ch(0), ch(1), ch(2)];
    };
  };
  const model = async (path: string): Promise<{ positions: Float32Array; colours: Float32Array; index: Uint32Array }> => {
    const doc = await io.read(`${root.replace(/\/+$/u, '')}/${path}`), pos: number[] = [], col: number[] = [], idx: number[] = [];
    for (const node of doc.getRoot().listNodes()) {
      const mesh = node.getMesh(); if (mesh === null) continue;
      const m = node.getWorldMatrix();
      for (const prim of mesh.listPrimitives()) {
        const p = prim.getAttribute('POSITION'), uv = prim.getAttribute('TEXCOORD_0'), index = prim.getIndices(), material = prim.getMaterial();
        if (p === null) continue;
        const sample = uv === null ? null : await paint(material?.getBaseColorTexture()?.getImage()), factor = material?.getBaseColorFactor() ?? [1, 1, 1, 1], base = pos.length / 3, e = [0, 0, 0], t = [0, 0];
        for (let i = 0; i < p.getCount(); i++) {
          p.getElement(i, e);
          const [x = 0, y = 0, z = 0] = e;
          pos.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
          const c = sample === null || uv === null ? [1, 1, 1] : (uv.getElement(i, t), sample(t[0] ?? 0, t[1] ?? 0));
          col.push((c[0] ?? 1) * factor[0], (c[1] ?? 1) * factor[1], (c[2] ?? 1) * factor[2]);
        }
        const n = index === null ? p.getCount() : index.getCount();
        for (let k = 0; k < n; k++) idx.push(base + (index === null ? k : index.getScalar(k)));
      }
    }
    const positions = new Float32Array(pos), remap = MeshoptSimplifier.generatePositionRemap(positions, 3), first = new Map<number, number>(), out: number[] = [], sum: number[] = [], count: number[] = [], slot = new Uint32Array(remap.length);
    for (let v = 0; v < remap.length; v++) {
      const r = remap[v] ?? v; let s = first.get(r);
      if (s === undefined) { s = out.length / 3; first.set(r, s); out.push(pos[v * 3] ?? 0, pos[v * 3 + 1] ?? 0, pos[v * 3 + 2] ?? 0); sum.push(0, 0, 0); count.push(0); }
      slot[v] = s; sum[s * 3] = (sum[s * 3] ?? 0) + (col[v * 3] ?? 0); sum[s * 3 + 1] = (sum[s * 3 + 1] ?? 0) + (col[v * 3 + 1] ?? 0); sum[s * 3 + 2] = (sum[s * 3 + 2] ?? 0) + (col[v * 3 + 2] ?? 0); count[s] = (count[s] ?? 0) + 1;
    }
    return { positions: new Float32Array(out), colours: Float32Array.from(sum, (c, i) => c / (count[Math.floor(i / 3)] ?? 1)), index: Uint32Array.from(idx, k => slot[k] ?? 0) };
  };
  const decimate = (positions: Float32Array, index: Uint32Array, triangles: number): Uint32Array => {
    const target = Math.round(triangles * scale) * 3, [kept] = MeshoptSimplifier.simplify(index, positions, 3, target, 1, ['Prune']);
    return kept.length <= target * 1.15 ? kept : MeshoptSimplifier.simplifySloppy(index, positions, 3, null, target, 1)[0];
  };
  return { model, decimate };
}

/** One immutable file row of a baked placeholder GLB. */
export type PlaceholderFile = Shardfile['files'][number];
/** far.json: the shardfile `far` row, the GLB's file row, its impostor image's file row (G539) and the runtime look. */
export interface FarManifest { far: NonNullable<Shardfile['far']>; file: PlaceholderFile; impostorFile: PlaceholderFile; look: PlaceholderLookRuntime }
/** near.json: the near GLB's cost row (with its content and forest counts), its file row and the runtime look. */
export interface NearManifest {
  near: { files: string[]; compressed: number; decoded: number; gpu: number; triangles: number; draws: number; content: number; trees?: number; treeTriangles?: number;
    /** its world is the shard's own coarse tiles (`shardfileWorld`): those tiles keep refining over it, so it never owns its cell */
    tiles?: true };
  file: PlaceholderFile; look: PlaceholderLookRuntime;
}

/** A placeholder's json row (`far.json` / `near.json`): canonical, sorted keys. */
export function placeholderJson(manifest: FarManifest | NearManifest): string { return encodeCanonicalJson(manifest); }

function fileRow(bytes: Uint8Array): PlaceholderFile {
  return { hash: hashImmutableBytes(bytes), kind: 'glb', compressed: bytes.length, ...parseGlb(bytes), dependencies: [], critical: false };
}
function oneDraw(geometry: ReturnType<typeof placeholderGeometry>, name: string): Uint8Array {
  return staticGlb([{ geometry, material: new MeshStandardMaterial({ color: 0xffffff, vertexColors: true }), castShadow: false }], name);
}

/**
 * Bake one far proxy (a single-draw GLB) and its impostor (G539: the camera-facing tile atlas the far tier draws past the
 * proxy's band, `bakeFarImpostor`), refused over any §3.2 far cap. Only one of the two draws at a time; both are resident.
 */
export async function bakeFarPlaceholder(grid: PlaceholderGrid, look: PlaceholderLook, parts: readonly PlaceholderPart[] = []): Promise<{ manifest: FarManifest; bytes: Uint8Array; impostor: Uint8Array }> {
  const geometry = placeholderGeometry(grid, look, parts);
  const bytes = oneDraw(geometry, 'far-proxy'), file = fileRow(bytes);
  geometry.computeBoundingBox(); const box = geometry.boundingBox; if (box === null) throw new Error('Missing far bounds');
  const baked = await bakeFarImpostor(geometry, look.family);
  // Admit the defining image envelope, including decode workspace and RGBA fallback; runtime packing stays RGBA 5551.
  const impostorFile: PlaceholderFile = { hash: hashImmutableBytes(baked.png), kind: 'image', compressed: baked.png.length, ...assetCost('image', baked.png), dependencies: [], critical: false };
  const far: NonNullable<Shardfile['far']> = { bounds: { min: box.min.toArray(), max: box.max.toArray() }, files: [file.hash, impostorFile.hash], impostor: { file: impostorFile.hash, ...baked.row },
    compressed: file.compressed + impostorFile.compressed, decoded: file.decoded + impostorFile.decoded, gpu: file.gpu + impostorFile.gpu, triangles: file.triangles, draws: file.draws };
  if (far.decoded + far.gpu > CONTENT_CAPS.far.resident || far.compressed > CONTENT_CAPS.far.compressed || far.triangles > CONTENT_CAPS.far.triangles || far.draws > CONTENT_CAPS.far.draws) throw new Error(`Far proxy exceeds content caps: ${JSON.stringify(far)}`);
  return { manifest: { far, file, impostorFile, look: { family: look.family, haze: look.haze, ...(look.grade === undefined ? {} : { grade: look.grade }), ...(look.band === undefined ? {} : { band: look.band }) } }, bytes, impostor: baked.png };
}

/** A baked `terrain.bin` (the WSTR lattice) as a placeholder grid. */
export function bakedTerrainGrid(raw: Uint8Array): PlaceholderGrid {
  const grid = parseBakedTerrain(new Uint8Array(raw).buffer);
  if (grid === null) throw new Error('Unreadable terrain.bin');
  return { res: grid.res, size: grid.size, heights: grid.heights, splat: grid.splat.some((b, i) => i % 4 !== 0 && b > 0) ? grid.splat : null };
}

/** A shardfile terrain collider tile (the whole cell, centred on its origin) as a placeholder grid. */
export function colliderGrid(tileBytes: Uint8Array): PlaceholderGrid {
  const tile = decodeTerrainTile(tileBytes);
  if (tile.x !== -tile.size / 2 || tile.z !== -tile.size / 2) throw new Error('Terrain collider is not one centred cell');
  return { res: tile.resolution, size: tile.size, heights: tile.heights, splat: null };
}

/** One placed tree of a forest its shard's own model draws: cell-local, its height (m) and its tint's lightness. */
export interface PlaceholderTreePlacement { readonly x: number; readonly y: number; readonly z: number; readonly rot: number; readonly height: number; readonly scale: number; readonly species: string; readonly tint: number }
interface TreeShape { readonly stem: readonly [number, number, Color] | null; readonly rings: readonly (readonly [number, number])[]; readonly crown: Color }

const srgb = ([r, g, b]: readonly [number, number, number]): Color => new Color().setRGB(r / 255, g / 255, b / 255, SRGBColorSpace);
/** The generic stand-in: a stemless two-ring conifer. */
const GENERIC_TREE: PlaceholderTree = { species: 'tree', stem: null, rings: [[0.06, 0.24], [0.45, 0.15]], crown: [76, 112, 66] };
const shapeFrom = (row: PlaceholderTree): TreeShape => ({ stem: row.stem === null ? null : [row.stem[0], row.stem[1], srgb(row.stem[2])], rings: row.rings, crown: srgb(row.crown) });
const trianglesOf = (shape: TreeShape): number => (shape.stem === null ? 0 : 8) + Math.max(0, shape.rings.length - 1) * 10 + (shape.rings.length > 0 ? 5 : 0);

function treePrototype(shape: TreeShape, shade: number, widen: number): { positions: Float32Array; colours: Float32Array; index: Uint32Array } {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const ring = (y: number, r: number, n: number, c: Color): number => { const b = pos.length / 3; for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; pos.push(Math.cos(a) * r, y, Math.sin(a) * r); col.push(c.r, c.g, c.b); } return b; };
  const side = (a: number, b: number, n: number): void => { for (let k = 0; k < n; k++) { const k1 = (k + 1) % n; idx.push(a + k, b + k, b + k1, a + k, b + k1, a + k1); } };
  if (shape.stem !== null) { const [top, r, c] = shape.stem, a = ring(0, r, 4, c), b = ring(top, r, 4, c); side(a, b, 4); }
  if (shape.rings.length > 0) {
    const dark = shape.crown.clone().multiplyScalar(0.8 * shade), lit = shape.crown.clone().multiplyScalar(shade);
    let prev = -1;
    for (const [i, [y, r]] of shape.rings.entries()) { const b = ring(y, r * widen, 5, i === 0 ? dark : lit); if (prev >= 0) side(prev, b, 5); prev = b; }
    const apex = pos.length / 3; pos.push(0, 1, 0); col.push(lit.r, lit.g, lit.b);
    for (let k = 0; k < 5; k++) idx.push(prev + k, apex, prev + (k + 1) % 5);
  }
  return { positions: Float32Array.from(pos), colours: Float32Array.from(col), index: Uint32Array.from(idx) };
}

/**
 * G342: a forest's trees for the near placeholder. Each kept tree becomes a low-LOD stand-in (a unit-high stem and crown
 * of 8-23 triangles, by species and tint band) at its own placement, thinned evenly to the triangle budget, the kept ones
 * widened to cover the thinned ones' crowns. `stands` are the shard's declared shapes (`placeholder.trees`); a shard that
 * declares none gets one generic conifer. Deterministic for the same placements.
 */
export function nearTreePrototypes(trees: readonly PlaceholderTreePlacement[], half: number, stands: readonly PlaceholderTree[] | undefined, budget: number = NEAR_TREE_TRIANGLES): { prototypes: NearPrototype[]; report: { placed: number; inside: number; kept: number; widen: number } } {
  const rows = stands !== undefined && stands.length > 0 ? stands : [GENERIC_TREE], shapes = new Map(rows.map(row => [row.species, shapeFrom(row)]));
  const fallback = rows[0]?.species ?? GENERIC_TREE.species, speciesOf = (t: PlaceholderTreePlacement): string => shapes.has(t.species) ? t.species : fallback;
  const shapeOf = (species: string): TreeShape => shapes.get(species) ?? shapeFrom(GENERIC_TREE);
  const inside = trees.filter(t => Math.abs(t.x) < half - 1 && Math.abs(t.z) < half - 1);
  const total = inside.reduce((sum, t) => sum + trianglesOf(shapeOf(speciesOf(t))), 0), keep = Math.min(1, budget / Math.max(1, total));
  // a hash of each placement picks the kept share evenly across the cell
  const picked = inside.filter((t, i) => { const h = Math.sin(i * 12.9898 + t.x * 78.233 + t.z * 37.719) * 43758.5453; return h - Math.floor(h) < keep; });
  const widen = Math.min(1.7, Math.sqrt(1 / keep)), groups = new Map<string, PlaceholderTreePlacement[]>();
  for (const t of picked) {
    const key = `${speciesOf(t)}:${t.tint < 0.45 ? 0 : t.tint < 0.55 ? 1 : 2}`;
    const group = groups.get(key) ?? []; group.push(t); groups.set(key, group);
  }
  const m = new Matrix4(), q = new Quaternion(), up = new Vector3(0, 1, 0), prototypes: NearPrototype[] = [];
  for (const key of [...groups.keys()].sort((a, b) => a.localeCompare(b))) {
    const [species = fallback, band = '0'] = key.split(':'), shape = shapeOf(species);
    const proto = treePrototype(shape, [0.82, 1, 1.18][Number(band)] ?? 1, shape.rings.length === 0 ? 1 : widen);
    const transforms = (groups.get(key) ?? []).map((t) => {
      const h = t.height > 0 ? t.height : 20 * t.scale;
      return Array.from(m.compose(new Vector3(t.x, t.y, t.z), q.setFromAxisAngle(up, t.rot), new Vector3(h, h, h)).elements);
    });
    prototypes.push({ name: `tree-${key}`, ...proto, transforms });
  }
  return { prototypes, report: { placed: trees.length, inside: inside.length, kept: picked.length, widen: Number(widen.toFixed(2)) } };
}

/** What `bakeNearPlaceholder` merges over the shard's ground. */
export interface NearPlaceholderInput {
  /** the shard's height grid; null for a world with no height field (an authored mesh world): a flat floor then stands
   *  half a metre under the lowest point of its world, one quad a region */
  readonly grid: PlaceholderGrid | null;
  /** a land of models (its far row's `parts`, built with `placeholderModelTools`): cell-local parts reduced to their own
   *  budget (`NEAR_BAKE.landTriangles`), never sunk by the edge lean (they stand on no ground) */
  readonly parts?: readonly PlaceholderPart[];
  readonly look: PlaceholderLook;
  /** the shard's drawn static world as prototypes with their placed copies (cell-local) */
  readonly prototypes: readonly NearPrototype[];
  /** a forest its own tree model draws, placement by placement (empty: none) */
  readonly trees?: readonly PlaceholderTreePlacement[];
  /** the shard's declared tree stand-ins (`placeholder.trees`) */
  readonly stands?: readonly PlaceholderTree[] | undefined;
  /** the ground's geometric error (m) and the cell's resident ceiling (bytes); default `NEAR_BAKE`'s */
  readonly groundError?: number; readonly residentBytes?: number;
  /** the shard's declared prototype floors (`placeholder.near.floors`), on top of the content budget */
  readonly floors?: NearPlaceholderOptions['floors'];
  /** progress lines (the runners print them) */
  readonly log?: (line: string) => void;
}

/** A model part (cell-local) as a near prototype placed once at its footprint's centre (the regions count copy origins). */
function landPrototype(part: PlaceholderPart, i: number): NearPrototype {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let v = 0; v < part.positions.length; v += 3) { const x = part.positions[v] ?? 0, z = part.positions[v + 2] ?? 0; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  const cx = Number.isFinite(minX) ? (minX + maxX) / 2 : 0, cz = Number.isFinite(minZ) ? (minZ + maxZ) / 2 : 0, positions = Float32Array.from(part.positions);
  for (let v = 0; v < positions.length; v += 3) { positions[v] = (positions[v] ?? 0) - cx; positions[v + 2] = (positions[v + 2] ?? 0) - cz; }
  return { name: `land-${String(i)}`, positions, colours: part.colours, index: part.index, transforms: [[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, 0, cz, 1]] };
}

/** Round 6: the widest copy (m, its world footprint) that sinks rigidly with the lean; a wider one is a merge of pieces. */
const RIGID_SPAN = 32;
const placed = (m: readonly number[], p: Float32Array, v: number): [number, number, number] => {
  const x = p[v] ?? 0, y = p[v + 1] ?? 0, z = p[v + 2] ?? 0;
  return [(m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0), (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z + (m[13] ?? 0),
    (m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 0) * z + (m[14] ?? 0)];
};
function wideCopy(p: NearPrototype, m: readonly number[]): boolean {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let v = 0; v < p.positions.length; v += 3) { const [x, , z] = placed(m, p.positions, v); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  return Math.max(maxX - minX, maxZ - minZ) > RIGID_SPAN;
}
/**
 * One wide copy as its own prototype in cell space, each connected piece (vertices joined by position) sunk rigidly by
 * the lean under its own centre; null when no piece stands on a leaned flank (the copy stays an ordinary copy).
 */
function sinkPieces(p: NearPrototype, m: readonly number[], drop: (x: number, z: number) => number): NearPrototype | null {
  const n = p.positions.length / 3, parent = Int32Array.from({ length: n }, (_, i) => i), byKey = new Map<string, number>();
  const find = (start: number): number => { let r = start; while (parent[r] !== r) r = parent[r] ?? r; for (let i = start; parent[i] !== r;) { const next = parent[i] ?? r; parent[i] = r; i = next; } return r; };
  const join = (a: number, b: number): void => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  for (let v = 0; v < n; v++) {
    const k = `${(p.positions[v * 3] ?? 0).toFixed(4)},${(p.positions[v * 3 + 1] ?? 0).toFixed(4)},${(p.positions[v * 3 + 2] ?? 0).toFixed(4)}`, at = byKey.get(k);
    if (at === undefined) byKey.set(k, v); else join(v, at);
  }
  for (let t = 0; t + 2 < p.index.length; t += 3) { join(p.index[t] ?? 0, p.index[t + 1] ?? 0); join(p.index[t] ?? 0, p.index[t + 2] ?? 0); }
  // each piece's footprint box: a piece wider than RIGID_SPAN itself (a road ribbon, a rope of flags) drapes vertex by
  // vertex over the lean, every other piece sinks rigidly by the lean under its box's centre
  const world = new Float32Array(p.positions.length), box = new Map<number, [number, number, number, number]>();
  for (let v = 0; v < n; v++) {
    const xyz = placed(m, p.positions, v * 3), r = find(v), b = box.get(r) ?? [Infinity, -Infinity, Infinity, -Infinity];
    world.set(xyz, v * 3); b[0] = Math.min(b[0], xyz[0]); b[1] = Math.max(b[1], xyz[0]); b[2] = Math.min(b[2], xyz[2]); b[3] = Math.max(b[3], xyz[2]); box.set(r, b);
  }
  const sink = new Map<number, number | null>();
  for (const [r, [x0, x1, z0, z1]] of box) sink.set(r, Math.max(x1 - x0, z1 - z0) > RIGID_SPAN ? null : drop((x0 + x1) / 2, (z0 + z1) / 2));
  let moved = false;
  for (let v = 0; v < n; v++) {
    const rigid = sink.get(find(v)), d = rigid ?? drop(world[v * 3] ?? 0, world[v * 3 + 2] ?? 0);
    if (d > 0) { world[v * 3 + 1] = (world[v * 3 + 1] ?? 0) - d; moved = true; }
  }
  if (!moved) return null;
  return { name: p.name, positions: world, colours: p.colours, index: p.index, transforms: [[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]] };
}

/** G380: the flat floor of a world with no height field, half a metre under the lowest point of its placed world. */
function floorUnder(prototypes: readonly NearPrototype[], parts: readonly PlaceholderPart[]): PlaceholderGrid {
  let low = Infinity;
  for (const p of prototypes) for (const m of p.transforms) for (let v = 0; v < p.positions.length; v += 3) {
    const x = p.positions[v] ?? 0, y = p.positions[v + 1] ?? 0, z = p.positions[v + 2] ?? 0;
    low = Math.min(low, (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z + (m[13] ?? 0));
  }
  for (const p of parts) for (let v = 1; v < p.positions.length; v += 3) low = Math.min(low, p.positions[v] ?? 0);
  return { res: 2, size: HALF * 2, heights: new Float32Array(4).fill(Number.isFinite(low) ? low - 0.5 : 0), splat: null };
}

/**
 * Bake one near placeholder: the ground at the height field's own density reduced by geometric error, in the shard's far
 * look, with its world's prototypes and its forest's stand-ins merged in at a low LOD; one draw, regions in
 * TEXCOORD_0.x, no colliders. The content budget steps down until the whole cell fits its resident ceiling.
 */
export async function bakeNearPlaceholder(input: NearPlaceholderInput): Promise<{ bytes: Uint8Array; manifest: NearManifest; reduced: NearPlaceholderReport }> {
  const { look, log } = input, grid = input.grid ?? floorUnder(input.prototypes, input.parts ?? []);
  // round 5: what stands on a leaned flank sinks with it (a ridge's trees, a hut on the snow ring), never floats
  const drop = placeholderLeanDrop(grid, NEAR_EDGE_LEAN);
  const trees: PlaceholderTreePlacement[] = [], prototypes: NearPrototype[] = [];
  for (const t of input.trees ?? []) {
    const d = drop(t.x, t.z), sunk: PlaceholderTreePlacement = { ...t, y: t.y - d };
    trees.push(d > 0 ? sunk : t);
  }
  for (const p of input.prototypes) {
    const rigid: (readonly number[])[] = [];
    for (const m of p.transforms) {
      // round 6: a copy wider than one piece (a merged ring of crag fins, a quadrant of dressing) sinks piece by piece:
      // sunk by its origin, the fins on a leaned flank stood in the air over the leaned ground (Nalati's floating spikes)
      const sunk = wideCopy(p, m) ? sinkPieces(p, m, drop) : null;
      if (sunk !== null) { prototypes.push(sunk); continue; }
      const d = drop(m[12] ?? 0, m[14] ?? 0); rigid.push(d > 0 ? m.map((v, i) => i === 13 ? v - d : v) : m);
    }
    if (rigid.length > 0) prototypes.push({ name: p.name, positions: p.positions, colours: p.colours, index: p.index, transforms: rigid });
  }
  const forest = trees.length === 0 ? null : nearTreePrototypes(trees, HALF, input.stands);
  if (forest !== null) log?.(`forest ${JSON.stringify(forest.report)}`);
  const treeParts = forest === null ? { parts: [], report: { triangles: 0 } }
    : await nearPlaceholderParts(forest.prototypes, { triangles: NEAR_TREE_TRIANGLES * 2, half: HALF, minSize: 0 });
  // G380: a land of models, each part re-centred on its own footprint so it falls in the region it stands over
  const land = input.parts === undefined || input.parts.length === 0 ? { parts: [], report: { triangles: 0 } }
    : await nearPlaceholderParts(input.parts.map(landPrototype), { triangles: NEAR_BAKE.landTriangles, half: HALF, minSize: 0 });
  if (land.report.triangles > 0) log?.(`land ${String(land.report.triangles)} tris from ${String(input.parts?.length ?? 0)} model parts`);
  // a forest placed tree by tree replaces its far look's canopy lift; a declared lattice (a cloud sea's one sheet, SF49) wins
  const { canopyAt, ...bare } = look, quads = input.grid === null ? 1 : look.quads ?? NEAR_BAKE.quads,
    nearLook: PlaceholderLook = forest === null || canopyAt === undefined ? { ...look, quads } : { ...bare, quads };
  const groundError = input.groundError ?? NEAR_BAKE.groundError, residentCeiling = input.residentBytes ?? NEAR_BAKE.residentBytes;
  const reduceGround = await nearGroundReducer(groundError);
  if (log !== undefined) {
    const cost = parseGlb(staticGlb([{ geometry: placeholderGeometry(grid, nearLook, [], NEAR_BAKE.triangles, reduceGround, NEAR_EDGE_LEAN), material: new MeshStandardMaterial({ vertexColors: true }), castShadow: false }], 'near-ground'));
    log(`ground at ${groundError} m: ${cost.triangles} tris, resident ${((cost.decoded + cost.gpu) / 1e6).toFixed(3)} MB`);
  }
  let budget: number = NEAR_BAKE.contentTriangles;
  for (;;) {
    const { parts, report: reduced } = await nearPlaceholderParts(prototypes, { triangles: budget, half: HALF, ...(input.floors === undefined ? {} : { floors: input.floors }) });
    const bytes = oneDraw(placeholderGeometry(grid, nearLook, [...parts, ...treeParts.parts, ...land.parts], NEAR_BAKE.triangles + treeParts.report.triangles + land.report.triangles, reduceGround, NEAR_EDGE_LEAN), 'near-placeholder');
    const file = fileRow(bytes);
    if (file.decoded + file.gpu <= residentCeiling) {
      const near: NearManifest['near'] = { files: [file.hash], compressed: file.compressed, decoded: file.decoded, gpu: file.gpu, triangles: file.triangles, draws: file.draws, content: reduced.triangles + land.report.triangles,
        ...(forest === null ? {} : { trees: forest.report.kept, treeTriangles: treeParts.report.triangles }) };
      return { bytes, reduced, manifest: { near, file, look: { family: look.family, haze: look.haze, ...(look.grade === undefined ? {} : { grade: look.grade }) } } };
    }
    if (budget < 4000) throw new Error(`Near placeholder terrain alone exceeds ${residentCeiling} B`);
    budget = Math.floor(budget * 0.9);
  }
}

type Rgb = readonly [number, number, number];
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * The far look of a shard that declares none (any shardfile, an uploaded unknown one included): its ground in its own
 * ambient ground colour easing to a neutral rock on steep slopes, its cliff in that rock, its air its own first fog key's
 * colour.
 */
export function shardfileLook(shard: Shardfile): PlaceholderLook {
  const key = shard.look.keys[0], ground: Rgb = key?.ambient.ground ?? [0.32, 0.36, 0.24], rock: Rgb = [0.33, 0.31, 0.29];
  const fog = key?.fog;
  return {
    family: 'pbr',
    colourAt: (_x, _z, _h, slope) => mixRgb(ground, rock, Math.min(1, Math.max(0, (slope - 0.2) * 3))),
    cliff: { lip: rock, foot: mixRgb(rock, [0, 0, 0], 0.4) },
    haze: { colour: fog?.colour ?? [1, 1, 1] },
  };
}

/** A bare family ID's entry, as the client's implicit family surfaces: plain, vertex-coloured, PBR dielectric. */
const familyDefault = (family: string): Record<string, unknown> => ({ family, vertexColours: true, ...(family === 'pbr' ? { metalness: 0 } : {}) });
/** sRGB to linear, one channel (the catalogue's colours are sRGB; the near bake's vertex colours linear). */
const srgbLinear = (c: number): number => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
/**
 * A coarse tile's surface as the client draws it by default (`installDeclaredProps`): the catalogue entry its GLB
 * material's name binds (`props.materials[name].id`, else `props.family`) tints the GLB's own colour and vertex colours.
 * A graph draws its preset, or its plain fallback, while Settings ▸ Debug ▸ Look ▸ "Graph materials" is off (its
 * default). Returns the linear colour of one vertex from its GLB colour (base colour factor times vertex colour) and first
 * UV: the entry's colour times it; a measure layer (SF56, the template's dev map) paints its role's flat colour from the
 * measure UVs instead (structure orange, trim grey, floor light grey), as its shader does under the grid lines. Colour
 * maps are not sampled.
 */
function tileSurfaces(shard: Shardfile, assets: ReadonlyMap<string, Uint8Array>): (name: string) => (colour: readonly number[], uv: readonly number[] | null) => [number, number, number] {
  const entryOf = (id: string): FamilyMaterialParams => {
    const entry = shard.look.materials[id];
    if (entry === undefined) return parseFamilyMaterial(familyDefault(id));
    if (entry.family !== 'graph') return entry;
    if ('preset' in entry) return entry.preset;
    return parseFamilyMaterial(materialGraphIr(entry, hash => assets.get(hash)).model === 'unlit' ? { family: 'emissive', vertexColours: true } : familyDefault('pbr'));
  };
  const surfaces = new Map<string, (colour: readonly number[], uv: readonly number[] | null) => [number, number, number]>();
  return (name) => {
    const id = shard.props?.materials?.[name]?.id ?? shard.props?.family ?? 'pbr', known = surfaces.get(id);
    if (known !== undefined) return known;
    const entry = entryOf(id), tint = entry.colour.map(srgbLinear);
    const measure = entry.family === 'pbr' ? entry.measure : null;
    const roles = measure === null ? null : [measure.floor, measure.structure, measure.trim, measure.floor].map(rgb => rgb.map(srgbLinear));
    const surface = (colour: readonly number[], uv: readonly number[] | null): [number, number, number] => {
      if (roles !== null) {
        const role = roles[uv === null ? 0 : Math.floor((uv[0] ?? 0) / MEASURE_SLOT) % 4] ?? roles[0] ?? [1, 1, 1];
        return [role[0] ?? 1, role[1] ?? 1, role[2] ?? 1];
      }
      const at = (k: number): number => (tint[k] ?? 1) * (colour[k] ?? 1);
      return [at(0), at(1), at(2)];
    };
    surfaces.set(id, surface);
    return surface;
  };
}

/**
 * A shardfile's drawn static world as near-placeholder prototypes: every mesh of its coarse (L1) tiles' GLBs, each
 * primitive one prototype at its node's world matrix, coloured as the shard's own catalogue draws it (`tileSurfaces`).
 */
export async function shardfileWorld(shard: Shardfile, assets: ReadonlyMap<string, Uint8Array>, skip: (material: string) => boolean = () => false, lod: 0 | 1 = 1): Promise<NearPrototype[]> {
  await MeshoptDecoder.ready;
  const glbs = new Set(shard.files.filter(file => file.kind === 'glb').map(file => file.hash)),
    // RM8.1: tiles carry quantized channels (KHR_mesh_quantization) and may be meshopt-compressed
    io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }),
    out: NearPrototype[] = [], surfaceOf = tileSurfaces(shard, assets);
  for (const tile of shard.tiles) {
    if (tile.lod !== lod) continue;
    for (const ref of tile.files) {
      const bytes = assets.get(ref);
      if (!glbs.has(ref) || bytes === undefined) continue;
      const document = await io.readBinary(Uint8Array.from(bytes));
      for (const node of document.getRoot().listNodes()) {
        const mesh = node.getMesh(); if (mesh === null) continue;
        const matrix = Array.from(node.getWorldMatrix());
        for (const [i, primitive] of mesh.listPrimitives().entries()) {
          const position = primitive.getAttribute('POSITION'), indices = primitive.getIndices(), colour = primitive.getAttribute('COLOR_0'), uv = primitive.getAttribute('TEXCOORD_0');
          if (position === null || primitive.getMode() !== 4 || skip(primitive.getMaterial()?.getName() ?? '')) continue;
          const material = primitive.getMaterial(), surface = surfaceOf(material?.getName() ?? ''), factor = material?.getBaseColorFactor() ?? [1, 1, 1, 1];
          const count = position.getCount(), p = [0, 0, 0], c = [1, 1, 1, 1], t = [0, 0];
          const positions = new Float32Array(count * 3), colours = new Float32Array(count * 3);
          for (let v = 0; v < count; v++) {
            position.getElement(v, p); positions.set([p[0] ?? 0, p[1] ?? 0, p[2] ?? 0], v * 3);
            if (colour !== null) colour.getElement(v, c);
            if (uv !== null) uv.getElement(v, t);
            colours.set(surface([factor[0] * (c[0] ?? 1), factor[1] * (c[1] ?? 1), factor[2] * (c[2] ?? 1)], uv === null ? null : t), v * 3);
          }
          const index = indices === null ? Uint32Array.from({ length: count }, (_, k) => k) : Uint32Array.from({ length: indices.getCount() }, (_, k) => indices.getScalar(k));
          out.push({ name: `${ref.slice(0, 8)}:${node.getName()}:${String(i)}`, positions, colours, index, transforms: [matrix] });
        }
      }
    }
  }
  return out;
}

/**
 * G539: an authored mesh world's own far GLB (`props.far`) gets its impostor too, baked from the GLB's meshes (world
 * positions and vertex colours, else each material's base colour); unchanged when it has one, or when the pair would
 * breach a §3.2 far cap (the proxy then draws at every distance).
 */
async function authoredFarImpostor(shard: Shardfile, assets: Map<string, Uint8Array>): Promise<Shardfile> {
  const far = shard.far, ref = shard.props?.far, glb = ref === null || ref === undefined ? undefined : assets.get(ref);
  if (far === null || far.impostor !== undefined || glb === undefined) return shard;
  await MeshoptDecoder.ready;
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).readBinary(glb);
  const pos: number[] = [], col: number[] = [], idx: number[] = [], e = [0, 0, 0, 0];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (mesh === null) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const p = prim.getAttribute('POSITION'), c = prim.getAttribute('COLOR_0'), index = prim.getIndices(), factor = prim.getMaterial()?.getBaseColorFactor() ?? [1, 1, 1, 1];
      if (p === null) continue;
      const base = pos.length / 3;
      for (let i = 0; i < p.getCount(); i++) {
        p.getElement(i, e);
        const [x = 0, y = 0, z = 0] = e;
        pos.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
        if (c === null) col.push(factor[0], factor[1], factor[2]); else { c.getElement(i, e); col.push((e[0] ?? 1) * factor[0], (e[1] ?? 1) * factor[1], (e[2] ?? 1) * factor[2]); }
      }
      const n = index === null ? p.getCount() : index.getCount();
      for (let k = 0; k < n; k++) idx.push(base + (index === null ? k : index.getScalar(k)));
    }
  }
  if (idx.length < 3) return shard;
  const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(pos), 3)).setAttribute('color', new BufferAttribute(new Float32Array(col), 3)).setIndex(idx);
  const baked = await bakeFarImpostor(geometry, 'pbr');
  const file: PlaceholderFile = { hash: hashImmutableBytes(baked.png), kind: 'image', compressed: baked.png.length, ...assetCost('image', baked.png), dependencies: [], critical: false };
  const next = { ...far, files: [...far.files, file.hash], impostor: { file: file.hash, ...baked.row }, compressed: far.compressed + file.compressed, decoded: far.decoded + file.decoded, gpu: far.gpu + file.gpu };
  if (next.decoded + next.gpu > CONTENT_CAPS.far.resident || next.compressed > CONTENT_CAPS.far.compressed) return shard;
  assets.set(file.hash, baked.png);
  return { ...shard, files: [...shard.files, file], far: next };
}

/** G380 / NM5: a world with no height field's near view from its own coarse tiles (`shardfileWorld`) over a flat floor
 *  under them; unchanged when it has none. */
export async function coarseNearView(shard: Shardfile, assets: Map<string, Uint8Array>, skip?: (material: string) => boolean, opaque?: (material: string) => boolean): Promise<Shardfile> {
  const prototypes = await shardfileWorld(shard, assets, name => skip?.(name) === true || opaque?.(name) === true);
  if (prototypes.length === 0) return shard;
  const baked = await bakeNearPlaceholder({ grid: null, look: shardfileLook(shard), prototypes, residentBytes: Math.min(NEAR_BAKE.residentBytes, NEAR_PLACEHOLDER_LIMITS.contentBytes) });
  const file = baked.manifest.file;
  assets.set(file.hash, baked.bytes);
  // NM13: what `skip` left out is light; it draws in its own additive layer over the near view (the grid's near loader
  // keeps the mesh named NEAR_LIGHT apart from the lit draw)
  const lightBytes = skip === undefined ? null : await nearLightGlb(shard, assets, name => skip(name) && opaque?.(name) !== true), lightFile = lightBytes === null ? null : fileRow(lightBytes);
  if (lightBytes !== null && lightFile !== null) assets.set(lightFile.hash, lightBytes);
  const colourBytes = opaque === undefined ? null : await nearLightGlb(shard, assets, opaque, NEAR_COLOUR), colourFile = colourBytes === null ? null : fileRow(colourBytes);
  if (colourBytes !== null && colourFile !== null) assets.set(colourFile.hash, colourBytes);
  const layers = [file, ...(lightFile === null ? [] : [lightFile]), ...(colourFile === null ? [] : [colourFile])];
  const added = layers.filter(row => !shard.files.some(known => known.hash === row.hash));
  return { ...shard, files: [...shard.files, ...added], near: { version: 1, terrain: [], content: layers.map(row => row.hash) } };
}

/** m²: light triangles smaller than this (a bulb, a firefly) leave the near light layer; pools, windows and lanterns stay */
const NEAR_LIGHT_MIN_AREA = 0.3;
/** The light primitives of the coarse tiles (`light` names their materials) as one non-indexed vertex-colour mesh. */
async function nearLightGlb(shard: Shardfile, assets: ReadonlyMap<string, Uint8Array>, light: (material: string) => boolean, nodeName = NEAR_LIGHT): Promise<Uint8Array | null> {
  const prototypes = await shardfileWorld(shard, assets, name => !light(name)), positions: number[] = [], colours: number[] = [];
  const m = new Matrix4(), a = new Vector3(), b = new Vector3(), c = new Vector3(), e1 = new Vector3(), e2 = new Vector3();
  for (const p of prototypes) for (const t of p.transforms) {
    m.fromArray(t);
    for (let k = 0; k + 2 < p.index.length; k += 3) {
      const ia = p.index[k] ?? 0, ib = p.index[k + 1] ?? 0, ic = p.index[k + 2] ?? 0;
      a.fromArray(p.positions, ia * 3).applyMatrix4(m); b.fromArray(p.positions, ib * 3).applyMatrix4(m); c.fromArray(p.positions, ic * 3).applyMatrix4(m);
      if (e1.subVectors(b, a).cross(e2.subVectors(c, a)).length() / 2 < NEAR_LIGHT_MIN_AREA) continue;
      for (const [v, i] of [[a, ia], [b, ib], [c, ic]] as const) {
        positions.push(v.x, v.y, v.z); colours.push(p.colours[i * 3] ?? 0, p.colours[i * 3 + 1] ?? 0, p.colours[i * 3 + 2] ?? 0);
      }
    }
  }
  if (positions.length === 0) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
  return staticGlb([{ geometry, material: new MeshBasicMaterial({ vertexColors: true }), name: nodeName, castShadow: false }], nodeName);
}

/**
 * G348: `wildshard build`'s placeholders for any shardfile with a terrain: its far proxy when it ships none, and its near
 * placeholder (one render-only GLB in `near.content`) when it declares none, both from its own terrain collider, its own
 * coarse tiles' meshes and its own look. A shard without a height field (an authored mesh world ships its own far) keeps
 * its far and gets its near view from its coarse tiles over a flat floor (G380). New files are added to `assets` and the returned shardfile.
 */
export async function projectPlaceholders(project: Shardfile, assets: Map<string, Uint8Array>): Promise<Shardfile> {
  const shard = await authoredFarImpostor(project, assets);
  const collider = shard.terrain === null ? undefined : assets.get(shard.terrain.collider);
  // G380: a world with no height field (an authored mesh world, which ships its own far) gets its near view from its
  // coarse tiles alone, over a flat floor under them; none when it has no coarse tile meshes
  if (shard.terrain === null && shard.near === undefined) return coarseNearView(shard, assets);
  if (collider === undefined || (shard.far !== null && shard.near !== undefined)) return shard;
  const grid = colliderGrid(collider), look = shardfileLook(shard), files = [...shard.files];
  let far = shard.far, near = shard.near;
  if (far === null) {
    const baked = await bakeFarPlaceholder(grid, look);
    far = baked.manifest.far; files.push(baked.manifest.file, baked.manifest.impostorFile);
    assets.set(baked.manifest.file.hash, baked.bytes); assets.set(baked.manifest.impostorFile.hash, baked.impostor);
  }
  if (near === undefined) {
    const baked = await bakeNearPlaceholder({ grid, look, prototypes: await shardfileWorld(shard, assets), residentBytes: Math.min(NEAR_BAKE.residentBytes, NEAR_PLACEHOLDER_LIMITS.contentBytes) });
    const file = baked.manifest.file;
    if (!files.some(row => row.hash === file.hash)) files.push(file);
    assets.set(file.hash, baked.bytes); near = { version: 1, terrain: [], content: [file.hash] };
  }
  return { ...shard, files, far, near };
}
