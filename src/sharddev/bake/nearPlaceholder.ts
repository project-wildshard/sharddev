import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

/**
 * G342's near-placeholder producer: a shard's drawn static world (its own authored build, harvested in Node by
 * `scripts/bake/near-placeholder.mjs`) reduced to a low-LOD, render-only set of parts inside a triangle budget. Each
 * prototype is welded and simplified once, then placed at every instance; the copies are grouped by the 125 m region
 * (x + 4z, the render rings' numbering) their origin stands in, so a region refined by L1 / L0 tiles hides exactly its
 * own props. Tiny dressing (under `minSize` metres) is dropped: from a neighbour's road it is sub-pixel. No colliders.
 */
export interface NearPrototype {
  readonly name: string;
  /** model-space positions and linear RGB, per vertex */
  readonly positions: Float32Array; readonly colours: Float32Array; readonly index: Uint32Array;
  /** column-major 4 × 4 cell-local matrices, one per placed copy */
  readonly transforms: readonly (readonly number[])[];
}
/** One region's merged copies: cell-local metres, linear RGB, indexed (the far proxy's part shape). */
export interface NearPart { readonly positions: Float32Array; readonly colours: Float32Array; readonly index: Uint32Array }
/**
 * How `nearPlaceholderParts` reduces a shard's harvested world: the cell-wide content triangle budget the prototypes
 * share (each is simplified to one common world-space error, bisected to fit), the cell half-size that clips copies leaving the cell,
 * the smallest copy worth keeping from a neighbour's road, and the floor a kept prototype is never simplified below.
 */
export interface NearPlaceholderOptions {
  /** content triangle budget for the whole cell */
  readonly triangles: number;
  /** cell half-size (m); copies that leave the cell are dropped */
  readonly half: number;
  /** smallest copy (bounding-box diagonal, m) worth keeping */
  readonly minSize?: number;
  /** fewest triangles a kept prototype is simplified to */
  readonly minTriangles?: number;
  /** a higher floor for named prototypes (the shard's `placeholder.near.floors`): one is simplified to at least its
   *  floor, on top of `triangles`, so every other prototype keeps its share */
  readonly floors?: readonly { readonly prototype: string; readonly triangles: number }[];
}
/**
 * What a near-placeholder reduction kept and dropped, for the bake's `--report`: each kept prototype with its placed
 * copies and its triangles after / before simplification, each dropped one with why (malformed, a two-triangle card,
 * every copy too small, or outside the cell), and the content triangles the parts carry in all.
 */
export interface NearPlaceholderReport { readonly kept: { name: string; copies: number; triangles: number; source: number }[]; readonly dropped: { name: string; why: string }[]; readonly triangles: number;
  /** the world-space error (m) every prototype was simplified to; absent when round 3's common ratio was the fallback */
  readonly error?: number }

const REGIONS = 4;

function weld(p: NearPrototype): { positions: Float32Array; colours: Float32Array; index: Uint32Array } {
  const key = new Map<string, number>(), pos: number[] = [], sum: number[] = [], count: number[] = [], slot = new Uint32Array(p.positions.length / 3);
  for (let v = 0; v < slot.length; v++) {
    const x = p.positions[v * 3] ?? 0, y = p.positions[v * 3 + 1] ?? 0, z = p.positions[v * 3 + 2] ?? 0, k = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    let s = key.get(k);
    if (s === undefined) { s = count.length; key.set(k, s); pos.push(x, y, z); sum.push(0, 0, 0); count.push(0); }
    slot[v] = s; sum[s * 3] = (sum[s * 3] ?? 0) + (p.colours[v * 3] ?? 0); sum[s * 3 + 1] = (sum[s * 3 + 1] ?? 0) + (p.colours[v * 3 + 1] ?? 0);
    sum[s * 3 + 2] = (sum[s * 3 + 2] ?? 0) + (p.colours[v * 3 + 2] ?? 0); count[s] = (count[s] ?? 0) + 1;
  }
  const index = Uint32Array.from(p.index, i => slot[i] ?? 0);
  return { positions: Float32Array.from(pos), colours: Float32Array.from(sum, (c, i) => c / (count[Math.floor(i / 3)] ?? 1)), index };
}

function simplify(mesh: { positions: Float32Array; index: Uint32Array }, triangles: number): Uint32Array {
  if (mesh.index.length / 3 <= triangles) return mesh.index;
  // no pruning: a palm's fronds and a tree's needles are small loose pieces, and they are its silhouette
  const target = triangles * 3, [kept] = MeshoptSimplifier.simplify(mesh.index, mesh.positions, 3, target, 1);
  if (kept.length <= target * 1.15 && kept.length > 0) return kept;
  const [sloppy] = MeshoptSimplifier.simplifySloppy(mesh.index, mesh.positions, 3, null, target, 1);
  return sloppy.length > 0 ? sloppy : kept.length > 0 ? kept : mesh.index;
}

/**
 * Near round 6 (Nalati's crags read spiky against the sky from the road): a prototype simplified to a world-space
 * geometric error instead of a share of its own triangles. One error for the whole cell is one screen error at one
 * distance, so a 100 m ridge of rock fins keeps the vertices its skyline needs while a 1 m chest, sub-pixel from a
 * neighbour's road, gives its triangles up; a common ratio cut both by the same 90 % and collapsed every fin to a sliver.
 * `scale` is the copies' largest scale (model-space error is the world error over it).
 */
function atError(mesh: { positions: Float32Array; index: Uint32Array }, metres: number, scale: number): Uint32Array {
  return MeshoptSimplifier.simplify(mesh.index, mesh.positions, 3, 0, metres / scale, ['ErrorAbsolute'])[0];
}
/** The largest scale among a prototype's copies (each matrix's longest basis column). */
const largestScale = (copies: readonly (readonly number[])[]): number => copies.reduce((s, m) => Math.max(s,
  Math.hypot(m[0] ?? 0, m[1] ?? 0, m[2] ?? 0), Math.hypot(m[4] ?? 0, m[5] ?? 0, m[6] ?? 0), Math.hypot(m[8] ?? 0, m[9] ?? 0, m[10] ?? 0)), 1e-6);
/** The least share of its own triangles a prototype keeps under the error search (its thin sheets' silhouette). */
const RATIO_FLOOR = 0.04;
/** The error search's range (m): finer than a vertex weld, coarser than any cell needs. */
const ERROR_RANGE = { lo: 0.005, hi: 200, steps: 22 } as const;

const apply = (m: readonly number[], x: number, y: number, z: number): [number, number, number] => [
  (m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0),
  (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z + (m[13] ?? 0),
  (m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 0) * z + (m[14] ?? 0)];

/** How much a vertex's colour (linear RGB, 0–1) and normal deviation count in the ground's error, in metres a unit. */
export interface NearGroundWeights { readonly colour: number; readonly normal: number }
/** Round 4's weights: a 0.5 colour step or a 1.0 normal turn costs as much as 0.5 m of height. */
export const NEAR_GROUND_WEIGHTS: NearGroundWeights = { colour: 1, normal: 0.5 };

/**
 * G342 round 3 (Jake: "the whole terrain and mountains of Nalati looks super low poly"): the near ground is sampled at
 * the shard's own height-field density and reduced per region by geometric error, so a mountain keeps its ridges and a
 * flat meadow or sea floor spends almost nothing. The region's border stays whole (its skirts hang from it). Pass the
 * result to `buildFarProxy` as its `reduce`.
 */
export async function nearGroundReducer(errorMetres: number, weights: NearGroundWeights = NEAR_GROUND_WEIGHTS): Promise<(positions: Float32Array, index: Uint32Array, attributes?: Float32Array) => Uint32Array> {
  if (!Number.isFinite(errorMetres) || errorMetres <= 0) throw new RangeError('Invalid near ground error');
  if (!Number.isFinite(weights.colour) || weights.colour < 0 || !Number.isFinite(weights.normal) || weights.normal < 0) throw new RangeError('Invalid near ground weights');
  await MeshoptSimplifier.ready;
  return (positions, index, attributes) => {
    // round 4: with the lattice's colours and normals (6 floats a vertex) the error also counts a painted patch, a snow
    // line or a ridge's turn, so the shard's own colouring and creases keep their vertices instead of smearing
    const [kept] = attributes === undefined || (weights.colour === 0 && weights.normal === 0)
      ? MeshoptSimplifier.simplify(index, positions, 3, 3, errorMetres, ['LockBorder', 'ErrorAbsolute'])
      : MeshoptSimplifier.simplifyWithAttributes(index, positions, 3, attributes, 6, [weights.colour, weights.colour, weights.colour, weights.normal, weights.normal, weights.normal],
        null, 3, errorMetres, ['LockBorder', 'ErrorAbsolute']);
    return kept.length > 0 ? kept : index;
  };
}

/** Reduce harvested prototypes to region-grouped parts inside the budget. Deterministic for the same input order. */
export async function nearPlaceholderParts(prototypes: readonly NearPrototype[], options: NearPlaceholderOptions): Promise<{ parts: NearPart[]; report: NearPlaceholderReport }> {
  await MeshoptSimplifier.ready;
  const { half } = options, minSize = options.minSize ?? 1.2, minTriangles = options.minTriangles ?? 6;
  if (!Number.isFinite(options.triangles) || options.triangles <= 0 || !Number.isFinite(half) || half <= 0) throw new RangeError('Invalid near-placeholder budget');
  const dropped: { name: string; why: string }[] = [];
  const live: { name: string; mesh: ReturnType<typeof weld>; copies: (readonly number[])[]; source: number; floor: number }[] = [];
  const floors = new Map((options.floors ?? []).map(f => [f.prototype, f.triangles]));
  for (const p of prototypes) {
    if (p.positions.length % 3 !== 0 || p.colours.length !== p.positions.length || p.index.length % 3 !== 0 || p.index.length === 0) { dropped.push({ name: p.name, why: 'malformed' }); continue; }
    // a two-triangle card is a sprite (a decal, an impostor, a light shaft): untextured it draws as a grey slab
    if (p.index.length <= 6) { dropped.push({ name: p.name, why: 'card' }); continue; }
    const copies: (readonly number[])[] = [];
    let small = 0;
    for (const m of p.transforms) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let v = 0; v < p.positions.length; v += 3) {
        const [x, y, z] = apply(m, p.positions[v] ?? 0, p.positions[v + 1] ?? 0, p.positions[v + 2] ?? 0);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      }
      if (!Number.isFinite(minX) || minX < -half || maxX > half || minZ < -half || maxZ > half) continue;
      if (Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) < minSize) { small++; continue; }
      copies.push(m);
    }
    if (copies.length === 0) { dropped.push({ name: p.name, why: small > 0 ? 'small' : 'outside' }); continue; }
    live.push({ name: p.name, mesh: weld(p), copies, source: p.index.length / 3, floor: Math.max(minTriangles, floors.get(p.name) ?? 0) });
  }
  // round 6: one world-space error for every prototype, bisected (log-spaced) to the budget: the finest whose copies fit.
  // A declared floor is applied after it, on top of the budget, so every other prototype keeps exactly what it has
  // without the floors. Only a cell whose copies overflow the budget even at the coarsest error (thousands of copies of a
  // closed mesh simplify no further) falls back to round 3's common ratio, which the sloppy simplifier can still meet.
  // Thin sheets (a palm's fronds, a bush's leaves) lie within any error a whole cell can afford and would vanish, so no
  // prototype keeps less than `RATIO_FLOOR` of its triangles (round 3's target simplifier, computed once).
  const scales = live.map(l => largestScale(l.copies)), memo = live.map(() => new Map<number, Uint32Array>()), least: (Uint32Array | undefined)[] = [];
  const reducedAt = (i: number, e: number): Uint32Array => {
    const l = live[i], m = memo[i];
    if (l === undefined || m === undefined) return new Uint32Array(0);
    let index = m.get(e);
    if (index === undefined) {
      index = atError(l.mesh, e, scales[i] ?? 1);
      const floor = Math.min(l.source, Math.max(minTriangles, Math.ceil(l.source * RATIO_FLOOR)));
      if (index.length / 3 < floor) { least[i] ??= simplify(l.mesh, floor); index = least[i]; }
      m.set(e, index);
    }
    return index;
  };
  const errorTotal = (e: number): number => live.reduce((sum, l, i) => sum + (reducedAt(i, e).length / 3) * l.copies.length, 0);
  // round 3's fallback below: one scale for every prototype's share of its own triangles, bisected to the budget; a cell
  // whose whole world fits the budget keeps every triangle (no error search)
  const total = (s: number): number => live.reduce((sum, l) => sum + Math.min(l.source, Math.max(minTriangles, Math.floor(l.source * s))) * l.copies.length, 0);
  let error: number | null = null;
  if (total(1) > options.triangles && errorTotal(ERROR_RANGE.hi) <= options.triangles) {
    let fine = Math.log(ERROR_RANGE.lo), coarse = Math.log(ERROR_RANGE.hi);
    if (errorTotal(ERROR_RANGE.lo) <= options.triangles) coarse = fine;
    else for (let k = 0; k < ERROR_RANGE.steps; k++) { const mid = (fine + coarse) / 2; if (errorTotal(Math.exp(mid)) <= options.triangles) coarse = mid; else fine = mid; }
    error = Math.exp(coarse);
  }
  let lo = 0, hi = 1;
  if (error !== null) lo = 1;
  else if (total(1) > options.triangles) { for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (total(mid) <= options.triangles) lo = mid; else hi = mid; } } else lo = 1;
  const regions = Array.from({ length: REGIONS * REGIONS }, () => ({ positions: [] as number[], colours: [] as number[], index: [] as number[] }));
  const kept: NearPlaceholderReport['kept'] = [];
  let triangles = 0;
  const size = (2 * half) / REGIONS, cell = (u: number): number => Math.min(REGIONS - 1, Math.max(0, Math.floor((u + half) / size)));
  for (const [at, l] of live.entries()) {
    // at the common error a declared floor still lifts its prototype on top of the budget
    const atErr = error === null ? null : reducedAt(at, error), floor = floors.get(l.name) ?? 0;
    const index = atErr === null ? simplify(l.mesh, Math.min(l.source, Math.max(l.floor, Math.floor(l.source * lo))))
      : atErr.length / 3 >= Math.min(l.source, floor) ? atErr : simplify(l.mesh, Math.min(l.source, floor)), used = new Map<number, number>(), order: number[] = [];
    for (const i of index) if (!used.has(i)) { used.set(i, order.length); order.push(i); }
    const local = Uint32Array.from(index, i => used.get(i) ?? 0);
    for (const m of l.copies) {
      const region = regions[cell(m[12] ?? 0) + cell(m[14] ?? 0) * REGIONS];
      if (region === undefined) continue;
      const base = region.positions.length / 3;
      for (const i of order) {
        const [x, y, z] = apply(m, l.mesh.positions[i * 3] ?? 0, l.mesh.positions[i * 3 + 1] ?? 0, l.mesh.positions[i * 3 + 2] ?? 0);
        region.positions.push(Math.min(half, Math.max(-half, x)), y, Math.min(half, Math.max(-half, z)));
        region.colours.push(l.mesh.colours[i * 3] ?? 0, l.mesh.colours[i * 3 + 1] ?? 0, l.mesh.colours[i * 3 + 2] ?? 0);
      }
      for (const i of local) region.index.push(base + i);
    }
    triangles += (local.length / 3) * l.copies.length;
    kept.push({ name: l.name, copies: l.copies.length, triangles: local.length / 3, source: l.source });
  }
  const parts = regions.filter(r => r.index.length > 0).map(r => ({ positions: Float32Array.from(r.positions), colours: Float32Array.from(r.colours), index: Uint32Array.from(r.index) }));
  return { parts, report: { kept, dropped, triangles, ...(error === null ? {} : { error }) } };
}
