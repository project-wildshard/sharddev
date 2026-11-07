import type { NavMesh } from 'navcat';
import { generateTiledNavMesh } from 'navcat/blocks';

/** World-space triangles, in authored order and with upward walkable faces. No runtime datum is applied here. */
export interface NavigationSoup { positions: ArrayLike<number>; indices: ArrayLike<number> }
/** One agent's clearance and slope, in metres and degrees; the layer name is metadata only. */
export interface NavigationLayer { name: string; radius: number; height: number; climb: number; slope: number }
/** Explicit recast settings. maxEdgeLength is in metres, matching the retained native baker. */
export interface NavigationSettings {
  cellSize: number; cellHeight: number; tileSizeVoxels: number;
  minRegionArea: number; mergeRegionArea: number; maxSimplificationError: number;
  maxEdgeLength: number; maxVerticesPerPoly: number;
  detailSampleDistance: number; detailSampleMaxError: number;
}
/** Counts from the exact serialized tiles; omitted detail fans are rebuilt by the runtime reader. */
export interface NavigationLayerStats {
  tiles: number; polys: number; verts: number; detailVerts: number; detailTris: number;
}
/** Complete WSNM v1 bytes and the corresponding ordered layer metadata. */
export interface BakedNavigation {
  version: 1; bytes: Uint8Array; layers: (NavigationLayer & NavigationLayerStats)[];
}
const VERSION = 1, Q = 100, NEI_EXT = 248;

function component(values: ArrayLike<number>, index: number): number {
  const value = values[index];
  if (value === undefined) throw new Error('bake-navmesh: incomplete vertex');
  return value;
}

function generate(soup: NavigationSoup, layer: NavigationLayer, GEN: NavigationSettings): NavMesh {
  const { cellSize, cellHeight, tileSizeVoxels } = GEN;
  const walkableRadiusVoxels = Math.max(1, Math.round(layer.radius / cellSize));
  const opts = {
    cellSize, cellHeight, tileSizeVoxels, tileSizeWorld: tileSizeVoxels * cellSize,
    walkableRadiusVoxels, walkableRadiusWorld: layer.radius,
    walkableClimbVoxels: Math.floor(layer.climb / cellHeight + 1e-6), walkableClimbWorld: layer.climb,
    walkableHeightVoxels: Math.ceil(layer.height / cellHeight - 1e-6), walkableHeightWorld: layer.height,
    walkableSlopeAngleDegrees: layer.slope, borderSize: walkableRadiusVoxels + 3,
    minRegionArea: GEN.minRegionArea, mergeRegionArea: GEN.mergeRegionArea, maxSimplificationError: GEN.maxSimplificationError,
    maxEdgeLength: Math.round(GEN.maxEdgeLength / cellSize), maxVerticesPerPoly: GEN.maxVerticesPerPoly,
    detailSampleDistance: GEN.detailSampleDistance, detailSampleMaxError: GEN.detailSampleMaxError,
  };
  return generateTiledNavMesh({ positions: soup.positions, indices: soup.indices }, opts).navMesh;
}

// ── the file ─────────────────────────────────────────────────────────────────────────────────────────────────────────
class Writer {
  buf = new DataView(new ArrayBuffer(1 << 20)); at = 0;
  room(n: number): void { if (this.at + n <= this.buf.byteLength) return; const next = new DataView(new ArrayBuffer(Math.max(this.buf.byteLength * 2, this.at + n))); new Uint8Array(next.buffer).set(new Uint8Array(this.buf.buffer, 0, this.at)); this.buf = next; }
  u8(...vs: number[]): void { this.room(vs.length); for (const v of vs) { if (!(v >= 0 && v <= 0xff)) throw new Error(`bake-navmesh: ${v} is not a u8`); this.buf.setUint8(this.at++, v); } }
  u16(...vs: number[]): void { this.room(vs.length * 2); for (const v of vs) { if (!(v >= 0 && v <= 0xffff)) throw new Error(`bake-navmesh: ${v} is not a u16`); this.buf.setUint16(this.at, v, true); this.at += 2; } }
  u32(...vs: number[]): void { this.room(vs.length * 4); for (const v of vs) { this.buf.setUint32(this.at, v, true); this.at += 4; } }
  i32(...vs: number[]): void { this.room(vs.length * 4); for (const v of vs) { this.buf.setInt32(this.at, v, true); this.at += 4; } }
  f32(...vs: number[]): void { this.room(vs.length * 4); for (const v of vs) { this.buf.setFloat32(this.at, v, true); this.at += 4; } }
  bytes(): Uint8Array { return new Uint8Array(this.buf.buffer, 0, this.at); }
}

/** `v` in `step`s above `min`, which must land on the grid (recast's vertices are voxel corners). */
function onGrid(v: number, min: number, step: number): number {
  const q = Math.round((v - min) / step);
  if (Math.abs(min + q * step - v) > 1e-3) throw new Error(`bake-navmesh: vertex ${v} is off the ${step} m grid from ${min}`);
  return q;
}

function writeLayer(w: Writer, layer: NavigationLayer, nav: NavMesh, GEN: NavigationSettings): NavigationLayerStats {
  const tiles = Object.values(nav.tiles);
  const { cellSize: cs, cellHeight: ch } = GEN;
  w.f32(layer.radius, layer.height, layer.climb, cs, ch, ...nav.origin, nav.tileWidth);
  w.u32(tiles.length);
  const stats = { tiles: tiles.length, polys: 0, verts: 0, detailVerts: 0, detailTris: 0 };
  for (const t of tiles) {
    const b = t.bounds, nv = t.vertices.length / 3, nd = t.detailVertices.length / 3;
    w.i32(t.tileX, t.tileY); w.f32(...b); w.u16(nv, t.polys.length, nd);
    const V = t.vertices;
    for (let i = 0; i < nv; i++) w.u8(onGrid(component(V, i * 3), b[0], cs));
    for (let i = 0; i < nv; i++) w.u8(onGrid(component(V, i * 3 + 2), b[2], cs));
    for (let i = 0; i < nv; i++) w.u16(onGrid(component(V, i * 3 + 1), b[1], ch));
    w.u8(...t.polys.map((p) => p.vertices.length)); w.u8(...t.polys.map((p) => p.area)); w.u8(...t.polys.map((p) => p.flags));
    const idx = t.polys.flatMap((p) => p.vertices);
    if (nv <= 256) w.u8(...idx); else w.u16(...idx);
    // neighbours: 0 none, i + 1 poly i of this tile, 0x8000 | side a portal to the next tile — one byte when the tile allows
    const neis = t.polys.flatMap((p) => p.neis);
    if (t.polys.length < NEI_EXT) w.u8(...neis.map((n) => (n & 0x8000 ? NEI_EXT + (n & 0xff) : n))); else w.u16(...neis);
    // the detail mesh only where recast added height samples; a poly without is fanned from its own vertices at load
    const keep: boolean[] = [];
    let vb = 0, tb = 0;
    for (const m of t.detailMeshes) {
      if (m.verticesBase !== vb || m.trianglesBase !== tb) throw new Error('bake-navmesh: detail meshes are not in poly order');
      vb += m.verticesCount; tb += m.trianglesCount;
      keep.push(m.verticesCount > 0);
    }
    w.u8(...t.detailMeshes.map((m) => m.verticesCount)); w.u8(...t.detailMeshes.map((m, i) => (keep[i] ? m.trianglesCount : 0)));
    const D = t.detailVertices;
    for (let i = 0; i < D.length; i++) w.u16(Math.round((component(D, i) - component(b, i % 3)) * Q));
    let kept = 0;
    t.detailMeshes.forEach((m, i) => { if (keep[i]) { w.u8(...t.detailTriangles.slice(m.trianglesBase * 4, (m.trianglesBase + m.trianglesCount) * 4)); kept += m.trianglesCount; } });
    stats.polys += t.polys.length; stats.verts += nv; stats.detailVerts += nd; stats.detailTris += kept;
  }
  return stats;
}


/** Compile authored triangles to the existing WSNM v1 transport, without a renderer or game services.
 * Preserve triangle, layer and tile insertion order. The caller owns collider collection, wet-ground exclusion
 * and authored-frame datum. This compiler does not turn a runtime capture into an author-only producer.
 */
export function bakeNavigation(soup: NavigationSoup, layers: readonly NavigationLayer[], settings: NavigationSettings): BakedNavigation {
  const writer = new Writer();
  writer.u8(0x57, 0x53, 0x4e, 0x4d); writer.u32(VERSION, layers.length);
  const rows = layers.map(layer => ({ ...layer, ...writeLayer(writer, layer, generate(soup, layer, settings), settings) }));
  return { version: VERSION, bytes: writer.bytes(), layers: rows };
}
