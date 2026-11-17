import { encodeMeshCollision, MESH_COLLISION_LIMITS } from '@wildshard/format/meshCollisionBytes';
import { hashImmutableBytes } from '../immutable';
import type { NormalizedWorld, WorldPanel, WorldPrimitive } from './world';

type Point = readonly [number, number, number];
interface Chunk { vertices: number[]; indices: number[]; welded: Map<string, number> }
/** One nonempty 62.5 m collision tile. The hash refers to exact cell-local WMC1 bytes. */
export interface WorldCollisionTile { x: number; z: number; file: string; triangles: number }
/** Interactive geometry stays independent of static tiles, in its authored world rest pose. */
export interface WorldCollisionPanel { id: string; colliderId: string; file: string; triangles: number }
/** Deterministic collision bake; byte costs and critical-root admission are applied by the compiled product builder. */
export interface BakedWorldCollision { tiles: WorldCollisionTile[]; panels: WorldCollisionPanel[]; assets: Map<string, Uint8Array> }

const SIZE = 62.5, HALF = 250;
const chunk = (): Chunk => ({ vertices: [], indices: [], welded: new Map() });
function area(a: Point, b: Point, c: Point): number {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}
function append(out: Chunk, a: Point, b: Point, c: Point, node: string): void {
  // A polygon may touch a tile only along an edge. That intersection has no collision area.
  if (area(a, b, c) === 0) return;
  const rounded = [a, b, c].map((p): Point => [Math.fround(p[0]) || 0, Math.fround(p[1]) || 0, Math.fround(p[2]) || 0]);
  const [ra, rb, rc] = rounded;
  if (ra === undefined || rb === undefined || rc === undefined) throw new Error('World collision missing rounded triangle');
  // The source passed Float32 admission below. Clipping can leave an unrepresentable seam sliver.
  if (area(ra, rb, rc) === 0) return;
  if (out.indices.length / 3 >= MESH_COLLISION_LIMITS.triangles) throw new Error(`World collision node ${node} exceeds triangles per chunk`);
  for (const vertex of rounded) {
    const key = vertex.join(','); let index = out.welded.get(key);
    if (index === undefined) {
      index = out.vertices.length / 3;
      if (index >= MESH_COLLISION_LIMITS.vertices) throw new Error(`World collision node ${node} exceeds vertices per chunk`);
      out.welded.set(key, index); out.vertices.push(...vertex);
    }
    out.indices.push(index);
  }
}
function clip(polygon: readonly Point[], axis: 0 | 2, boundary: number, greater: boolean): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length]; if (a === undefined || b === undefined) throw new Error('World collision polygon');
    const insideA = greater ? a[axis] >= boundary : a[axis] <= boundary, insideB = greater ? b[axis] >= boundary : b[axis] <= boundary;
    if (insideA) result.push(a);
    if (insideA === insideB) continue;
    // Oppositely wound shared edges interpolate in the same direction, avoiding last-bit seam drift.
    const forward = a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])));
    const start = forward ? a : b, end = forward ? b : a;
    const t = (boundary - start[axis]) / (end[axis] - start[axis]);
    const p: [number, number, number] = [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t, start[2] + (end[2] - start[2]) * t];
    p[axis] = boundary; result.push(p);
  }
  return result;
}
function point(primitive: WorldPrimitive, index: number, transform?: readonly number[]): Point {
  const x = primitive.positions[index * 3], y = primitive.positions[index * 3 + 1], z = primitive.positions[index * 3 + 2];
  if (x === undefined || y === undefined || z === undefined) throw new Error(`World collision node ${primitive.node} has an invalid index`);
  const value: Point = transform === undefined ? [x, y, z] : [
    (transform[0] ?? 0) * x + (transform[4] ?? 0) * y + (transform[8] ?? 0) * z + (transform[12] ?? 0),
    (transform[1] ?? 0) * x + (transform[5] ?? 0) * y + (transform[9] ?? 0) * z + (transform[13] ?? 0),
    (transform[2] ?? 0) * x + (transform[6] ?? 0) * y + (transform[10] ?? 0) * z + (transform[14] ?? 0),
  ];
  if (value.some(v => !Number.isFinite(v) || Math.abs(v) > HALF)) throw new Error(`World collision node ${primitive.node} outside finite cell bounds`);
  return value;
}
function transformOf(panel: WorldPanel): { transform: number[]; mirrored: boolean } {
  const m = panel.transform;
  if (m.length !== 16 || m.some(v => !Number.isFinite(v)) || m[3] !== 0 || m[7] !== 0 || m[11] !== 0 || m[15] !== 1) throw new Error(`World collision panel ${panel.id} requires a finite affine transform`);
  const a = m[0] ?? 0, b = m[4] ?? 0, c = m[8] ?? 0, d = m[1] ?? 0, e = m[5] ?? 0, f = m[9] ?? 0, g = m[2] ?? 0, h = m[6] ?? 0, i = m[10] ?? 0;
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!Number.isFinite(determinant) || determinant === 0) throw new Error(`World collision panel ${panel.id} has a singular transform`);
  return { transform: m, mirrored: determinant < 0 };
}
function triangles(primitive: WorldPrimitive, visit: (a: Point, b: Point, c: Point) => void, transform?: readonly number[], mirrored = false): void {
  if (!(primitive.positions instanceof Float64Array) || primitive.positions.length % 3 !== 0 || primitive.positions.length < 9 || primitive.positions.length > 12_000_000
    || !(primitive.indices instanceof Uint32Array) || primitive.indices.length < 3 || primitive.indices.length % 3 !== 0 || primitive.indices.length > 12_000_000) throw new Error(`World collision node ${primitive.node} has malformed bounded geometry`);
  for (let i = 0; i < primitive.indices.length; i += 3) {
    const a = primitive.indices[i], b = primitive.indices[i + 1], c = primitive.indices[i + 2];
    if (a === undefined || b === undefined || c === undefined) throw new Error('World collision missing triangle');
    const pa = point(primitive, a, transform), pb = point(primitive, mirrored ? c : b, transform), pc = point(primitive, mirrored ? b : c, transform);
    if (area(pa, pb, pc) === 0) throw new Error(`World collision node ${primitive.node} has a degenerate triangle`);
    const rounded = [pa, pb, pc].map((p): Point => [Math.fround(p[0]), Math.fround(p[1]), Math.fround(p[2])]);
    const [ra, rb, rc] = rounded;
    if (ra === undefined || rb === undefined || rc === undefined || area(ra, rb, rc) === 0) throw new Error(`World collision node ${primitive.node} has a triangle that collapses at Float32 precision`);
    visit(pa, pb, pc);
  }
}
const address = (value: number): number => Math.min(7, Math.floor((value + HALF) / SIZE));

/** Partition actual collision triangles at the L0 lattice, weld exact Float32 seams, and bake panels independently.
 * No LOD is applied to collision: a bridge, its underside and its ground survive as separate triangles.
 * Vertical triangles exactly on a lattice line have one owner (the positive-side tile, or the last tile at +250).
 */
export function bakeWorldCollision(world: Pick<NormalizedWorld, 'collision' | 'panels'>): BakedWorldCollision {
  if (world.collision.length === 0 || world.collision.length > 10000 || world.panels.length > 64) throw new Error('World collision requires bounded static geometry and panels');
  const chunks = new Map<number, Chunk>(), assets = new Map<string, Uint8Array>(), panels: WorldCollisionPanel[] = [];
  let components = 0;
  const bound = (p: WorldPrimitive): void => { components += p.indices.length; if (components > 12_000_000) throw new Error('World collision expanded index cap'); };
  for (const primitive of world.collision) {
    bound(primitive);
    triangles(primitive, (a, b, c) => {
      const x0 = address(Math.min(a[0], b[0], c[0])), x1 = address(Math.max(a[0], b[0], c[0])), z0 = address(Math.min(a[2], b[2], c[2])), z1 = address(Math.max(a[2], b[2], c[2]));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        let polygon: Point[] = [a, b, c];
        for (const [axis, boundary, greater] of [[0, -HALF + x * SIZE, true], [0, -HALF + (x + 1) * SIZE, false], [2, -HALF + z * SIZE, true], [2, -HALF + (z + 1) * SIZE, false]] as const) polygon = clip(polygon, axis, boundary, greater);
        const key = z * 8 + x, output = chunks.get(key) ?? chunk();
        for (let i = 1; i + 1 < polygon.length; i++) {
          const first = polygon[0], second = polygon[i], third = polygon[i + 1]; if (first === undefined || second === undefined || third === undefined) throw new Error('World collision clipped triangle');
          append(output, first, second, third, primitive.node);
        }
        if (output.indices.length > 0) chunks.set(key, output);
      }
    });
  }
  const store = (data: Chunk): string => {
    const bytes = encodeMeshCollision({ vertices: Float32Array.from(data.vertices), indices: Uint32Array.from(data.indices) }), hash = hashImmutableBytes(bytes);
    assets.set(hash, bytes); return hash;
  };
  const ids = new Set<string>(), colliderIds = new Set<string>();
  for (const panel of world.panels) {
    if (ids.has(panel.id) || colliderIds.has(panel.colliderId) || panel.primitives.length === 0 || panel.primitives.length > 10000) throw new Error(`World collision duplicate or empty panel ${panel.id}`);
    ids.add(panel.id); colliderIds.add(panel.colliderId);
    const output = chunk(), { transform, mirrored } = transformOf(panel);
    for (const primitive of panel.primitives) { bound(primitive); triangles(primitive, (a, b, c) => append(output, a, b, c, primitive.node), transform, mirrored); }
    panels.push({ id: panel.id, colliderId: panel.colliderId, file: store(output), triangles: output.indices.length / 3 });
  }
  return { tiles: [...chunks].sort(([a], [b]) => a - b).map(([key, data]) => ({ x: key % 8, z: Math.floor(key / 8), file: store(data), triangles: data.indices.length / 3 })), panels, assets };
}
