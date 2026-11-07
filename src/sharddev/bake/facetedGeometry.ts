/** Offline face paint, deformation, AO and culling. No view or material is constructed. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../random';
import { voxelAO, aoTint, hemisphere, addVoxelAOBake } from '@wildshard/engine/world/voxelAO';
import { bakedGeometry } from '@wildshard/engine/world/geometryBake';

/** Compile an offline geometry through the native scoped bake/recorder protocol.
 * IDs, quantized keys, owned cache copies and complete RNG continuation stay native. */
export function bakeCachedGeometry(...args: Parameters<typeof bakedGeometry>): ReturnType<typeof bakedGeometry> { return bakedGeometry(...args); }

/** Compile ordered offline hemisphere rays with the native ring arithmetic. */
export function bakeOcclusionDirections(...args: Parameters<typeof hemisphere>): ReturnType<typeof hemisphere> { return hemisphere(...args); }

/** Bake native face, welded-position or vertex occlusion over caller-owned geometry.
 * Bounds, ground callbacks, recorder keys and scoped cache loans retain their defining law. */
export function bakeVoxelOcclusion(...args: Parameters<typeof voxelAO>): ReturnType<typeof voxelAO> { return voxelAO(...args); }

/** Apply native occlusion to the supplied colour attribute, preserving other channels. */
export function bakeOcclusionTint(...args: Parameters<typeof aoTint>): void { aoTint(...args); }

function wobble(g: THREE.BufferGeometry, amp: number, rng: Pick<Rng, 'range'>): void {
  const pos = g.getAttribute('position');
  const seen = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let d = seen.get(key);
    if (!d) { d = [rng.range(-amp, amp), rng.range(-amp, amp), rng.range(-amp, amp)]; seen.set(key, d); }
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  pos.needsUpdate = true;
}
function swayByHeight(g: THREE.BufferGeometry, w: number, y0: number, y1: number, phase: number): void {
  const pos = g.getAttribute('position'), a = new Float32Array(pos.count * 2), span = y1 - y0 || 1;
  for (let i = 0; i < pos.count; i++) { a[i * 2] = w * Math.min(1, Math.max(0, (pos.getY(i) - y0) / span)); a[i * 2 + 1] = phase; }
  g.setAttribute('aSway', new THREE.BufferAttribute(a, 2));
}

export type ColorLike = THREE.Color | string;

const tmpColor = new THREE.Color();
const asColor = (c: ColorLike): THREE.Color => (typeof c === 'string' ? tmpColor.set(c) : c);

export interface FacetedPartOptions {
  /** per-face lightness jitter, ± fraction (default 0.06) */
  jitter?: number;
  /** applied to the geometry before it is merged */
  matrix?: THREE.Matrix4;
  /** random per-vertex displacement in metres (hand-cut look; default 0) — applied before the matrix */
  wobble?: number;
  /** sways in the shared wind (M5, wind.ts): weight `w` (~1 = cloth), rising with height from the part's base — or, with
   * `hang`, from its top down (a sail, a banner, weed hanging off a rail). Meshes with swaying parts want
   * a sway-patched `mesh.customDepthMaterial` so their shadows move too. */
  sway?: { w: number; phase?: number; hang?: boolean; /** absolute (post-matrix) y where the weight is 0 → where it reaches w (a sail built from many quads) */ span?: [number, number] };
}

export class FacetedGeometryBuilder {
  readonly rng: Rng;
  private parts: THREE.BufferGeometry[] = [];

  constructor(seed: number) { this.rng = new Rng(seed); }

  /** add a geometry painted one colour (per-face jitter); the input is consumed */
  add(g: THREE.BufferGeometry, col: ColorLike, opts: FacetedPartOptions = {}): void {
    const jitter = opts.jitter ?? 0.06;
    if (g.hasAttribute('uv')) g.deleteAttribute('uv');
    if (g.hasAttribute('normal')) g.deleteAttribute('normal');
    if (g.hasAttribute('color')) g.deleteAttribute('color');
    if (opts.wobble !== undefined && opts.wobble > 0) wobble(g, opts.wobble, this.rng);
    const ni = g.index ? g.toNonIndexed() : g;
    if (ni !== g) g.dispose();
    if (opts.matrix) ni.applyMatrix4(opts.matrix);
    const c = asColor(col), r = c.r, gg = c.g, b = c.b;
    const n = ni.getAttribute('position').count, out = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 3) {
      const k = 1 - jitter + this.rng.next() * jitter * 2;
      for (let j = 0; j < 3; j++) { const o = (i + j) * 3; out[o] = r * k; out[o + 1] = gg * k; out[o + 2] = b * k; }
    }
    ni.setAttribute('color', new THREE.BufferAttribute(out, 3));
    if (opts.sway) this.sway(ni, opts.sway);
    this.parts.push(ni);
  }

  private sway(g: THREE.BufferGeometry, sw: NonNullable<FacetedPartOptions['sway']>): void {
    g.computeBoundingBox();
    const bb = g.boundingBox;
    if (!bb) return;
    const phase = sw.phase ?? this.rng.range(0, Math.PI * 2);
    if (sw.span) swayByHeight(g, sw.w, sw.span[0], sw.span[1], phase);
    else if (sw.hang) swayByHeight(g, sw.w, bb.max.y, bb.min.y, phase); else swayByHeight(g, sw.w, bb.min.y, bb.max.y, phase);
  }

  /**
   * add a geometry painted by facing: faces whose (post-matrix) normal points up past `minY` take `top` (moss on a rock,
   * grass on a ledge, sand on a step), the rest `side`; per-face jitter as `add`. The input is consumed.
   */
  addTopped(g: THREE.BufferGeometry, side: ColorLike, top: ColorLike, opts: FacetedPartOptions & { minY?: number } = {}): void {
    const jitter = opts.jitter ?? 0.06, minY = opts.minY ?? 0.55;
    if (g.hasAttribute('uv')) g.deleteAttribute('uv');
    if (g.hasAttribute('normal')) g.deleteAttribute('normal');
    if (g.hasAttribute('color')) g.deleteAttribute('color');
    if (opts.wobble !== undefined && opts.wobble > 0) wobble(g, opts.wobble, this.rng);
    const ni = g.index ? g.toNonIndexed() : g;
    if (ni !== g) g.dispose();
    if (opts.matrix) ni.applyMatrix4(opts.matrix);
    const s = asColor(side).clone(), t = asColor(top).clone();
    const pos = ni.getAttribute('position'), n = pos.count, out = new Float32Array(n * 3);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < n; i += 3) {
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
      b.sub(a); c.sub(a); b.cross(c).normalize();
      const col = b.y > minY ? t : s, k = 1 - jitter + this.rng.next() * jitter * 2;
      for (let j = 0; j < 3; j++) { const o = (i + j) * 3; out[o] = col.r * k; out[o + 1] = col.g * k; out[o + 2] = col.b * k; }
    }
    ni.setAttribute('color', new THREE.BufferAttribute(out, 3));
    this.parts.push(ni);
  }

  /** add several [geometry, colour] parts (a plant, a statue) under one matrix */
  addParts(parts: [THREE.BufferGeometry, ColorLike][], opts: FacetedPartOptions = {}): void {
    for (const [g, c] of parts) this.add(g, c, opts);
  }

  /** add a geometry that already carries a `color` attribute (non-indexed or indexed) */
  addPainted(g: THREE.BufferGeometry, matrix?: THREE.Matrix4): void {
    if (g.hasAttribute('uv')) g.deleteAttribute('uv');
    if (g.hasAttribute('normal')) g.deleteAttribute('normal');
    const ni = g.index ? g.toNonIndexed() : g;
    if (matrix) ni.applyMatrix4(matrix);
    this.parts.push(ni);
  }

  get triangleCount(): number { let n = 0; for (const p of this.parts) n += p.getAttribute('position').count / 3; return n; }

  /** merge everything, flat normals, optional AO bake; the kit is empty afterwards. `hidden` drops the faces no one can
   * see (inside another closed part, or buried: hiddenFaces.ts) after the AO bake, so the kept faces bake as before. */
  finish(opts: { ao?: FacetedAOOptions | false; hidden?: FacetedHiddenOptions } = {}): THREE.BufferGeometry {
    // read before the still parts take a zero aSway: a swaying part never hides another
    const hidden = opts.hidden === undefined ? null : hiddenTriangles(this.parts, opts.hidden);
    // the parts must share their attributes to merge: if any part sways, the still ones get a zero aSway
    if (this.parts.some((p) => p.hasAttribute('aSway'))) for (const p of this.parts) if (!p.hasAttribute('aSway')) p.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(p.getAttribute('position').count * 2), 2));
    let geo = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    geo.computeVertexNormals(); // non-indexed → flat per-face normals
    if (opts.ao !== false) bakeFacetedAO(geo, opts.ao ?? {});
    if (hidden !== null) {
      const flags = new Uint8Array(hidden.reduce((n, part) => n + part.length, 0));
      let at = 0;
      for (const part of hidden) { flags.set(part, at); at += part.length; }
      geo = dropTriangles(geo, flags);
    }
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
}

/** Structural paint sink accepted by higher-level author recipes; no private builder state is borrowed. */
export type FacetedGeometrySink = Pick<FacetedGeometryBuilder, 'rng' | 'add' | 'addTopped' | 'addParts' | 'addPainted' | 'finish'>;

export interface FacetedAOOptions {
  /** terrain height under (x, z) in the geometry's space — cells below it are solid (ground contact AO) */
  ground?: (x: number, z: number) => number;
  /** a constant floor instead of `ground` (creatures / props built at the origin) */
  floorY?: number;
  /** occupancy cell size in metres (default: fit the bbox into ~72 cells on the longest axis, ≥ 0.12) */
  cell?: number;
  /** ray length in metres (default 6 cells) */
  dist?: number;
  /** 0..1 how dark a fully occluded face goes (default 0.62) */
  strength?: number;
  /** colour a fully occluded face is pulled toward (a cool shadow, default a dusky violet) */
  tint?: ColorLike;
  /** faces pointing down lose this much extra light (sky occlusion by orientation, default 0.18) */
  downDark?: number;
}

// 14 hemisphere directions in a +Z-up tangent frame (cosine-ish spread, fixed so bakes are deterministic)
const HEMI = hemisphere([[0.95, 1], [0.72, 5], [0.38, 8]], 1.7);

/**
 * Darken each face of a non-indexed, vertex-coloured geometry by how enclosed it is (the one `voxelAO`, per face). Works
 * in the geometry's own coordinate space (world for placed props, local for creatures).
 */
function bakeFacetedAO(geo: THREE.BufferGeometry, o: FacetedAOOptions = {}): void {
  if (!geo.hasAttribute('color') || geo.index !== null) return;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (bb === null) return;
  const ext = new THREE.Vector3().subVectors(bb.max, bb.min);
  const cell = o.cell ?? Math.max(0.12, Math.max(ext.x, ext.y, ext.z) / 72);
  const { ground, floorY } = o;
  const dist = o.dist ?? cell * 6;
  const tint = new THREE.Color().copy(asColor(o.tint ?? '#4a4466'));
  if (!geo.hasAttribute('normal')) geo.computeVertexNormals();
  const k = voxelAO(geo, {
    box: bb, cell, pad: 2, spacing: 0.7, maxSamples: 400, indexed: false,
    ...(ground ? { ground: { columns: ground } } : floorY !== undefined ? { ground: { columns: () => floorY } } : {}),
    sample: 'face', offset: 1.05, hemi: HEMI, steps: Math.max(3, Math.round(dist / cell)), stepLen: cell, falloff: 0.5,
    strength: o.strength ?? 0.62, downDark: o.downDark ?? 0.18,
  });
  aoTint(geo.getAttribute('color'), k, tint);
}



/**
 * Faces nobody can see, found at bake time (T8: Driftwood's over-cap tiles). A merged low-poly model is a heap of closed
 * parts: crag boulders piled into one another, planks lapped over their neighbours, steps standing on steps. A triangle
 * whose three corners lie inside one other closed part (behind every one of its face planes) is inside that solid, since
 * the region behind all of a closed mesh's planes is convex and lies within it; one resting on such a part's face and
 * turned into it is covered by that face, as is one two closed parts share face to face (a plank's end on the next
 * plank's). A triangle wholly under the terrain is buried. Dropping them leaves every visible pixel as it was.
 * `LowPolyKit.finish({ hidden })` reads this after its AO bake, so the colours the kept faces bake are the ones they
 * always had.
 *
 * A part counts as an occluder only when it is watertight (every edge shared by exactly two of its triangles) and does
 * not sway; parts are non-indexed, world-space triangle soups (the kit's own form).
 */
export interface FacetedHiddenOptions {
  /** the terrain height under (x, z): triangles wholly below it by `margin` are buried */
  readonly ground?: (x: number, z: number) => number;
  /** metres below the ground a buried triangle's corners, edge midpoints and centre must all sit (default 0.25) */
  readonly margin?: number;
}

/** metres: a corner this close to a plane is on it */
const ON = 1e-3;
/** the occluder lookup grid's cell (m, x / z) */
const CELL = 2;

interface Occluder { readonly part: number; readonly min: THREE.Vector3; readonly max: THREE.Vector3; readonly planes: Float64Array; readonly faces: readonly string[] }

/** a triangle's corners in winding order from its smallest corner (the reverse winding reads as the touching face's) */
const faceKey = (k: readonly string[], reverse: boolean): string => {
  const order = reverse ? [k[0] ?? '', k[2] ?? '', k[1] ?? ''] : [k[0] ?? '', k[1] ?? '', k[2] ?? ''];
  let start = 0;
  for (let i = 1; i < 3; i++) if ((order[i] ?? '') < (order[start] ?? '')) start = i;
  return `${order[start] ?? ''}|${order[(start + 1) % 3] ?? ''}|${order[(start + 2) % 3] ?? ''}`;
};

function occluder(g: THREE.BufferGeometry, part: number): Occluder | null {
  const p = g.getAttribute('position').array, n = p.length / 9;
  if (n < 4 || g.hasAttribute('aSway')) return null;
  const key = (i: number): string => `${Math.round((p[i] ?? 0) * 1e4)},${Math.round((p[i + 1] ?? 0) * 1e4)},${Math.round((p[i + 2] ?? 0) * 1e4)}`;
  const edges = new Map<string, number>(), faces: string[] = [];
  for (let t = 0; t < n; t++) {
    const k = [key(t * 9), key(t * 9 + 3), key(t * 9 + 6)];
    faces.push(faceKey(k, false));
    for (let e = 0; e < 3; e++) {
      const a = k[e] ?? '', b = k[(e + 1) % 3] ?? '';
      if (a === b) continue;
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  for (const uses of edges.values()) if (uses !== 2) return null;
  const planes: number[] = [], min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let volume = 0;
  for (let t = 0; t < n; t++) {
    a.fromArray(p, t * 9); b.fromArray(p, t * 9 + 3); c.fromArray(p, t * 9 + 6);
    min.min(a).min(b).min(c); max.max(a).max(b).max(c);
    volume += a.dot(b.clone().cross(c));
    b.sub(a); c.sub(a); b.cross(c);
    const length = b.length();
    if (length < 1e-9) continue;
    b.divideScalar(length);
    planes.push(b.x, b.y, b.z, b.dot(a));
  }
  // inward-wound (or inside-out) parts are not trusted as solids
  return volume > 0 ? { part, min, max, planes: Float64Array.from(planes), faces } : null;
}

/** Whether triangle (a, b, c) with unit normal `normal` is inside `o`, or on one of its faces and turned into it. */
function covered(o: Occluder, corners: Float32Array | Float64Array, at: number, normal: THREE.Vector3): boolean {
  for (let j = 0; j < 3; j++) {
    const x = corners[at + j * 3] ?? 0, y = corners[at + j * 3 + 1] ?? 0, z = corners[at + j * 3 + 2] ?? 0;
    if (x < o.min.x - ON || y < o.min.y - ON || z < o.min.z - ON || x > o.max.x + ON || y > o.max.y + ON || z > o.max.z + ON) return false;
  }
  const pl = o.planes;
  for (let i = 0; i < pl.length; i += 4) {
    const nx = pl[i] ?? 0, ny = pl[i + 1] ?? 0, nz = pl[i + 2] ?? 0, d = pl[i + 3] ?? 0;
    let far = -Infinity, near = Infinity;
    for (let j = 0; j < 3; j++) {
      const s = nx * (corners[at + j * 3] ?? 0) + ny * (corners[at + j * 3 + 1] ?? 0) + nz * (corners[at + j * 3 + 2] ?? 0) - d;
      far = Math.max(far, s); near = Math.min(near, s);
    }
    if (far > ON) return false;
    // lying in this face's plane: only a triangle facing into the solid is covered by it (one facing out would show)
    if (near > -ON && nx * normal.x + ny * normal.y + nz * normal.z > -0.999) return false;
  }
  return true;
}

/** Per part, 1 for each triangle no viewpoint outside the solids and above the ground can see. */
function hiddenTriangles(parts: readonly THREE.BufferGeometry[], options: FacetedHiddenOptions = {}): Uint8Array[] {
  const grid = new Map<string, Occluder[]>(), cell = (x: number, z: number): string => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  // the faces of the closed parts, by winding: a face another closed part shares reversed lies between the two solids
  const faces = new Map<string, number>(), solid: (Occluder | null)[] = [];
  parts.forEach((g, part) => {
    const o = occluder(g, part);
    solid.push(o);
    if (o === null) return;
    for (const face of o.faces) faces.set(face, faces.has(face) && faces.get(face) !== part ? -1 : part);
    for (let gx = Math.floor(o.min.x / CELL); gx <= Math.floor(o.max.x / CELL); gx++) for (let gz = Math.floor(o.min.z / CELL); gz <= Math.floor(o.max.z / CELL); gz++) {
      const k = `${gx},${gz}`, list = grid.get(k);
      if (list === undefined) grid.set(k, [o]); else list.push(o);
    }
  });
  const { ground } = options, margin = options.margin ?? 0.25;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
  const buried = (): boolean => {
    if (ground === undefined) return false;
    const below = (x: number, y: number, z: number): boolean => y < ground(x, z) - margin;
    return below(a.x, a.y, a.z) && below(b.x, b.y, b.z) && below(c.x, c.y, c.z)
      && below((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2) && below((b.x + c.x) / 2, (b.y + c.y) / 2, (b.z + c.z) / 2)
      && below((c.x + a.x) / 2, (c.y + a.y) / 2, (c.z + a.z) / 2) && below((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3);
  };
  return parts.map((g, part) => {
    const p = g.getAttribute('position').array, n = p.length / 9, out = new Uint8Array(n);
    if (!(p instanceof Float32Array)) return out;
    for (let t = 0; t < n; t++) {
      a.fromArray(p, t * 9); b.fromArray(p, t * 9 + 3); c.fromArray(p, t * 9 + 6);
      if (buried()) { out[t] = 1; continue; }
      normal.subVectors(c, a).cross(b.clone().sub(a)).negate();
      const length = normal.length();
      if (length < 1e-12) continue;
      normal.divideScalar(length);
      const own = solid[part]?.faces[t];
      if (own !== undefined) {
        const touching = faces.get(faceKey(own.split('|'), true));
        if (touching !== undefined && touching !== part) { out[t] = 1; continue; }
      }
      for (const o of grid.get(cell(a.x, a.z)) ?? []) if (o.part !== part && covered(o, p, t * 9, normal)) { out[t] = 1; break; }
    }
    return out;
  });
}

/** `geometry` without the triangles `hidden` marks (non-indexed; every attribute kept per remaining vertex). */
function dropTriangles(geometry: THREE.BufferGeometry, hidden: Uint8Array): THREE.BufferGeometry {
  const triangles = geometry.getAttribute('position').count / 3;
  let kept = 0;
  for (let t = 0; t < triangles; t++) if (hidden[t] !== 1) kept++;
  if (kept === triangles) return geometry;
  const out = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    if (!(attribute instanceof THREE.BufferAttribute)) throw new Error(`Interleaved attribute ${name} cannot drop triangles`);
    const size = attribute.itemSize * 3, source = attribute.array, array = source.slice(0, kept * size);
    for (let t = 0, at = 0; t < triangles; t++) if (hidden[t] !== 1) { array.set(source.subarray(t * size, (t + 1) * size), at); at += size; }
    out.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized));
  }
  out.userData = geometry.userData;
  geometry.dispose();
  return out;
}

/** Cull finished non-indexed parts against each other and an explicit optional ground.
 * Unchanged parts retain identity; replaced parts are consumed. All retained attribute bits,
 * normalized flags and userData ownership survive in original part/triangle order. */
export function cullFacetedParts(parts: readonly THREE.BufferGeometry[], options: FacetedHiddenOptions = {}): THREE.BufferGeometry[] {
  const hidden = hiddenTriangles(parts, options);
  return parts.map((geometry, i) => dropTriangles(geometry, hidden[i] ?? new Uint8Array(0)));
}

/** Compile synchronously with a private copy of a committed native AO table.
 * Nested scopes retain prior entries; the new entries are released after success or failure.
 * Malformed tables keep the native fallback march. Thenable results refuse. */
export function withFacetedAO<T>(bytes: Uint8Array, compile: () => T): T {
  const owned = Uint8Array.from(bytes), release = addVoxelAOBake(owned.buffer);
  try {
    const result = compile();
    if (result !== null && (typeof result === 'object' || typeof result === 'function') && 'then' in result && typeof result.then === 'function')
      throw new TypeError('Faceted AO compilation must be synchronous');
    return result;
  } finally { release(); }
}
