import { Box3, BufferAttribute, BufferGeometry, Float16BufferAttribute, Float32BufferAttribute, Matrix3, Matrix4, Mesh, MeshStandardMaterial, SkinnedMesh, Vector3, type Object3D } from 'three';
import { CONTENT_CAPS, CELL_ABOVE, CELL_BELOW } from '@wildshard/format/contentBounds';
import { PropsSchema, type ShardProps } from '@wildshard/format/props';
import type { Shardfile } from '@wildshard/format/shardSchema';
import * as v from 'valibot';
import { parseGlb, parseKtx2 } from '../assets';
import { hashImmutableBytes as contentHash } from '@wildshard/engine/host/immutable';
import { staticGlb, type GlbPrimitive } from './glb';
import { compressGlb } from './glbCompression';
import { tileGrid, tileGridTransform, type TileGrid } from './worldGeometry';
import { positionErrorScale, floatPositionError, gridPositionError } from './geometryError';

/** A reusable scatter shape and its world-local positive TRS matrices; generators run only at build time. */
export interface PropScatter { model: Object3D; transforms: readonly Matrix4[] }
/** Trusted static content. Named panels remain separate, and coarse/far replacements are optional build-time inputs. */
export interface PropsBakeSource {
  static: Object3D; scatter?: readonly PropScatter[];
  /** A panel draws in `materialName` (a `props.materials` name; omitted: the merged surfaces' own) and casts a shadow unless
   *  `castShadow` is false: a shadowless panel costs each L0 tile it touches one draw, not two. Omitted keeps native bytes. */
  panels?: readonly { id: string; model: Object3D; visible?: boolean; materialName?: string; castShadow?: boolean }[]; colliders?: ShardProps['colliders']; models?: readonly { id: string; model: Object3D }[];
  /** Achieved source simplification error in world metres, before tile storage rounding. */
  coarseErrorMetres?: number;
  coarse?: Object3D; far?: Object3D; family?: string; colourTexture?: Uint8Array;
  /** GLB material name for merged surfaces; bind it through props.materials. Omitted keeps native unnamed bytes. */
  materialName?: string;
  /** Lossless meshopt tile transport, selected only when it reduces bytes.
   * Library/panel/far bytes stay unchanged; omitted keeps pinned native bytes. */
  tileCompression?: 'meshopt';
  /** Optional named-tile transport, after geometry emission and before hash/cost derivation.
   * Receives owned bytes; only tile files invoke it, never libraries, panels or far proxies.
   * The compiler copies the returned bytes so retained encoder buffers cannot mutate output. */
  encodeTileBlob?: (name: string, bytes: Uint8Array) => Uint8Array;
  /** G748 / tile streaming T8: whole shapes simplified for the L1 tiles, each kept whole with its own channels in the L1 tile
   *  holding its origin (never partitioned; a shard whose look lives in custom channels keeps it far away too). */
  coarseWhole?: readonly PropWhole[];
  /** Shapes baked whole (`PropWhole`), each one named node in the L0 tile that holds its origin. */
  whole?: readonly PropWhole[];
}
/**
 * A mesh kept whole in its own frame, never cut at a tile seam: one GLB node named `id` (a loader-safe identifier) at
 * `transform` (positive TRS) with the mesh's own attributes and index (or none), owned by the L0 tile holding its origin (in no coarse tile
 * and no far proxy: a whole shape is never decimated), so a runtime drawing it in its own material finds it by name and draws exactly the triangles it built. Its surface is opaque,
 * untextured, nonmetal and white (the colour is the vertices'); the GLB keeps its roughness and its `castShadow`.
 */
export interface PropWhole {
  id: string; mesh: Mesh; transform: Matrix4;
  /** Accumulated achieved source simplification error, in the geometry's local metres. */
  geometricError?: number;
  /** Preserve an explicit receive-shadow flag; omitted keeps the tile reader's existing true default. */
  receiveShadow?: boolean;
  /** GLB surface name for this unchanged whole shape; overrides PropsBakeSource.materialName. */
  materialName?: string;
  /** Application semantic → source channel, retained whole beside positions, normals and colours. */
  customAttributes?: GlbPrimitive['customAttributes'];
  /** Preserve typed channels and source transform doubles in GLB node extras (see staticGlb). */
  nativeAttributes?: true;
  /** Assign each unchanged triangle to its world-space centroid's tile; extras retain exact assembly ordinals.
   *  `'runs'` writes those ordinals as `{ runs }` (`wholePartitionRuns`): the same assembly, far fewer JSON bytes. */
  partition?: true | 'runs';
  /** Declared visual edge allowance; default zero, hard capped at one metre. No vertex is clipped. */
  overhang?: number;
  /** iPhone downloads I3: ship a native shape's normals / colours as Int8 / Uint8 and, partitioned, its positions on one
   *  Int16 grid (`compactWholeChannels`, `wholeGrid`); its readers restore them within their storage step. Opt-in, so a
   *  producer whose retained tile hashes are pinned keeps its exact bytes. */
  compact?: true;
  /** With `compact`: a shape whose colours leave [0, 1] (a glow) still ships on its grid with Int8 normals, its colours
   *  float32 (`compactWholeNormals`). Opt-in apart, so a producer already on `compact` keeps its bytes. */
  compactGlow?: true;
}

/** One exact subset of a whole geometry. Ordinals address the original vertices and triangles, not clipped fragments. */
export interface WholeGeometryPart { x: number; z: number; geometry: BufferGeometry; vertices: number[]; triangles: number[] }
interface PreparedWhole {
  id: string; at: Vector3; castShadow: boolean; geometry: BufferGeometry; material: MeshStandardMaterial; transform: Matrix4;
  customAttributes: GlbPrimitive['customAttributes']; nativeAttributes: GlbPrimitive['nativeAttributes'];
  owner: { x: number; z: number } | null; extras: GlbPrimitive['extras'];
  /** I3: the normals / colours are normalized Int8 / Uint8 on the wire (`compactWholeChannels`) */
  quantized: boolean;
  geometricError: number;
  /** I3: the shape opted into `compact` (its native channels are written once, `nativeOnce`) */
  compact: boolean;
  /** I3: a partition's positions are unnormalized Int16 on its whole shape's one grid (node = transform x grid) */
  grid?: TileGrid;
}

function subsetAttribute(attribute: BufferAttribute, selected: readonly number[]): BufferAttribute {
  const array = attribute.array.slice(0, selected.length * attribute.itemSize);
  // slice above may be smaller than the requested size only if callers repeat vertices (partitioning deduplicates).
  if (array.length !== selected.length * attribute.itemSize) throw new Error('Whole geometry subset exceeds source vertices');
  // Adjacent ordinals are copied as one raw run, preserving every storage bit.
  for (let i = 0; i < selected.length;) {
    const vertex = selected[i];
    if (vertex === undefined) throw new Error('Missing whole geometry vertex');
    let end = i + 1;
    while (end < selected.length && selected[end] === vertex + end - i) end++;
    array.set(attribute.array.subarray(vertex * attribute.itemSize, (vertex + end - i) * attribute.itemSize), i * attribute.itemSize);
    i = end;
  }
  return attribute instanceof Float16BufferAttribute ? new Float16BufferAttribute(array, attribute.itemSize, attribute.normalized)
    : new BufferAttribute(array, attribute.itemSize, attribute.normalized);
}

/** Run-length form of whole-partition ordinals: `[start, length, …]` for each ascending run of consecutive ordinals.
 *  The game's whole-geometry reader expands it to the identical list (`assembleWholeGeometryViews`). */
export function wholePartitionRuns(list: readonly number[]): { runs: number[] } {
  const runs: number[] = [];
  for (let at = 0; at < list.length;) {
    const start = list[at]; if (start === undefined) break;
    let length = 1;
    while (list[at + length] === start + length) length++;
    runs.push(start, length); at += length;
  }
  return { runs };
}

/** Partition triangles without clipping or rounding any source channel; world transforms affect ownership only. */
export function partitionWholeGeometry(sourceGeometry: BufferGeometry, transform: Matrix4 = new Matrix4(), overhang = 0): WholeGeometryPart[] {
  if (!Number.isFinite(overhang) || overhang < 0 || overhang > 1) throw new Error('Invalid whole overhang');
  const position = sourceGeometry.getAttribute('position'), index = sourceGeometry.getIndex(), count = index?.count ?? position.count;
  if (count % 3 !== 0) throw new Error('Whole geometry requires triangles');
  const groups = new Map<string, { x: number; z: number; vertices: number[]; triangles: number[]; indices: number[]; lookup: Map<number, number> }>();
  const active = new Map<string, number>();
  const point = new Vector3(), centroid = new Vector3();
  for (let triangle = 0; triangle < count / 3; triangle++) {
    const ids = [0, 1, 2].map(corner => index?.getX(triangle * 3 + corner) ?? triangle * 3 + corner);
    centroid.set(0, 0, 0);
    for (const vertex of ids) centroid.add(point.fromBufferAttribute(position, vertex).applyMatrix4(transform));
    centroid.multiplyScalar(1 / 3);
    const ownedAddress = (value: number): number => overhang === 0 ? Math.min(7, Math.floor((value + 250) / 62.5)) : Math.max(0, Math.min(7, Math.floor((value + 250) / 62.5)));
    const x = ownedAddress(centroid.x), z = ownedAddress(centroid.z);
    if (!Number.isFinite(centroid.x) || !Number.isFinite(centroid.z) || x < 0 || z < 0 || Math.abs(centroid.x) > 250 + overhang || Math.abs(centroid.z) > 250 + overhang) throw new Error('Whole triangle centroid outside the cell');
    const address = `${x}/${z}`;
    let segment = active.get(address) ?? 0;
    if ((groups.get(`${address}/${segment}`)?.triangles.length ?? 0) >= 10000) { segment++; active.set(address, segment); }
    const key = `${address}/${segment}`, group = groups.get(key) ?? { x, z, vertices: [], triangles: [], indices: [], lookup: new Map<number, number>() };
    group.triangles.push(triangle);
    for (const vertex of ids) {
      let local = group.lookup.get(vertex);
      if (local === undefined) { local = group.vertices.length; group.lookup.set(vertex, local); group.vertices.push(vertex); }
      group.indices.push(local);
    }
    groups.set(key, group);
  }
  // Unreferenced authored vertices still belong to the exact source layout; carry them in the first occupied tile.
  const first = groups.values().next().value;
  if (first !== undefined) {
    const referenced = new Set([...groups.values()].flatMap(group => group.vertices));
    for (let vertex = 0; vertex < position.count; vertex++) if (!referenced.has(vertex)) first.vertices.push(vertex);
  }
  return [...groups.values()].sort((a, b) => a.x - b.x || a.z - b.z).map(group => {
    const part = new BufferGeometry();
    for (const [name, attribute] of Object.entries(sourceGeometry.attributes)) {
      if (!(attribute instanceof BufferAttribute)) throw new Error('Whole geometry requires non-interleaved channels');
      part.setAttribute(name, subsetAttribute(attribute, group.vertices));
    }
    if (index !== null) part.setIndex(new BufferAttribute(index.array instanceof Uint16Array ? new Uint16Array(group.indices) : new Uint32Array(group.indices), 1));
    return { x: group.x, z: group.z, geometry: part, vertices: group.vertices, triangles: group.triangles };
  });
}
/** iPhone downloads I3: a native whole shape's float vec3 normals become normalized Int8 (within ~0.5 degree) and its
 *  float colours in [0, 1] normalized Uint8 (within 1/510), each written once as its own typed accessor
 *  (`quantizedChannels`); the shape's exact-copy readers restore those stored values. False, changing nothing, when a
 *  channel cannot be stored that way. A vec4 normal is a shader channel and stays as it is. */
/** I3: the shape's position grid in its own space (RM8.1's power-of-two grid: the finest step its extent fits in 16 bits),
 *  or none when a position is not plain float32. */
export function wholeGrid(g: BufferGeometry): TileGrid | undefined {
  const position = g.getAttribute('position');
  if (!(position instanceof BufferAttribute) || !(position.array instanceof Float32Array) || position.itemSize !== 3) return undefined;
  const box = new Box3().setFromBufferAttribute(position);
  try { return tileGrid(box); } catch { return undefined; }
}
/** A partition's float positions as unnormalized Int16 on `grid` (within half its step). */
export function gridPositions(g: BufferGeometry, grid: TileGrid): void {
  const position = g.getAttribute('position'), out = new Int16Array(position.count * 3);
  for (let i = 0; i < position.count; i++) for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round((position.getComponent(i, c) - (grid.origin[c] ?? 0)) / grid.step);
  g.setAttribute('position', new BufferAttribute(out, 3));
}
/** I3: Int8 normals and Uint8 colours in place when every float value fits (false, unchanged, when neither does). */
export function compactWholeChannels(g: BufferGeometry): boolean {
  const normal = g.hasAttribute('normal') ? g.getAttribute('normal') : undefined, colour = g.hasAttribute('color') ? g.getAttribute('color') : undefined;
  const floatNormal = normal instanceof BufferAttribute && normal.itemSize === 3 && normal.array instanceof Float32Array;
  const okNormal = normal === undefined || floatNormal || (normal instanceof BufferAttribute && normal.itemSize === 4)
    || (normal instanceof BufferAttribute && normal.array instanceof Int8Array && normal.normalized);
  const floatColour = colour instanceof BufferAttribute && colour.array instanceof Float32Array && colour.array.every(value => value >= 0 && value <= 1);
  const okColour = colour === undefined || floatColour || (colour instanceof BufferAttribute && colour.normalized && !(colour.array instanceof Float32Array));
  if (!okNormal || !okColour || (!floatNormal && !floatColour)) return false;
  if (floatNormal) g.setAttribute('normal', new BufferAttribute(Int8Array.from(normal.array, value => Math.max(-127, Math.min(127, Math.round(value * 127)))), 3, true));
  if (floatColour) g.setAttribute('color', new BufferAttribute(Uint8Array.from(colour.array, value => Math.round(value * 255)), colour.itemSize, true));
  return true;
}
/** I3: only the normals as normalized Int8 (within ~0.5 degree), for a shape whose colours leave [0, 1] (a glow): they stay
 *  float32 (staticGlb's `quantizedChannels` writes a float colour as it is). False, unchanged, without a float vec3 normal. */
export function compactWholeNormals(g: BufferGeometry): boolean {
  const normal = g.hasAttribute('normal') ? g.getAttribute('normal') : undefined;
  if (!(normal instanceof BufferAttribute) || normal.itemSize !== 3 || !(normal.array instanceof Float32Array)) return false;
  g.setAttribute('normal', new BufferAttribute(Int8Array.from(normal.array, value => Math.max(-127, Math.min(127, Math.round(value * 127)))), 3, true));
  return true;
}
/** The look graphs (id -> `{ nodes: { [id]: { op } } }`) that read a vertex's object-space position (`positionLocal` /
 *  `positionGeometry`): a shape drawn through one keeps its exact float positions, never a grid. */
export function objectSpaceLooks(graphs: Readonly<Record<string, unknown>>): Set<string> {
  const reads = (graph: unknown): boolean => {
    if (typeof graph !== 'object' || graph === null || !('nodes' in graph) || typeof graph.nodes !== 'object' || graph.nodes === null) return false;
    return Object.values(graph.nodes).some((node: unknown) => typeof node === 'object' && node !== null && 'op' in node && (node.op === 'positionLocal' || node.op === 'positionGeometry'));
  };
  return new Set(Object.entries(graphs).filter(([, graph]) => reads(graph)).map(([id]) => id));
}
/** Content-addressed GLBs and tile rows, including actual budget numbers and an independent far proxy (none for whole shapes alone). */
export interface BakedProps {
  props: ShardProps; tiles: Shardfile['tiles']; files: Shardfile['files']; library: string[];
  far: NonNullable<Shardfile['far']> | null; assets: Map<string, Uint8Array>;
  report: readonly { lod: number; x: number; z: number; resident: number; compressed: number; triangles: number; draws: number; warnings?: readonly string[] }[];
}
interface Vertex { p: Vector3; n: Vector3; c: Vector3; u: number; v: number }
function isMesh(object: Object3D): object is Mesh { return object instanceof Mesh; }
function vertices(root: Object3D, transform = new Matrix4(), rough = true): Vertex[][] {
  root.updateMatrixWorld(true); const result: Vertex[][] = [];
  root.traverse((object) => {
    if (!isMesh(object)) return;
    if (object instanceof SkinnedMesh || Array.isArray(object.material) || !(object.material instanceof MeshStandardMaterial) || object.material.transparent || object.material.metalness !== 0 || (rough && object.material.roughness !== 1) || object.material.map !== null) throw new Error('Static merge needs opaque untextured nonmetal rough surfaces; bake textured shapes as scatter');
    const g = object.geometry; if (!g.hasAttribute('position') || !g.hasAttribute('normal')) throw new Error('Static prop needs positions and normals');
    const p = g.getAttribute('position'), normal = g.getAttribute('normal'), uv = g.hasAttribute('uv') ? g.getAttribute('uv') : undefined, colour = g.hasAttribute('color') ? g.getAttribute('color') : undefined, index = g.getIndex();
    const matrix = transform.clone().multiply(object.matrixWorld), n = index?.count ?? p.count;
    if (n % 3 !== 0) throw new Error('Static prop needs triangles');
    for (let i = 0; i < n; i += 3) {
      const triangle: Vertex[] = [];
      for (let j = 0; j < 3; j++) {
        const at = index?.getX(i + j) ?? i + j, point = new Vector3().fromBufferAttribute(p, at).applyMatrix4(matrix);
        if (![point.x, point.y, point.z].every(Number.isFinite) || Math.abs(point.x) > 250 || Math.abs(point.z) > 250 || point.y < -CELL_BELOW || point.y > CELL_ABOVE) throw new Error('Prop outside the cell');
        const c = colour === undefined ? new Vector3(1, 1, 1) : new Vector3().fromBufferAttribute(colour, at);
        c.multiply(new Vector3(...object.material.color));
        triangle.push({ p: point, n: new Vector3().fromBufferAttribute(normal, at).applyNormalMatrix(new Matrix3().getNormalMatrix(matrix)), c, u: uv?.getX(at) ?? 0, v: uv?.getY(at) ?? 0 });
      }
      result.push(triangle);
    }
  }); return result;
}
function geometry(triangles: readonly Vertex[][], bounds?: readonly [number, number, number, number], storageError?: (metres: number) => void): BufferGeometry {
  const positions: number[] = [], normals: number[] = [], colours: number[] = [], uvs: number[] = [];
  for (const triangle of triangles) {
    let polygon = [...triangle];
    if (bounds !== undefined) for (const [axis, limit, direction] of [['x', bounds[0], 1], ['x', bounds[1], -1], ['z', bounds[2], 1], ['z', bounds[3], -1]] as const) {
      const input = polygon; polygon = [];
      for (let i = 0; i < input.length; i++) {
        const a = input[i], b = input[(i + 1) % input.length]; if (a === undefined || b === undefined) continue;
        const da = (a.p[axis] - limit) * direction, db = (b.p[axis] - limit) * direction;
        if (da >= 0) polygon.push(a);
        if ((da < 0) !== (db < 0)) { const t = da / (da - db); polygon.push({ p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t).normalize(), c: a.c.clone().lerp(b.c, t), u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t }); }
      }
    }
    for (let i = 1; i + 1 < polygon.length; i++) {
      const a = polygon[0], b = polygon[i], c = polygon[i + 1]; if (a === undefined || b === undefined || c === undefined || new Vector3().subVectors(b.p, a.p).cross(new Vector3().subVectors(c.p, a.p)).lengthSq() < 1e-16) continue;
      for (const vertex of [a, b, c]) { positions.push(...vertex.p); normals.push(...vertex.n); colours.push(...vertex.c); uvs.push(vertex.u, vertex.v); }
    }
  }
  storageError?.(floatPositionError(positions));
  return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3)).setAttribute('normal', new Float32BufferAttribute(normals, 3)).setAttribute('color', new Float32BufferAttribute(colours, 3)).setAttribute('uv', new Float32BufferAttribute(uvs, 2));
}
const mergedMaterial = (name?: string): MeshStandardMaterial => {
  const material = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true });
  material.name = name ?? ''; return material;
};
/** Merge props into the canonical 8×8 / 4×4 grid, instance L0 scatter, and refuse every over-budget output. */
export function bakeProps(source: PropsBakeSource, terrain: readonly Shardfile['tiles'][number][] = []): BakedProps {
  if (!Number.isFinite(source.coarseErrorMetres ?? 0) || (source.coarseErrorMetres ?? 0) < 0) throw new Error('Invalid coarse source error');
  const tileWarnings = new Map<string, readonly string[]>();
  const files: Shardfile['files'] = [], assets = new Map<string, Uint8Array>(), library: string[] = [], tiles = terrain.map((t) => ({ ...t, files: [...t.files], bounds: { min: [...t.bounds.min] as [number, number, number], max: [...t.bounds.max] as [number, number, number] } }));
  const section: ShardProps = { version: 1, family: source.family ?? 'pbr', tiles: [], panels: [], models: [], far: null, textures: [], colliders: source.colliders ?? [] };
  const store = (bytes: Uint8Array, kind: 'glb' | 'ktx2'): Shardfile['files'][number] => {
    const hash = contentHash(bytes), cost = kind === 'glb' ? parseGlb(bytes) : parseKtx2(bytes);
    const row = { hash, kind, compressed: bytes.length, ...cost, dependencies: [] as string[], critical: false };
    if (!assets.has(hash)) { assets.set(hash, bytes); files.push(row); } return row;
  };
  const texture = source.colourTexture === undefined ? null : store(source.colourTexture, 'ktx2');
  const save = (primitives: readonly GlbPrimitive[], name: string, tile = false) => {
    const original = staticGlb(primitives, name);
    const packed = tile && source.tileCompression === 'meshopt' ? compressGlb(original) : original;
    const selected = packed.length < original.length ? packed : original;
    const encoded = tile && source.encodeTileBlob !== undefined ? source.encodeTileBlob(name, Uint8Array.from(selected)) : selected;
    if (!(encoded instanceof Uint8Array) || !(encoded.buffer instanceof ArrayBuffer)) throw new Error('Tile encoder must return owned numeric bytes');
    const row = store(tile && source.encodeTileBlob !== undefined ? Uint8Array.from(encoded) : encoded, 'glb');
    if (texture !== null) { row.dependencies = [texture.hash]; const prior = files.find((f) => f.hash === row.hash); if (prior !== undefined) prior.dependencies = row.dependencies; section.textures.push({ model: row.hash, colour: texture.hash }); }
    return row;
  };
  const overhang = Math.max(0, ...(source.whole ?? []).map(entry => entry.overhang ?? 0));
  if (!Number.isFinite(overhang) || overhang > 1 || (source.whole ?? []).some(entry => !Number.isFinite(entry.overhang ?? 0) || (entry.overhang ?? 0) < 0)) throw new Error('Invalid whole overhang');
  if (overhang > 0) section.overhang = overhang;
  const prepareWhole = (entries: readonly PropWhole[]): PreparedWhole[] => entries.flatMap((entry): PreparedWhole[] => {
    if (!Number.isFinite(entry.geometricError ?? 0) || (entry.geometricError ?? 0) < 0) throw new Error('Invalid whole source error');
    const { mesh } = entry, at = new Vector3().setFromMatrixPosition(entry.transform), m = mesh.material;
    if (!(at.x >= -250 && at.x < 250 && at.z >= -250 && at.z < 250)) throw new Error(`Whole prop ${entry.id} origin outside the cell`);
    if (!(m instanceof MeshStandardMaterial) || m.transparent || m.metalness !== 0 || m.map !== null || m.color.getHex() !== 0xffffff) throw new Error(`Whole prop ${entry.id} needs one opaque untextured nonmetal white surface`);
    if (entry.nativeAttributes === true || entry.partition !== undefined) {
      // Native whole draws can be unlit, so normals are not a required source channel. Inspect bounds without
      // constructing lit merge vertices or inventing shader attributes; the original channels reach the GLB unchanged.
      if (mesh instanceof SkinnedMesh) throw new Error('Whole prop must be static');
      const position: unknown = mesh.geometry.getAttribute('position'), index = mesh.geometry.getIndex(), point = new Vector3();
      if (!(position instanceof BufferAttribute) || position.itemSize !== 3 || (index?.count ?? position.count) % 3 !== 0) throw new Error('Whole prop needs triangle positions');
      for (let vertex = 0; vertex < position.count; vertex++) {
        point.fromBufferAttribute(position, vertex).applyMatrix4(entry.transform);
        if (![point.x, point.y, point.z].every(Number.isFinite) || Math.abs(point.x) > 250 + (entry.overhang ?? 0) || Math.abs(point.z) > 250 + (entry.overhang ?? 0) || point.y < -CELL_BELOW || point.y > CELL_ABOVE) throw new Error('Prop outside the cell');
      }
    } else {
      const placed = new Mesh(mesh.geometry, m); placed.applyMatrix4(entry.transform); vertices(placed, new Matrix4(), false); // refuses a shape outside the cell
    }
    // the shape's own attributes and index, untouched: the runtime draws exactly the triangles it built
    const g = new BufferGeometry();
    const retain = entry.partition !== undefined || entry.nativeAttributes === true;
    const channels = retain ? Object.keys(mesh.geometry.attributes) : ['position', 'normal', 'color', ...Object.values(entry.customAttributes ?? {})];
    for (const key of channels) if (mesh.geometry.hasAttribute(key)) g.setAttribute(key, mesh.geometry.getAttribute(key));
    g.setIndex(mesh.geometry.getIndex());
    const quantized = retain && entry.compact === true && (compactWholeChannels(g) || (entry.compactGlow === true && compactWholeNormals(g)));
    const automatic = Object.fromEntries(Object.keys(g.attributes)
      .filter(key => !['position', 'normal', 'color', 'uv', 'tangent'].includes(key) && !Object.values(entry.customAttributes ?? {}).includes(key)).map((key, i) => [`_WS_CHANNEL_${i}`, key]));
    const customAttributes = retain ? { ...automatic, ...entry.customAttributes } : entry.customAttributes;
    const material = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: m.roughness });
    material.name = entry.materialName ?? source.materialName ?? '';
    const base = { id: entry.id, at, castShadow: mesh.castShadow, geometry: g, material, transform: entry.transform, customAttributes,
      geometricError: (entry.geometricError ?? 0) * positionErrorScale(entry.transform),
      nativeAttributes: entry.partition !== undefined ? true as const : entry.nativeAttributes, quantized, compact: entry.compact === true };
    const shadowExtras = entry.receiveShadow === undefined ? {} : { receiveShadow: entry.receiveShadow };
    if (entry.partition === undefined) return [{ ...base, owner: null, extras: entry.receiveShadow === undefined ? undefined : shadowExtras }];
    const ordinals = entry.partition === 'runs' ? wholePartitionRuns : (list: number[]): number[] => list;
    const preparedParts: PreparedWhole[] = [];
    // I3: one grid for the whole shape in its own space, so a vertex two partitions share lands on the same grid point
    const grid = quantized ? wholeGrid(g) : undefined;
    for (const part of partitionWholeGeometry(g, entry.transform, entry.overhang ?? 0)) {
      const storageError = grid === undefined ? 0 : gridPositionError(part.geometry, grid, entry.transform);
      if (grid !== undefined) gridPositions(part.geometry, grid);
      const prepared: PreparedWhole = { ...base, geometricError: base.geometricError + storageError, id: `${entry.id}_p${part.x}_${part.z}_n${preparedParts.length}`, geometry: part.geometry, ...(grid === undefined ? {} : { grid }),
      owner: { x: part.x, z: part.z }, extras: { ...shadowExtras, wholePartition: { id: entry.id, vertices: ordinals(part.vertices), triangles: ordinals(part.triangles),
        vertexCount: g.getAttribute('position').count, indexCount: g.getIndex()?.count ?? 0,
        index: g.getIndex() === null ? 'none' : g.getIndex()?.array instanceof Uint16Array ? 'u16' : 'u32',
        ...(grid === undefined ? {} : { grid: { origin: [...grid.origin], step: grid.step } }) } } };
      preparedParts.push(prepared);
    }
    return preparedParts;
  });
  const whole = prepareWhole(source.whole ?? []), coarseWhole = prepareWhole((source.coarseWhole ?? []).map(entry => {
    if (entry.partition !== undefined) throw new Error(`Coarse whole prop ${entry.id} is never partitioned`);
    return entry;
  }));
  const base = vertices(source.static), spill: Vertex[][] = [], eligible = new Map<PropScatter, Matrix4[]>();
  for (const batch of source.scatter ?? []) {
    const keep: Matrix4[] = [];
    for (const matrix of batch.transforms) {
      const triangles = vertices(batch.model, matrix), box = new Box3().setFromPoints(triangles.flat().map((vertex) => vertex.p)), p = new Vector3().setFromMatrixPosition(matrix), x = -250 + Math.floor((p.x + 250) / 62.5) * 62.5, z = -250 + Math.floor((p.z + 250) / 62.5) * 62.5;
      if (box.min.x < x || box.max.x > x + 62.5 || box.min.z < z || box.max.z > z + 62.5) spill.push(...triangles); else keep.push(matrix);
    }
    eligible.set(batch, keep);
  }
  // Hidden panels remain controllable library objects; an unconditional proxy must never make them visible.
  const scattered = (source.scatter ?? []).flatMap((s) => s.transforms.flatMap((m) => vertices(s.model, m))), panelTriangles = (source.panels ?? []).filter((p) => p.visible !== false).flatMap((p) => vertices(p.model)), coarse = source.coarse === undefined ? [...base, ...scattered, ...panelTriangles] : vertices(source.coarse);
  const panelFiles = (source.panels ?? []).map((entry) => { let storageError = 0; const g = geometry(vertices(entry.model), undefined, metres => { storageError = metres; }), file = save([{ geometry: g, material: mergedMaterial(entry.materialName ?? source.materialName), ...(entry.castShadow === false ? { castShadow: false } : {}) }], entry.id); g.computeBoundingBox(); library.push(file.hash); section.panels.push({ id: entry.id, file: file.hash, visible: entry.visible ?? true }); return { file, bounds: g.boundingBox, storageError }; });
  for (const lod of [0, 1] as const) {
    const size = lod === 0 ? 62.5 : 125, count = 500 / size;
    for (let z = 0; z < count; z++) for (let x = 0; x < count; x++) {
      let tileError = lod === 0 ? 0 : source.coarseErrorMetres ?? 0;
      const noteError = (metres: number): void => { tileError = Math.max(tileError, (lod === 0 ? 0 : source.coarseErrorMetres ?? 0) + metres); };
      const x0 = -250 + x * size, z0 = -250 + z * size, bounds: [number, number, number, number] = [x0, x0 + size, z0, z0 + size], primitives: GlbPrimitive[] = [], g = geometry(lod === 0 ? [...base, ...spill] : coarse, bounds, noteError);
      if (g.getAttribute('position').count > 0) primitives.push({ geometry: g, material: mergedMaterial(source.materialName), castShadow: lod === 0 });
      if (lod === 0) for (const batch of source.scatter ?? []) {
        const transforms = (eligible.get(batch) ?? []).filter((m) => { const p = new Vector3().setFromMatrixPosition(m); return p.x >= x0 && p.x < x0 + size && p.z >= z0 && p.z < z0 + size; });
        if (transforms.length === 0) continue;
        // Scatter keeps a model in one owning tile; its conservative bounds may extend into its neighbours.
        let storageError = 0;
        const local = geometry(vertices(batch.model), undefined, metres => { storageError = metres; });
        tileError = Math.max(tileError, storageError * Math.max(...transforms.map(matrix => positionErrorScale(matrix))));
        primitives.push({ geometry: local, material: mergedMaterial(source.materialName), instances: transforms });
      }
      for (const w of lod === 0 ? whole : coarseWhole) if (w.owner === null ? w.at.x >= x0 && w.at.x < x0 + size && w.at.z >= z0 && w.at.z < z0 + size : w.owner.x === x && w.owner.z === z) primitives.push({ geometry: w.geometry, material: w.material, castShadow: w.castShadow, name: w.id, transform: w.grid === undefined ? w.transform : w.transform.clone().multiply(tileGridTransform(w.grid)),
        ...(w.grid === undefined ? {} : { pose: w.transform, meshoptReady: true as const }), compactIndex: true, ...(w.customAttributes === undefined ? {} : { customAttributes: w.customAttributes }), ...(w.nativeAttributes === undefined ? {} : { nativeAttributes: w.nativeAttributes }), ...(w.quantized ? { quantizedChannels: true } : {}), ...(w.compact ? { nativeOnce: true as const } : {}), ...(w.extras === undefined ? {} : { extras: w.extras }) });
      for (const w of lod === 0 ? whole : coarseWhole) if (w.owner === null ? w.at.x >= x0 && w.at.x < x0 + size && w.at.z >= z0 && w.at.z < z0 + size : w.owner.x === x && w.owner.z === z)
        tileError = Math.max(tileError, w.geometricError);
      const hasPanel = lod === 0 && panelFiles.some((p) => p.bounds !== null && p.bounds.max.x >= x0 && p.bounds.min.x <= x0 + size && p.bounds.max.z >= z0 && p.bounds.min.z <= z0 + size);
      if (primitives.length === 0 && !hasPanel) continue;
      const batches: GlbPrimitive[][] = [];
      if ((source.whole ?? []).some(entry => entry.partition !== undefined)) {
        let batch: GlbPrimitive[] = [];
        for (const primitive of primitives) {
          try { staticGlb([...batch, primitive], `props.${lod}.${x}.${z}`); batch.push(primitive); }
          catch (error) {
            if (!(error instanceof Error) || !['GLB resource cap', 'invalid GLB header'].includes(error.message) || batch.length === 0) throw error;
            batches.push(batch); batch = [primitive];
          }
        }
        if (batch.length > 0) batches.push(batch);
      } else batches.push(primitives);
      const tileFiles = batches.map((batch, i) => save(batch, batches.length === 1 ? `props.${lod}.${x}.${z}` : `props.${lod}.${x}.${z}.${i}`, true));
      const file = tileFiles[0]; if (file === undefined) throw new Error('Props tile contains no file');
      const cost = tileFiles.reduce((sum, part) => ({ decoded: sum.decoded + part.decoded, gpu: sum.gpu + part.gpu, triangles: sum.triangles + part.triangles, draws: sum.draws + part.draws }), { decoded: 0, gpu: 0, triangles: 0, draws: 0 });
      if (texture !== null) { cost.gpu += texture.gpu; cost.decoded += texture.decoded; }
      const prior = tiles.find((t) => t.lod === lod && t.x === x && t.z === z), row: Shardfile['tiles'][number] = prior ?? { lod, x, z, bounds: { min: [x0, 0, z0], max: [x0 + size, 0, z0 + size] }, geometricError: 0, files: [], compressed: 0, decoded: 0, gpu: 0, triangles: 0, draws: 0 };
      row.geometricError = Math.max(row.geometricError, tileError);
      if (overhang > 0) row.drawBounds = { min: [...row.bounds.min], max: [...row.bounds.max] };
      row.files.push(...tileFiles.map(part => part.hash)); row.compressed += tileFiles.reduce((sum, part) => sum + part.compressed, 0) + (texture?.compressed ?? 0); row.decoded += cost.decoded; row.gpu += cost.gpu; row.triangles += cost.triangles; row.draws += cost.draws;
      for (const primitive of primitives) { primitive.geometry.computeBoundingBox(); const box = primitive.geometry.boundingBox; if (box === null) continue;
        for (const matrix of primitive.instances ?? [primitive.transform ?? new Matrix4()]) { const world = box.clone().applyMatrix4(matrix); row.bounds.min[1] = Math.min(row.bounds.min[1], world.min.y); row.bounds.max[1] = Math.max(row.bounds.max[1], world.max.y);
          if (row.drawBounds !== undefined) for (const axis of [0, 1, 2] as const) {
            const coordinate = axis === 0 ? 'x' : axis === 1 ? 'y' : 'z';
            row.drawBounds.min[axis] = Math.min(row.drawBounds.min[axis], world.min[coordinate]);
            row.drawBounds.max[axis] = Math.max(row.drawBounds.max[axis], world.max[coordinate]);
          } }
      }
      if (lod === 0) for (const panel of panelFiles) { const box = panel.bounds; if (box === null || box.max.x < x0 || box.min.x > x0 + size || box.max.z < z0 || box.min.z > z0 + size) continue; row.geometricError = Math.max(row.geometricError, panel.storageError); row.files.push(panel.file.hash); row.triangles += panel.file.triangles; row.draws += panel.file.draws; row.bounds.min[1] = Math.min(row.bounds.min[1], box.min.y); row.bounds.max[1] = Math.max(row.bounds.max[1], box.max.y); }
      const cap = lod === 0 ? CONTENT_CAPS.l0 : CONTENT_CAPS.l1;
      const warnings = [
        ...(row.decoded + row.gpu > cap.resident ? [`resident ${row.decoded + row.gpu} > ${cap.resident}`] : []),
        ...(row.compressed > cap.compressed ? [`compressed ${row.compressed} > ${cap.compressed}`] : []),
        ...(row.triangles > cap.triangles ? [`triangles ${row.triangles} > ${cap.triangles}`] : []),
        ...(row.draws > cap.draws ? [`draws ${row.draws} > ${cap.draws}`] : []),
      ];
      if (warnings.length > 0) {
        tileWarnings.set(`${lod}/${x}/${z}`, warnings);
        console.warn(`Props tile ${lod}/${x}/${z}: ${warnings.join('; ')} (provisional caps)`);
      }
      if (prior === undefined) tiles.push(row); section.tiles.push({ lod, x, z, file: file.hash,
        ...(tileFiles.length === 1 ? {} : { additionalFiles: tileFiles.slice(1).map(part => part.hash) }) });
    }
  }
  // a section of whole shapes only has no far proxy: a whole shape is never decimated, and the far proxy is one capped draw
  const farTriangles = source.far === undefined ? [...base, ...scattered, ...panelTriangles] : vertices(source.far);
  let far: BakedProps['far'] = null;
  if (farTriangles.length > 0 || whole.length === 0) {
    const farGeometry = geometry(farTriangles);
    if (farGeometry.getAttribute('position').count === 0) throw new Error('Props far proxy must have geometry');
    farGeometry.computeBoundingBox(); const farBox = farGeometry.boundingBox; if (farBox === null) throw new Error('Missing far bounds');
    const farFile = save([{ geometry: farGeometry, material: mergedMaterial(source.materialName), castShadow: false }], 'props.far'), proxy = { bounds: { min: farBox.min.toArray(), max: farBox.max.toArray() }, files: [farFile.hash], compressed: farFile.compressed + (texture?.compressed ?? 0), decoded: farFile.decoded, gpu: farFile.gpu + (texture?.gpu ?? 0), triangles: farFile.triangles, draws: farFile.draws };
    if (proxy.decoded + proxy.gpu > CONTENT_CAPS.far.resident || proxy.compressed > CONTENT_CAPS.far.compressed || proxy.triangles > CONTENT_CAPS.far.triangles || proxy.draws > CONTENT_CAPS.far.draws) throw new Error('Props far proxy exceeds content caps');
    section.far = farFile.hash; far = proxy;
  }
  for (const [kind, entries] of [['models', source.models ?? []]] as const) for (const entry of entries) {
    const file = save([{ geometry: geometry(vertices(entry.model)), material: mergedMaterial(source.materialName) }], entry.id); library.push(file.hash); section[kind].push({ id: entry.id, file: file.hash });
  }
  const libraryFiles = files.filter((f) => library.includes(f.hash) || (texture !== null && library.length > 0 && f.hash === texture.hash));
  if (libraryFiles.reduce((n, f) => n + f.decoded + f.gpu, 0) > CONTENT_CAPS.library.resident || libraryFiles.reduce((n, f) => n + f.compressed, 0) > CONTENT_CAPS.library.compressed) throw new Error('Props library exceeds content caps');
  const props = v.parse(PropsSchema, section), report = tiles.map((t) => {
    const warnings = tileWarnings.get(`${t.lod}/${t.x}/${t.z}`);
    return { lod: t.lod, x: t.x, z: t.z, resident: t.decoded + t.gpu, compressed: t.compressed, triangles: t.triangles, draws: t.draws,
      ...(warnings === undefined ? {} : { warnings }) };
  });
  return { props, tiles, files, library, far, assets, report };
}
