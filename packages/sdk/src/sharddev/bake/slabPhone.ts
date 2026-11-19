/**
 * MEMORY-STRUCTURE STR14 (meta `docs/plans/MEMORY-STRUCTURE-PLAN.md`): the phone-Low copy of a slab key's geometry.
 *
 * STR12's probe showed the phone pays for the static triangles it holds (8.2 MB [K] per 100 k on Nine), and slabs are
 * most of Nine's. This writes a second, simplified copy of one key's joined geometry for the phone tier. The desktop
 * geometry is never touched: `bakeWholeSlabs` writes the phone copy only when asked, into its own files.
 *
 * meshoptimizer's attribute-aware simplifier collapses edges onto existing vertices, so every phone vertex is a source
 * vertex with every channel's stored bits (`subset` checks them). `Prune` drops islands smaller than the error (trim,
 * studs, tiny brackets); `Permissive` lets normal and colour seams move, and a vertex on a seam of any other channel
 * (the shader's pattern and face words) is protected, so no pattern crosses onto a neighbouring face.
 *
 * The simplifier's error is a quadric estimate, not a bound, so the result is measured: every source vertex lies within
 * the asked error of the phone surface, or belongs to a dropped island no wider than twice it. The parts with a miss are
 * locked and the key simplified again (up to eight rounds, then whole parts), else the key is left whole.
 */
import { BufferAttribute, type BufferGeometry } from 'three';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import { subset } from './slabChunks';

/** How far a phone copy may go. */
export interface SlabPhoneLod {
  /** The largest surface error allowed, in world metres (the simplifier's absolute quadric error). */
  readonly error: number;
  /** Weight of normal and colour against position in the simplifier's error (default 0.1). */
  readonly attributeWeight?: number;
}
/** One key's phone geometry and what it cost. */
export interface SlabPhoneGeometry {
  readonly geometry: BufferGeometry;
  /** The measured bound, in world metres: the asked error when anything collapsed, else 0. */
  readonly error: number;
  readonly sourceTriangles: number;
  readonly triangles: number;
}

const DEFAULT_WEIGHT = 0.1, MAX_ERROR = 1, SIMPLE = ['normal', 'color'] as const, ROUNDS = 8;
/** meshoptimizer's per-vertex flag: never move this vertex. */
const LOCK = 1;
/** meshoptimizer's per-vertex flag: in permissive mode, never collapse this vertex across an attribute seam. */
const PROTECT = 2;

function rawWords(attribute: BufferAttribute, vertex: number): string {
  const array = attribute.array, width = attribute.itemSize * array.BYTES_PER_ELEMENT;
  const raw = new Uint8Array(array.buffer, array.byteOffset + vertex * width, width);
  return Array.from(raw, byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Vertices that share a position with a vertex whose other (non normal or colour) channels differ. */
function seamProtection(geometry: BufferGeometry, positions: Float32Array): Uint8Array {
  const count = positions.length / 3, flags = new Uint8Array(count), others: BufferAttribute[] = [];
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    if (name === 'position' || (SIMPLE as readonly string[]).includes(name)) continue;
    if (!(attribute instanceof BufferAttribute)) throw new Error('Slab phone geometry needs plain native channels');
    others.push(attribute);
  }
  if (others.length === 0) return flags;
  const words = new Uint32Array(positions.buffer, positions.byteOffset, positions.length), groups = new Map<string, number[]>();
  for (let vertex = 0; vertex < count; vertex++) {
    const key = `${words[vertex * 3]}:${words[vertex * 3 + 1]}:${words[vertex * 3 + 2]}`;
    const group = groups.get(key); if (group === undefined) groups.set(key, [vertex]); else group.push(vertex);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const first = group[0] ?? 0, signature = others.map(attribute => rawWords(attribute, first)).join('|');
    if (group.some(vertex => others.map(attribute => rawWords(attribute, vertex)).join('|') !== signature)) for (const vertex of group) flags[vertex] = PROTECT;
  }
  return flags;
}


/** Union-find over the index: two vertices join when they share a triangle (an island is what the index connects). */
function components(count: number, indices: Uint32Array): Int32Array {
  const parent = new Int32Array(count).map((_, i) => i);
  const find = (v: number): number => { let r = v; while (parent[r] !== r) r = parent[r] ?? r; let c = v; while (parent[c] !== r) { const n = parent[c] ?? r; parent[c] = r; c = n; } return r; };
  const join = (a: number, b: number): void => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  for (let at = 0; at < indices.length; at += 3) { join(indices[at] ?? 0, indices[at + 1] ?? 0); join(indices[at] ?? 0, indices[at + 2] ?? 0); }
  for (let v = 0; v < count; v++) parent[v] = find(v);
  return parent;
}

/** Squared distance from p to triangle abc (Ericson 5.1.5), all as flat xyz offsets into `xyz`. */
function pointTriangle2(xyz: Float32Array, p: number, a: number, b: number, c: number): number {
  const px = xyz[p] ?? 0, py = xyz[p + 1] ?? 0, pz = xyz[p + 2] ?? 0, ax = xyz[a] ?? 0, ay = xyz[a + 1] ?? 0, az = xyz[a + 2] ?? 0;
  const abx = (xyz[b] ?? 0) - ax, aby = (xyz[b + 1] ?? 0) - ay, abz = (xyz[b + 2] ?? 0) - az, acx = (xyz[c] ?? 0) - ax, acy = (xyz[c + 1] ?? 0) - ay, acz = (xyz[c + 2] ?? 0) - az;
  const apx = px - ax, apy = py - ay, apz = pz - az, d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  const at = (s: number, t: number): number => { const x = ax + abx * s + acx * t - px, y = ay + aby * s + acy * t - py, z = az + abz * s + acz * t - pz; return x * x + y * y + z * z; };
  if (d1 <= 0 && d2 <= 0) return at(0, 0);
  const bpx = px - (xyz[b] ?? 0), bpy = py - (xyz[b + 1] ?? 0), bpz = pz - (xyz[b + 2] ?? 0), d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return at(1, 0);
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(d1 / (d1 - d3), 0);
  const cpx = px - (xyz[c] ?? 0), cpy = py - (xyz[c + 1] ?? 0), cpz = pz - (xyz[c + 2] ?? 0), d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return at(0, 1);
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(0, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); return at(1 - w, w); }
  const denom = 1 / (va + vb + vc); return at(vb * denom, vc * denom);
}

/** The source vertices (at most `limit`) neither within `bound` of the kept surface nor in a wholly dropped island
 *  (index-connected) no wider than twice it. A vertex that only zero-area triangles read is never a miss. */
export function boundMisses(positions: Float32Array, indices: Uint32Array, kept: Uint32Array, bound: number, limit?: number): number[] {
  const count = positions.length / 3, used = new Uint8Array(count);
  for (const v of kept) used[v] = 1;
  // a vertex only zero-area source triangles read draws nothing: dropping it is no error
  for (let t = 0; t < indices.length; t += 3) {
    const a = (indices[t] ?? 0) * 3, b = (indices[t + 1] ?? 0) * 3, c = (indices[t + 2] ?? 0) * 3;
    const ux = (positions[b] ?? 0) - (positions[a] ?? 0), uy = (positions[b + 1] ?? 0) - (positions[a + 1] ?? 0), uz = (positions[b + 2] ?? 0) - (positions[a + 2] ?? 0);
    const vx = (positions[c] ?? 0) - (positions[a] ?? 0), vy = (positions[c + 1] ?? 0) - (positions[a + 1] ?? 0), vz = (positions[c + 2] ?? 0) - (positions[a + 2] ?? 0);
    if ((uy * vz - uz * vy) ** 2 + (uz * vx - ux * vz) ** 2 + (ux * vy - uy * vx) ** 2 > 1e-16) for (const k of [0, 1, 2]) if (used[indices[t + k] ?? 0] === 0) used[indices[t + k] ?? 0] = 2;
  }
  for (let v = 0; v < count; v++) used[v] = used[v] === 0 ? 1 : used[v] === 2 ? 0 : 1;
  const owner = components(count, indices), alive = new Uint8Array(count), lo = new Map<number, number[]>();
  for (let v = 0; v < count; v++) if (used[v] === 1) alive[owner[v] ?? 0] = 1;
  for (let v = 0; v < count; v++) {
    const root = owner[v] ?? 0; if (alive[root] === 1) continue;
    const box = lo.get(root) ?? [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let k = 0; k < 3; k++) { const x = positions[v * 3 + k] ?? 0; box[k] = Math.min(box[k] ?? x, x); box[k + 3] = Math.max(box[k + 3] ?? x, x); }
    lo.set(root, box);
  }
  const wide = new Set<number>();
  for (const [root, box] of lo) if (Math.hypot((box[3] ?? 0) - (box[0] ?? 0), (box[4] ?? 0) - (box[1] ?? 0), (box[5] ?? 0) - (box[2] ?? 0)) > 2 * bound) wide.add(root);
  // grids over the kept triangles, each cell no smaller than twice the bound, so the 27 around a vertex cover it; a
  // triangle goes in the finest level it spans at most 4 cells of on each axis (a wall in a coarse level, a stud in the fine)
  const base = Math.max(2 * bound, 0.5), levels = [base, base * 8, base * 64, base * 512].map(cell => ({ cell, grid: new Map<string, number[]>() }));
  for (let t = 0; t < kept.length; t += 3) {
    const a = (kept[t] ?? 0) * 3, b = (kept[t + 1] ?? 0) * 3, c = (kept[t + 2] ?? 0) * 3, low: number[] = [], hi: number[] = [];
    for (let k = 0; k < 3; k++) { const xs = [positions[a + k] ?? 0, positions[b + k] ?? 0, positions[c + k] ?? 0]; low.push(Math.min(...xs)); hi.push(Math.max(...xs)); }
    const level = levels.find(row => [0, 1, 2].every(k => Math.floor((hi[k] ?? 0) / row.cell) - Math.floor((low[k] ?? 0) / row.cell) < 4)) ?? levels[levels.length - 1];
    if (level === undefined) continue;
    const [x0, y0, z0] = low.map(x => Math.floor(x / level.cell)), [x1, y1, z1] = hi.map(x => Math.floor(x / level.cell));
    for (let x = x0 ?? 0; x <= (x1 ?? 0); x++) for (let y = y0 ?? 0; y <= (y1 ?? 0); y++) for (let z = z0 ?? 0; z <= (z1 ?? 0); z++) {
      const key = `${x}:${y}:${z}`, list = level.grid.get(key); if (list === undefined) level.grid.set(key, [t]); else list.push(t);
    }
  }
  const reach = bound * bound, misses: number[] = [];
  for (let v = 0; v < count && misses.length < (limit ?? Infinity); v++) {
    if (used[v] === 1) continue;
    const p = v * 3;
    let near = false;
    for (const { cell, grid } of levels) {
      if (near) break;
      const cx = Math.floor((positions[p] ?? 0) / cell), cy = Math.floor((positions[p + 1] ?? 0) / cell), cz = Math.floor((positions[p + 2] ?? 0) / cell);
      for (let x = cx - 1; x <= cx + 1 && !near; x++) for (let y = cy - 1; y <= cy + 1 && !near; y++) for (let z = cz - 1; z <= cz + 1 && !near; z++)
        for (const t of grid.get(`${x}:${y}:${z}`) ?? []) if (pointTriangle2(positions, p, (kept[t] ?? 0) * 3, (kept[t + 1] ?? 0) * 3, (kept[t + 2] ?? 0) * 3) <= reach) { near = true; break; }
    }
    // not near the kept surface: allowed only in a wholly dropped island no wider than twice the bound
    if (!near && (alive[owner[v] ?? 0] === 1 || wide.has(owner[v] ?? 0))) misses.push(v);
  }
  return misses;
}

/** Is every source vertex within the bound (`boundMisses` finds none)? */
export function withinBound(positions: Float32Array, indices: Uint32Array, kept: Uint32Array, bound: number): boolean {
  return boundMisses(positions, indices, kept, bound, 1).length === 0;
}

/** Simplify one slab key's joined geometry for the phone. `frameScale` (default 1) is the key frame's `positionErrorScale`, so the
 *  error stays in world metres. The source is left as it was; the caller owns the returned geometry. */
export async function phoneSlabGeometry(source: BufferGeometry, lod: SlabPhoneLod, frameScale?: number): Promise<SlabPhoneGeometry> {
  const weight = lod.attributeWeight ?? DEFAULT_WEIGHT;
  if (!(lod.error > 0 && lod.error <= MAX_ERROR)) throw new Error(`Slab phone error ${lod.error} is outside 0 to ${MAX_ERROR} m`);
  if (!(weight >= 0 && weight <= 10)) throw new Error(`Slab phone attribute weight ${weight} is outside 0 to 10`);
  if (frameScale !== undefined && !(frameScale > 0 && Number.isFinite(frameScale))) throw new Error('Slab phone frame scale must be positive');
  const position = source.getAttribute('position'), index = source.getIndex();
  if (!(position instanceof BufferAttribute) || position.itemSize !== 3 || index === null || index.count % 3 !== 0) throw new Error('Slab phone geometry needs indexed triangles');
  const count = position.count, positions = new Float32Array(count * 3), attributes = new Float32Array(count * 6);
  for (let vertex = 0; vertex < count; vertex++) {
    positions[vertex * 3] = position.getX(vertex); positions[vertex * 3 + 1] = position.getY(vertex); positions[vertex * 3 + 2] = position.getZ(vertex);
  }
  if (positions.some(value => !Number.isFinite(value))) throw new Error('Slab phone position is not finite');
  SIMPLE.forEach((name, slot) => {
    const attribute = source.getAttribute(name);
    if (attribute === undefined) return;
    for (let vertex = 0; vertex < count; vertex++) for (let lane = 0; lane < 3; lane++)
      attributes[vertex * 6 + slot * 3 + lane] = lane < attribute.itemSize ? attribute.getComponent(vertex, lane) : 0;
  });
  const indices = Uint32Array.from(index.array), local = lod.error / (frameScale ?? 1), protect = seamProtection(source, positions);
  await MeshoptSimplifier.ready;
  // The simplifier lets a thin part (a cable, a rail) collapse to nothing at any error wider than it. Each round locks
  // the vertices that missed (from the seventh, their whole parts) and simplifies again from the source, until none miss.
  let kept: Uint32Array = indices;
  const owner = components(count, indices), members = new Map<number, number[]>();
  for (let vertex = 0; vertex < count; vertex++) { const root = owner[vertex] ?? 0, list = members.get(root); if (list === undefined) members.set(root, [vertex]); else list.push(vertex); }
  // Prune drops a small island whole, locked or not; a round whose misses are all locked runs without it.
  let prune = true;
  for (let round = 0; round < ROUNDS; round++) {
    const [output, estimate] = MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, attributes, 6, [weight, weight, weight, weight, weight, weight],
      protect, 0, local, prune ? ['ErrorAbsolute', 'Prune', 'Permissive'] : ['ErrorAbsolute', 'Permissive']);
    if (!Number.isFinite(estimate) || estimate < 0 || output.length % 3 !== 0 || output.length > indices.length || output.some(vertex => vertex >= count)) throw new Error('Slab phone simplifier output is invalid');
    const misses = output.length === 0 ? [0] : boundMisses(positions, indices, output, local);
    if (misses.length === 0) { kept = output; break; }
    if (misses.every(vertex => protect[vertex] === LOCK)) prune = false;
    // the missed vertices first; from the seventh round, every vertex of a part with a miss
    if (round < 6) for (const vertex of misses) protect[vertex] = LOCK;
    else for (const root of new Set(misses.map(vertex => owner[vertex] ?? 0))) for (const vertex of members.get(root) ?? []) protect[vertex] = LOCK;
  }
  const remap = new Int32Array(count).fill(-1), order: number[] = [], corners: number[] = [];
  for (const vertex of kept) {
    let at = remap[vertex] ?? -1;
    if (at < 0) { at = order.length; remap[vertex] = at; order.push(vertex); }
    corners.push(at);
  }
  const geometry = subset(source, order, corners);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return { geometry, error: kept.length < indices.length ? lod.error : 0, sourceTriangles: indices.length / 3, triangles: kept.length / 3 };
}
