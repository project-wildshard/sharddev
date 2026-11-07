import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import type { WorldPrimitive } from './world';
import type { NativeLatticeTile } from './nativeLattice';

/** Actual triangle count and the tool's absolute appearance-error estimate, including float-position allowance. */
export interface WorldLod { primitive: WorldPrimitive; errorMetres: number; sourceTriangles: number; triangles: number }
/** Native render-only L1 result; actual counts can exceed the requested ratio because every border remains locked. */
export interface NativeLatticeLod { tile: NativeLatticeTile; errorMetres: number; sourceTriangles: number; triangles: number }

function attributes(primitive: WorldPrimitive, vertices: number): { data: Float32Array; stride: number; weights: number[] } {
  const rows: { data: Float32Array; width: number }[] = [];
  if (primitive.colours !== null && ![3, 4].includes(primitive.colours.length / vertices)) throw new Error('World LOD invalid colour attributes');
  for (const [data, width] of [[primitive.normals, 3], [primitive.uv, 2], [primitive.colours, primitive.colours === null ? 3 : primitive.colours.length / vertices], [primitive.tangents, 4]] as const) {
    if (data === null) continue;
    if (!(data instanceof Float32Array) || ![2, 3, 4].includes(width) || data.length !== vertices * width || data.some(value => !Number.isFinite(value))) throw new Error('World LOD invalid vertex attributes');
    rows.push({ data, width });
  }
  const stride = rows.reduce((sum, row) => sum + row.width, 0), data = new Float32Array(vertices * stride);
  for (let vertex = 0; vertex < vertices; vertex++) {
    let offset = vertex * stride;
    for (const row of rows) { data.set(row.data.subarray(vertex * row.width, (vertex + 1) * row.width), offset); offset += row.width; }
  }
  return { data, stride, weights: Array.from({ length: stride }, () => 1) };
}

function compact(source: WorldPrimitive, selected: Uint32Array): WorldPrimitive {
  const vertices = source.positions.length / 3, remap = new Uint32Array(vertices).fill(0xffffffff), kept: number[] = [], indices = new Uint32Array(selected.length);
  selected.forEach((vertex, i) => {
    let at = remap[vertex];
    if (at === undefined) throw new Error('World LOD output index outside source');
    if (at === 0xffffffff) { at = kept.length; kept.push(vertex); remap[vertex] = at; }
    indices[i] = at;
  });
  const copy = (data: Float32Array | null, width: number): Float32Array | null => {
    if (data === null) return null;
    const output = new Float32Array(kept.length * width);
    kept.forEach((vertex, i) => output.set(data.subarray(vertex * width, (vertex + 1) * width), i * width));
    return output;
  };
  const positions = new Float64Array(kept.length * 3);
  kept.forEach((vertex, i) => positions.set(source.positions.subarray(vertex * 3, vertex * 3 + 3), i * 3));
  return { ...source, positions, indices, normals: copy(source.normals, 3), uv: copy(source.uv, 2), colours: copy(source.colours, source.colours === null ? 3 : source.colours.length / vertices), tangents: copy(source.tangents, 4) };
}

/** Simplify one material primitive without moving vertices, flattening overhangs or crossing attribute/border seams.
 * The ratio is a target, not a promise: error/topology locks may retain more triangles. Error is meshopt's estimate,
 * not an independently measured Hausdorff bound. Callers must charge the actual returned geometry.
 */
export async function simplifyWorldPrimitive(source: WorldPrimitive, targetRatio: number, maxErrorMetres: number): Promise<WorldLod> {
  const vertices = source.positions.length / 3, indices = source.indices;
  if (!(source.positions instanceof Float64Array) || !Number.isInteger(vertices) || vertices < 3 || vertices > 4_000_000 || source.positions.some(value => !Number.isFinite(value) || Math.abs(value) > 1000) || !(indices instanceof Uint32Array) || indices.length < 3 || indices.length > 12_000_000 || indices.length % 3 !== 0 || indices.some(index => index >= vertices)) throw new Error('World LOD invalid bounded triangle geometry');
  if (!Number.isFinite(targetRatio) || targetRatio <= 0 || targetRatio > 1 || !Number.isFinite(maxErrorMetres) || maxErrorMetres <= 0 || maxErrorMetres > 500) throw new Error('World LOD invalid ratio or error');
  const packed = attributes(source, vertices), positions = Float32Array.from(source.positions);
  let quantization = 0;
  for (let i = 0; i < positions.length; i += 3) quantization = Math.max(quantization, Math.hypot((positions[i] ?? 0) - (source.positions[i] ?? 0), (positions[i + 1] ?? 0) - (source.positions[i + 1] ?? 0), (positions[i + 2] ?? 0) - (source.positions[i + 2] ?? 0)));
  const allowance = quantization * 2, target = Math.max(3, Math.floor(indices.length / 3 * targetRatio) * 3);
  let selected: Uint32Array = Uint32Array.from(indices);
  let errorMetres = 0;
  if (target < indices.length && allowance < maxErrorMetres) {
    if (!MeshoptSimplifier.supported) throw new Error('World LOD WASM is unavailable');
    await MeshoptSimplifier.ready;
    const [output, error] = MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, packed.data, packed.stride, packed.weights, null, target, maxErrorMetres - allowance, ['LockBorder', 'ErrorAbsolute']);
    if (!Number.isFinite(error) || error < 0 || error + allowance > maxErrorMetres || output.length < 3 || output.length > indices.length || output.length % 3 !== 0) throw new Error('World LOD invalid simplifier output');
    selected = output;
    if (output.length < indices.length) errorMetres = error + allowance;
  }
  return { primitive: compact(source, selected), errorMetres, sourceTriangles: indices.length / 3, triangles: selected.length / 3 };
}

/** Simplify an already clipped native L1 tile with the pinned WASM tool, retaining exact surviving vertices and channels.
 * Tile and hole borders stay locked; collision and L0 are never changed. All channels participate with unit weights
 * (at most 32 components, the tool's limit). The absolute appearance-error estimate includes float32 conversion;
 * it is not a measured Hausdorff bound or a promise to reach the ratio. Charge the returned geometry, not the target.
 */
export async function simplifyNativeLatticeTile(source: NativeLatticeTile, targetRatio: number, maxErrorMetres: number): Promise<NativeLatticeLod> {
  const vertices = source.positions.length / 3, indices = source.indices;
  if (source.lod !== 1 || source.size !== 125 || ![source.x, source.z].every(value => Number.isInteger(value) && value >= 0 && value < 4)
    || !(source.positions instanceof Float64Array) || !Number.isInteger(vertices) || vertices > 100_000
    || source.positions.some(value => !Number.isFinite(value) || Math.abs(value) > 250) || !(indices instanceof Uint32Array)
    || indices.length > 600_000 || indices.length % 3 !== 0 || indices.some(index => index >= vertices)
    || (indices.length === 0 && vertices !== 0)) throw new Error('Native L1 invalid bounded tile');
  const minX = -250 + source.x * 125, minZ = -250 + source.z * 125;
  if ([...source.bounds.min, ...source.bounds.max].some(value => !Number.isFinite(value) || Math.abs(value) > 250)
    || source.bounds.min[0] !== minX || source.bounds.max[0] !== minX + 125 || source.bounds.min[2] !== minZ || source.bounds.max[2] !== minZ + 125
    || source.bounds.min[1] > source.bounds.max[1] || source.positions.some((value, at) => value < (source.bounds.min[at % 3] ?? Infinity) || value > (source.bounds.max[at % 3] ?? -Infinity))) throw new Error('Native L1 invalid tile bounds');
  if (!Number.isFinite(targetRatio) || targetRatio <= 0 || targetRatio > 1 || !Number.isFinite(maxErrorMetres) || maxErrorMetres <= 0 || maxErrorMetres > 500) throw new Error('Native L1 invalid ratio or error');
  const channels = Object.entries(source.attributes).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const stride = channels.reduce((sum, [, channel]) => sum + channel.itemSize, 0);
  if (channels.length > 16 || stride > 32) throw new Error('Native L1 simplifier attribute cap (32 components)');
  for (const [name, channel] of channels) if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/u.test(name) || name === 'position'
    || !Number.isInteger(channel.itemSize) || channel.itemSize < 1 || channel.itemSize > 4 || !(channel.values instanceof Float64Array)
    || channel.values.length !== vertices * channel.itemSize || channel.values.some(value => !Number.isFinite(Math.fround(value)))) throw new Error(`Native L1 invalid channel ${name}`);
  const positions = Float32Array.from(source.positions), data = new Float32Array(vertices * stride);
  let quantization = 0;
  for (let vertex = 0; vertex < vertices; vertex++) {
    let squared = 0, offset = 0;
    for (let c = 0; c < 3; c++) squared += ((source.positions[vertex * 3 + c] ?? 0) - (positions[vertex * 3 + c] ?? 0)) ** 2;
    for (const [, channel] of channels) for (let c = 0; c < channel.itemSize; c++) {
      const value = channel.values[vertex * channel.itemSize + c] ?? 0, rounded = Math.fround(value);
      data[vertex * stride + offset++] = rounded; squared += (value - rounded) ** 2;
    }
    quantization = Math.max(quantization, Math.sqrt(squared));
  }
  const allowance = quantization * 2, target = Math.max(3, Math.floor(indices.length / 3 * targetRatio) * 3);
  let selected = Uint32Array.from(indices), errorMetres = 0;
  if (target < indices.length && allowance < maxErrorMetres) {
    if (!MeshoptSimplifier.supported) throw new Error('Native L1 WASM is unavailable');
    await MeshoptSimplifier.ready;
    const [output, error] = MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, data, stride, Array.from({ length: stride }, () => 1), null, target, maxErrorMetres - allowance, ['LockBorder', 'ErrorAbsolute']);
    if (!Number.isFinite(error) || error < 0 || error + allowance > maxErrorMetres || output.length < 3 || output.length > indices.length || output.length % 3 !== 0) throw new Error('Native L1 invalid simplifier output');
    selected = Uint32Array.from(output); if (output.length < indices.length) errorMetres = error + allowance;
  }
  const remap = new Map<number, number>(), kept: number[] = [];
  const compactIndices = selected.map(vertex => {
    let at = remap.get(vertex);
    if (at === undefined) { at = kept.length; remap.set(vertex, at); kept.push(vertex); }
    return at;
  });
  const copy = (values: Float64Array, width: number): Float64Array => {
    const output = new Float64Array(kept.length * width);
    kept.forEach((vertex, at) => output.set(values.subarray(vertex * width, (vertex + 1) * width), at * width));
    return output;
  };
  const outputAttributes: NativeLatticeTile['attributes'] = {};
  for (const [name, channel] of channels) outputAttributes[name] = { itemSize: channel.itemSize, values: copy(channel.values, channel.itemSize) };
  return { tile: { ...source, positions: copy(source.positions, 3), indices: compactIndices, attributes: outputAttributes,
    bounds: { min: [...source.bounds.min], max: [...source.bounds.max] } }, errorMetres, sourceTriangles: indices.length / 3, triangles: selected.length / 3 };
}
