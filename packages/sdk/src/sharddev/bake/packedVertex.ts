/**
 * MEMORY-STRUCTURE STR16 (meta `docs/plans/MEMORY-STRUCTURE-PLAN.md`): a packed static vertex.
 *
 * `packStaticGlb` rewrites a built static GLB's vertex channels into the layout the phone keeps on the GPU as it is:
 * Int8 normals and tangents, Uint8 colour (a float colour inside [0, 1]), normalized Uint16 UVs (a UV inside [0, 1]),
 * every vertex channel in its own view with a 4-byte-aligned stride (Metal reads it in place: no 3-byte channel, no
 * stride-6 16-bit channel, so ANGLE makes no second copy; STR17). Positions keep their storage (float stays float).
 * Every other channel keeps its storage and only loses an interleaved or unaligned layout. A colour outside [0, 1] or a
 * UV outside [0, 1] stays float. Skinned and morphed primitives, whole-partition pieces, and a file this cannot read exactly (meshopt or Draco
 * compression, sparse accessors, an external buffer), come back unchanged.
 *
 * The cook writes this layout only when asked (`setStaticVertexPacking(true)`, off by default) until the look check
 * passes: `staticGlb` and `compactPhoneGlb` hand their output through it. The engine reads either layout, chosen by
 * what each accessor declares (KHR_mesh_quantization).
 */

const GLB_MAGIC = 0x46546c67, JSON_CHUNK = 0x4e4f534a, BIN_CHUNK = 0x004e4942;
const FLOAT = 5126, BYTE = 5120, UNSIGNED_BYTE = 5121, SHORT = 5122, UNSIGNED_SHORT = 5123, UNSIGNED_INT = 5125;
const SIZE: Readonly<Record<number, number>> = { [BYTE]: 1, [UNSIGNED_BYTE]: 1, [SHORT]: 2, [UNSIGNED_SHORT]: 2, [UNSIGNED_INT]: 4, [FLOAT]: 4 };
const WIDTH: Readonly<Record<string, number>> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const QUANTIZATION = 'KHR_mesh_quantization';
/** Extensions whose data this rewrite cannot read exactly: the file passes through unchanged. */
const OPAQUE = new Set(['EXT_meshopt_compression', 'KHR_meshopt_compression', 'KHR_draco_mesh_compression']);

let packing = false;
/** STR16's cook option: `true` makes `staticGlb` and `compactPhoneGlb` write the packed layout. Off by default; a
 *  shard's generator turns it on (its source is in the build's cache key, so the flag is too). Returns the old value. */
export function setStaticVertexPacking(enabled: boolean): boolean { const old = packing; packing = enabled; return old; }
/** Whether the cook writes packed static vertices now. */
export function staticVertexPacking(): boolean { return packing; }

type Json = Record<string, unknown>;
interface Accessor { bufferView?: number; byteOffset?: number; componentType: number; normalized?: boolean; count: number; type: string; min?: number[]; max?: number[]; sparse?: unknown; [key: string]: unknown }
interface BufferView { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number; target?: number; [key: string]: unknown }
interface Primitive { attributes?: Record<string, number>; targets?: unknown[]; [key: string]: unknown }
interface Gltf { accessors?: Accessor[]; bufferViews?: BufferView[]; buffers?: { byteLength: number; uri?: string }[]; meshes?: { primitives?: Primitive[] }[];
  nodes?: Json[]; extensionsUsed?: string[]; extensionsRequired?: string[]; [key: string]: unknown }

/** The packed component type an attribute takes, or its own when it keeps its storage. */
function packedType(semantic: string, accessor: Accessor, values: Float64Array): { type: number; normalized: boolean } {
  const own = { type: accessor.componentType, normalized: accessor.normalized === true };
  if (accessor.componentType !== FLOAT) return own;
  const inside = (low: number): boolean => values.every(value => value >= low && value <= 1);
  if ((semantic === 'NORMAL' && accessor.type === 'VEC3') || (semantic === 'TANGENT' && accessor.type === 'VEC4')) return { type: BYTE, normalized: true };
  if (/^COLOR_\d+$/u.test(semantic) && inside(0)) return { type: UNSIGNED_BYTE, normalized: true };
  if (/^TEXCOORD_\d+$/u.test(semantic) && accessor.type === 'VEC2' && inside(0)) return { type: UNSIGNED_SHORT, normalized: true };
  return own;
}

function readComponent(view: DataView, at: number, type: number, normalized: boolean): number {
  switch (type) {
    case FLOAT: return view.getFloat32(at, true);
    case BYTE: { const n = view.getInt8(at); return normalized ? Math.max(n / 127, -1) : n; }
    case UNSIGNED_BYTE: { const n = view.getUint8(at); return normalized ? n / 255 : n; }
    case SHORT: { const n = view.getInt16(at, true); return normalized ? Math.max(n / 32767, -1) : n; }
    case UNSIGNED_SHORT: { const n = view.getUint16(at, true); return normalized ? n / 65535 : n; }
    case UNSIGNED_INT: return view.getUint32(at, true);
    default: throw new Error(`Unsupported GLB component type ${String(type)}`);
  }
}
/** The raw stored word of a component (no normalization), for a channel that keeps its storage exactly. */
function readWord(view: DataView, at: number, type: number): number { return readComponent(view, at, type, false); }

function writeComponent(view: DataView, at: number, type: number, normalized: boolean, value: number): void {
  const unit = (scale: number, low: number): number => Math.round(Math.max(low, Math.min(1, value)) * scale);
  switch (type) {
    case FLOAT: view.setFloat32(at, value, true); return;
    case BYTE: view.setInt8(at, normalized ? unit(127, -1) : value); return;
    case UNSIGNED_BYTE: view.setUint8(at, normalized ? unit(255, 0) : value); return;
    case SHORT: view.setInt16(at, normalized ? unit(32767, -1) : value, true); return;
    case UNSIGNED_SHORT: view.setUint16(at, normalized ? unit(65535, 0) : value, true); return;
    case UNSIGNED_INT: view.setUint32(at, value, true); return;
    default: throw new Error(`Unsupported GLB component type ${String(type)}`);
  }
}

function parse(bytes: Uint8Array): { json: Gltf; bin: Uint8Array } | null {
  if (bytes.byteLength < 20) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(16, true) !== JSON_CHUNK) return null;
  const length = view.getUint32(12, true), json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as Gltf;
  const at = 20 + length;
  if (at + 8 > bytes.byteLength) return { json, bin: new Uint8Array() };
  if (view.getUint32(at + 4, true) !== BIN_CHUNK) return null;
  return { json, bin: bytes.subarray(at + 8, at + 8 + view.getUint32(at, true)) };
}

function write(json: Gltf, bin: Uint8Array): Uint8Array {
  const raw = new TextEncoder().encode(JSON.stringify(json)), length = Math.ceil(raw.length / 4) * 4, binLength = Math.ceil(bin.length / 4) * 4;
  const out = new Uint8Array(28 + length + binLength), view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true); view.setUint32(4, 2, true); view.setUint32(8, out.length, true);
  view.setUint32(12, length, true); view.setUint32(16, JSON_CHUNK, true); out.fill(32, 20, 20 + length); out.set(raw, 20);
  view.setUint32(20 + length, binLength, true); view.setUint32(24 + length, BIN_CHUNK, true); out.set(bin, 28 + length);
  return out;
}

/** The packed layout of a static GLB (see the module comment); the same bytes when nothing changes or it cannot read them. */
export function packStaticGlb(input: Uint8Array): Uint8Array {
  const parsed = parse(input);
  if (parsed === null) return input;
  const { json, bin } = parsed, accessors = json.accessors ?? [], views = json.bufferViews ?? [];
  if ((json.buffers ?? []).length > 1 || (json.buffers ?? []).some(buffer => buffer.uri !== undefined)) return input;
  if ([...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])].some(name => OPAQUE.has(name))) return input;
  if (views.some(view => view['extensions'] !== undefined)) return input;
  // every vertex channel of a static primitive (no skin, no morph targets), by accessor; a semantic is kept for the pick
  // A whole-partition piece (one source draw split across files, ONE-FORMAT's slabs) keeps its layout: the engine
  // reassembles the pieces only when every piece declares the same channels, and the [0, 1] pick is per file.
  const partitioned = new Set<number>();
  for (const node of json.nodes ?? []) {
    const extras = node['extras'], mesh = node['mesh'];
    if (typeof mesh === 'number' && typeof extras === 'object' && extras !== null && (extras as Json)['wholePartition'] !== undefined) partitioned.add(mesh);
  }
  const channels = new Map<number, string>(), held = new Set<number>();
  for (const [meshIndex, mesh] of (json.meshes ?? []).entries()) for (const primitive of mesh.primitives ?? []) {
    const attributes = Object.entries(primitive.attributes ?? {});
    const still = !partitioned.has(meshIndex) && (primitive.targets ?? []).length === 0 && !attributes.some(([semantic]) => /^(JOINTS|WEIGHTS)_\d+$/u.test(semantic));
    for (const [semantic, index] of attributes) {
      if (still && !held.has(index)) channels.set(index, channels.get(index) === undefined || channels.get(index) === semantic ? semantic : `_${semantic}`);
      else { held.add(index); channels.delete(index); }
    }
  }
  // an accessor read anywhere else (an index, an instance row, an animation) keeps its view and storage
  const rewritten = new Map<number, { accessor: Accessor; bytes: Uint8Array; stride: number; element: number }>();
  const source = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  let changed = false;
  for (const [index, semantic] of channels) {
    const accessor = accessors[index];
    if (accessor === undefined || accessor.bufferView === undefined || accessor.sparse !== undefined) continue;
    const view = views[accessor.bufferView], size = SIZE[accessor.componentType], width = WIDTH[accessor.type];
    if (view === undefined || size === undefined || width === undefined) continue;
    const element = size * width, stride = view.byteStride ?? element, base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    if (base + (accessor.count - 1) * stride + element > bin.byteLength) return input;
    const values = new Float64Array(accessor.count * width), words = new Float64Array(accessor.count * width);
    for (let i = 0; i < accessor.count; i++) for (let c = 0; c < width; c++) {
      const at = base + i * stride + c * size;
      values[i * width + c] = readComponent(source, at, accessor.componentType, accessor.normalized === true);
      words[i * width + c] = readWord(source, at, accessor.componentType);
    }
    const pick = packedType(semantic, accessor, values), keep = pick.type === accessor.componentType;
    const packedElement = SIZE[pick.type] ?? 4, packedStride = Math.ceil(packedElement * width / 4) * 4;
    const interleaved = accessors.some((other, i) => i !== index && other.bufferView === accessor.bufferView);
    if (keep && stride === packedStride && stride % 4 === 0 && !interleaved) continue;
    const bytes = new Uint8Array(accessor.count * packedStride), out = new DataView(bytes.buffer);
    for (let i = 0; i < accessor.count; i++) for (let c = 0; c < width; c++) {
      const at = i * packedStride + c * packedElement;
      if (keep) writeComponent(out, at, pick.type, false, words[i * width + c] ?? 0);
      else writeComponent(out, at, pick.type, pick.normalized, values[i * width + c] ?? 0);
    }
    const next: Accessor = { ...accessor, componentType: pick.type };
    delete next.byteOffset;
    if (pick.normalized) next.normalized = true; else delete next.normalized;
    // glTF keeps min / max in the accessor's own (stored) units; a re-typed channel's float bounds no longer apply
    if (!keep) { delete next.min; delete next.max; }
    rewritten.set(index, { accessor: next, bytes, stride: packedStride, element: packedElement * width });
    changed = true;
  }
  if (!changed) return input;
  // the new binary: every view an untouched accessor (or an image, or anything else) still reads, then the new channels
  const readers = new Map<number, number>();
  for (const [index, accessor] of accessors.entries()) if (!rewritten.has(index) && accessor.bufferView !== undefined) readers.set(accessor.bufferView, (readers.get(accessor.bufferView) ?? 0) + 1);
  const referenced = new Set(readers.keys());
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { for (const item of value) visit(item); return; }
    if (typeof value !== 'object' || value === null) return;
    for (const [key, item] of Object.entries(value)) { if (key === 'bufferView' && typeof item === 'number') referenced.add(item); else visit(item); }
  };
  const { accessors: _accessors, bufferViews: _views, ...rest } = json; visit(rest);
  const chunks: Uint8Array[] = [], nextViews: BufferView[] = [], remap = new Map<number, number>();
  let offset = 0;
  const push = (bytes: Uint8Array, view: Omit<BufferView, 'buffer' | 'byteOffset' | 'byteLength'>): number => {
    const padded = Math.ceil(bytes.length / 4) * 4, copy = new Uint8Array(padded); copy.set(bytes);
    nextViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...view }); chunks.push(copy); offset += padded;
    return nextViews.length - 1;
  };
  for (const [i, view] of views.entries()) {
    if (!referenced.has(i)) continue;
    const { buffer: _buffer, byteOffset = 0, byteLength, ...keep } = view;
    remap.set(i, push(bin.subarray(byteOffset, byteOffset + byteLength), keep));
  }
  // the parsed JSON is this call's own copy: accessors are re-pointed in place
  const nextAccessors: Accessor[] = [];
  for (const [index, accessor] of accessors.entries()) {
    const row = rewritten.get(index);
    if (row !== undefined) nextAccessors.push(Object.assign(row.accessor, { bufferView: push(row.bytes, { ...(row.stride === row.element ? {} : { byteStride: row.stride }), target: 34962 }) }));
    else { if (accessor.bufferView !== undefined) accessor.bufferView = remap.get(accessor.bufferView) ?? accessor.bufferView; nextAccessors.push(accessor); }
  }
  const remapViews = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(remapViews);
    if (typeof value !== 'object' || value === null) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'bufferView' && typeof item === 'number' ? remap.get(item) ?? item : remapViews(item)]));
  };
  const next = remapViews(rest) as Gltf;
  // a native-attribute node names each channel's storage (the engine restores it): a re-typed portable channel says so
  const storage: Readonly<Record<number, string>> = { [BYTE]: 'Int8Array', [UNSIGNED_BYTE]: 'Uint8Array', [SHORT]: 'Int16Array', [UNSIGNED_SHORT]: 'Uint16Array', [UNSIGNED_INT]: 'Uint32Array', [FLOAT]: 'Float32Array' };
  for (const node of next.nodes ?? []) {
    const extras = node['extras'], mesh = node['mesh'];
    if (typeof extras !== 'object' || extras === null || typeof mesh !== 'number') continue;
    const native: unknown = (extras as Json)['nativeAttributes'];
    if (typeof native !== 'object' || native === null) continue;
    const attributes = (json.meshes ?? [])[mesh]?.primitives?.[0]?.attributes ?? {};
    const rows = Object.fromEntries(Object.entries(native).map(([name, row]: [string, unknown]) => {
      if (typeof row !== 'object' || row === null || !('semantic' in row) || typeof row.semantic !== 'string') return [name, row];
      const index = attributes[row.semantic], packed = index === undefined ? undefined : rewritten.get(index)?.accessor;
      return [name, packed === undefined ? row : { ...row, storage: storage[packed.componentType] ?? 'Float32Array', normalized: packed.normalized === true }];
    }));
    node['extras'] = { ...(extras as Json), nativeAttributes: rows };
  }
  next.accessors = nextAccessors; next.bufferViews = nextViews; next.buffers = [{ byteLength: offset }];
  const used = new Set(next.extensionsUsed);
  if ([...rewritten.values()].some(row => row.accessor.componentType !== FLOAT) && !used.has(QUANTIZATION)) {
    next.extensionsUsed = [...(next.extensionsUsed ?? []), QUANTIZATION];
    next.extensionsRequired = [...(next.extensionsRequired ?? []), QUANTIZATION];
  }
  const binary = new Uint8Array(offset); let at = 0;
  for (const chunk of chunks) { binary.set(chunk, at); at += chunk.length; }
  return write(next, binary);
}
