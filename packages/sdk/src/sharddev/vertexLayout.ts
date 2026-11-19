/**
 * MEMORY-STRUCTURE STR17 (meta `docs/plans/MEMORY-STRUCTURE-PLAN.md`): no second ANGLE copy of a vertex channel.
 *
 * WebKit draws WebGL through ANGLE's Metal back end, and Metal reads a vertex attribute in place only when its stride
 * and offset are multiples of 4. A tightly packed 3-byte channel (an Int8 normal, a Uint8 colour) or a stride-6 Int16
 * channel is copied by ANGLE into a second, converted buffer in the GPU process: the phone holds the channel twice.
 * `wildshard check` prints every such channel in the built shard's GLBs on the report card. The three layouts the cook
 * already wrote when this rule landed report (EXISTING_COPIED_LAYOUTS: `staticGlb`'s quantized channels without
 * `meshoptReady`, in Nine's slabs and Driftwood); any other copied layout refuses, a ratchet (J412). `meshoptReady`
 * writes the same channels aligned; STR16 moves every zone's static vertex there.
 */

/** One vertex channel layout Metal cannot read in place, summed over the shard's GLBs. */
export interface CopiedChannel {
  /** `<glTF semantic> <component>x<width>[n] stride <bytes>`, e.g. `NORMAL i8x3n stride 3`. */
  readonly channel: string;
  /** Vertices that channel carries, each geometry counted once (instances share it). */
  readonly vertices: number;
  /** GLB files that hold it. */
  readonly files: number;
}

/** One GLB's static numbers: triangles and vertices, each geometry counted once, and its copied channels. */
export interface GlbGeometry {
  readonly triangles: number;
  readonly vertices: number;
  readonly copied: ReadonlyMap<string, number>;
}

/** A finding in check's shape: a stable code (refusals.ts names its rule) and the words. */
export interface LayoutFinding { readonly code: string; readonly message: string }

/**
 * The copied layouts the pins held when STR17 landed (engine `out/` pins, 2026-11-18: Nine's slabs and Driftwood, from
 * `staticGlb`'s packed quantized path); they report until STR16 packs them. Any other copied layout refuses.
 */
export const EXISTING_COPIED_LAYOUTS: ReadonlySet<string> = new Set(['COLOR_0 u16x3n stride 6', 'COLOR_0 u8x3n stride 3', 'NORMAL i8x3n stride 3']);

const GLB_MAGIC = 0x46546c67, JSON_CHUNK = 0x4e4f534a, TRIANGLES = 4;
const COMPONENT: Readonly<Record<number, { readonly name: string; readonly bytes: number }>> = {
  5120: { name: 'i8', bytes: 1 }, 5121: { name: 'u8', bytes: 1 }, 5122: { name: 'i16', bytes: 2 },
  5123: { name: 'u16', bytes: 2 }, 5125: { name: 'u32', bytes: 4 }, 5126: { name: 'f32', bytes: 4 },
};
const WIDTH: Readonly<Record<string, number>> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

interface Accessor { readonly bufferView?: number; readonly byteOffset?: number; readonly componentType: number; readonly normalized?: boolean; readonly count: number; readonly type: string }
interface BufferView { readonly byteStride?: number }
interface Primitive { readonly attributes?: Readonly<Record<string, number>>; readonly indices?: number; readonly mode?: number }
interface GltfJson { readonly accessors?: readonly Accessor[]; readonly bufferViews?: readonly BufferView[]; readonly meshes?: readonly { readonly primitives?: readonly Primitive[] }[] }

/** The GLB's JSON chunk, or null when the bytes are not a GLB (an image, a table). */
function glbJson(bytes: Uint8Array): GltfJson | null {
  if (bytes.byteLength < 20) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(16, true) !== JSON_CHUNK) return null;
  const length = view.getUint32(12, true);
  if (length > bytes.byteLength - 20) throw new Error('GLB JSON chunk is truncated');
  const json: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(20, 20 + length)));
  if (typeof json !== 'object' || json === null) throw new Error('GLB JSON chunk is not an object');
  return json;
}

/** The layout key of an accessor Metal must copy, or null when it reads in place. */
function copiedKey(semantic: string, accessor: Accessor, view: BufferView | undefined): string | null {
  const component = COMPONENT[accessor.componentType], width = WIDTH[accessor.type];
  if (component === undefined || width === undefined) return null;
  const stride = view?.byteStride ?? component.bytes * width;
  if (stride % 4 === 0 && (view?.byteStride === undefined || (accessor.byteOffset ?? 0) % 4 === 0)) return null;
  return `${semantic} ${component.name}x${String(width)}${accessor.normalized === true ? 'n' : ''} stride ${String(stride)}`;
}

/** One GLB's triangles, vertices and copied channels; null when the bytes are not a GLB. */
export function glbGeometry(bytes: Uint8Array): GlbGeometry | null {
  const json = glbJson(bytes);
  if (json === null) return null;
  const accessors = json.accessors ?? [], views = json.bufferViews ?? [];
  const geometries = new Set<string>(), counted = new Set<number>(), copied = new Map<string, number>();
  let triangles = 0, vertices = 0;
  for (const primitive of (json.meshes ?? []).flatMap(mesh => mesh.primitives ?? [])) {
    const attributes = primitive.attributes ?? {}, position = attributes['POSITION'];
    if (position === undefined) continue;
    // a geometry two meshes (or instances) share is resident once
    const key = `${JSON.stringify(attributes)}|${String(primitive.indices ?? -1)}|${String(primitive.mode ?? TRIANGLES)}`;
    if (geometries.has(key)) continue;
    geometries.add(key);
    const count = accessors[position]?.count ?? 0;
    if ((primitive.mode ?? TRIANGLES) === TRIANGLES) triangles += Math.floor((primitive.indices === undefined ? count : accessors[primitive.indices]?.count ?? 0) / 3);
    if (!counted.has(position)) { counted.add(position); vertices += count; }
    for (const [semantic, index] of Object.entries(attributes)) {
      const accessor = accessors[index];
      if (accessor === undefined || accessor.bufferView === undefined) continue;
      const layout = copiedKey(semantic, accessor, views[accessor.bufferView]);
      if (layout !== null) copied.set(layout, (copied.get(layout) ?? 0) + accessor.count);
    }
  }
  return { triangles, vertices, copied };
}

/** A built shard's static geometry: every GLB's triangles and vertices, each geometry once, and its copied channels. */
export interface ShardGeometry { readonly triangles: number; readonly vertices: number; readonly glbs: number; readonly copied: readonly CopiedChannel[] }

/** Every GLB in a built shard's assets: summed triangles and vertices, and each copied channel with its file count. */
export function shardGeometry(assets: Iterable<Uint8Array>): ShardGeometry {
  let triangles = 0, vertices = 0, glbs = 0;
  const copied = new Map<string, { vertices: number; files: number }>();
  for (const bytes of assets) {
    const glb = glbGeometry(bytes);
    if (glb === null) continue;
    glbs++; triangles += glb.triangles; vertices += glb.vertices;
    for (const [channel, count] of glb.copied) {
      const row = copied.get(channel) ?? { vertices: 0, files: 0 };
      row.vertices += count; row.files++; copied.set(channel, row);
    }
  }
  return { triangles, vertices, glbs, copied: [...copied].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([channel, row]) => ({ channel, vertices: row.vertices, files: row.files })) };
}

/** The report card's line: none, or each copied channel with its vertices. */
export function vertexLayoutLine(copied: readonly CopiedChannel[]): string {
  if (copied.length === 0) return 'every vertex channel 4-byte aligned';
  return `${String(copied.length)} channel${copied.length === 1 ? '' : 's'} ANGLE copies: ${copied.map(row => `${row.channel} (${(row.vertices / 1000).toFixed(0)} k vertices, ${String(row.files)} GLB${row.files === 1 ? '' : 's'})`).join(', ')}`;
}

/** The ratchet: a copied layout the cook did not write when STR17 landed refuses, by name. */
export function vertexLayoutRefusals(copied: readonly CopiedChannel[]): LayoutFinding[] {
  return copied.filter(row => !EXISTING_COPIED_LAYOUTS.has(row.channel)).map(row => ({ code: 'vertex-layout-copy',
    message: `vertex channel ${row.channel} (${String(row.files)} GLB${row.files === 1 ? '' : 's'}) is not 4-byte aligned, so ANGLE's Metal back end holds a second copy of it` }));
}
