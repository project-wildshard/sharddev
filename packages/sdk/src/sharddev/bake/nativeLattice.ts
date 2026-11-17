/** A native vertex channel. Values are interpolated linearly at cuts, without renormalising normals or splat weights. */
export interface NativeLatticeAttribute { itemSize: number; values: Float32Array | Float64Array }
/** Exact native terrain mesh, including its original diagonal, holes and vertex channels. Collision is not rebuilt here. */
export interface NativeLatticeSource {
  resolution: 256 | 257;
  positions: Float32Array | Float64Array;
  indices: Uint32Array;
  attributes: Readonly<Record<string, NativeLatticeAttribute>>;
}
/** Render-only tile geometry. Original vertices retain their values; new boundary vertices lie on original triangles. */
export interface NativeLatticeTile {
  lod: 0 | 1; x: number; z: number; size: 62.5 | 125;
  positions: Float64Array; indices: Uint32Array;
  attributes: Record<string, { itemSize: number; values: Float64Array }>;
  bounds: { min: [number, number, number]; max: [number, number, number] };
}
interface Vertex { readonly values: readonly number[] }
interface Chunk {
  positions: number[]; indices: number[]; attributes: number[][]; vertices: Map<string, number>;
  // Vertex tuples are owned here and never changed after construction.
  heads: Map<number, number>; links: number[]; tuples: (readonly number[])[]; strings: boolean;
  sample: Float64Array; words: Uint32Array;
}
const HALF = 250;
const nativeResolution = (value: number): boolean => value === 256 || value === 257;
const tileLod = (value: number): boolean => value === 0 || value === 1;

function channels(source: NativeLatticeSource): [string, NativeLatticeAttribute][] {
  const vertices = source.resolution ** 2;
  if (!nativeResolution(source.resolution) || source.positions.length !== vertices * 3 || !(source.positions instanceof Float32Array || source.positions instanceof Float64Array)
    || !(source.indices instanceof Uint32Array) || source.indices.length % 3 !== 0 || source.indices.length > (source.resolution - 1) ** 2 * 6 || source.indices.some(i => i >= vertices)) throw new Error('Native lattice requires its bounded original 256/257 mesh');
  if (source.positions.some(value => !Number.isFinite(value) || Math.abs(value) > HALF)) throw new Error('Native lattice outside finite cell bounds');
  const entries = Object.entries(source.attributes).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  if (entries.length > 16 || entries.reduce((n, [, channel]) => n + channel.itemSize, 0) > 64) throw new Error('Native lattice attribute cap');
  for (const [name, channel] of entries) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(name) || name === 'position' || !Number.isInteger(channel.itemSize) || channel.itemSize < 1 || channel.itemSize > 4
      || !(channel.values instanceof Float32Array || channel.values instanceof Float64Array) || channel.values.length !== vertices * channel.itemSize || channel.values.some(value => !Number.isFinite(value))) throw new Error(`Invalid native lattice attribute ${name}`);
  }
  return entries;
}
function vertex(source: NativeLatticeSource, entries: readonly [string, NativeLatticeAttribute][], index: number): Vertex {
  const values: number[] = Array.from(source.positions.subarray(index * 3, index * 3 + 3));
  for (const [, channel] of entries) for (const value of channel.values.subarray(index * channel.itemSize, (index + 1) * channel.itemSize)) values.push(value);
  return { values };
}
function component(point: Vertex, axis: number): number {
  const value = point.values[axis];
  if (value === undefined) throw new Error('Native lattice vertex is incomplete');
  return value;
}
function intersection(a: Vertex, b: Vertex, axis: number, boundary: number): Vertex {
  // Canonical endpoint order makes both sides of a shared edge compute the same floating-point result.
  const [start, end] = component(a, axis) < component(b, axis) ? [a, b] : [b, a];
  if (component(start, axis) === boundary) return start;
  if (component(end, axis) === boundary) return end;
  const t = (boundary - component(start, axis)) / (component(end, axis) - component(start, axis));
  const values = start.values.map((value, i) => value + (component(end, i) - value) * t);
  values[axis] = boundary;
  return { values };
}
function clip(input: readonly Vertex[], axis: number, boundary: number, greater: boolean): Vertex[] {
  const output: Vertex[] = [];
  for (let i = 0; i < input.length; i++) {
    const a = input[i], b = input[(i + 1) % input.length];
    if (a === undefined || b === undefined) continue;
    const insideA = greater ? component(a, axis) >= boundary : component(a, axis) <= boundary;
    const insideB = greater ? component(b, axis) >= boundary : component(b, axis) <= boundary;
    if (insideA) output.push(a);
    if (insideA !== insideB) output.push(intersection(a, b, axis, boundary));
  }
  return output;
}
function areaSquared(a: Vertex, b: Vertex, c: Vertex): number {
  const ux = component(b, 0) - component(a, 0), uy = component(b, 1) - component(a, 1), uz = component(b, 2) - component(a, 2);
  const vx = component(c, 0) - component(a, 0), vy = component(c, 1) - component(a, 1), vz = component(c, 2) - component(a, 2);
  return (uy * vz - uz * vy) ** 2 + (uz * vx - ux * vz) ** 2 + (ux * vy - uy * vx) ** 2;
}
function vertexKey(values: readonly number[]): string { return values.map(n => Object.is(n, -0) ? '-0' : String(n)).join('/'); }
function vertexHash(chunk: Chunk, values: readonly number[]): number | undefined {
  if (values.length < 3) return undefined;
  const { sample, words } = chunk;
  let hash = 2166136261;
  for (const value of values) {
    if (typeof value !== 'number') return undefined;
    if (value === (value | 0) && !Object.is(value, -0)) hash = Math.imul(hash ^ value, 16777619);
    else if (Number.isNaN(value)) { hash = Math.imul(hash, 16777619); hash = Math.imul(hash ^ 0x7ff80000, 16777619); }
    else {
      sample[0] = value;
      hash = Math.imul(hash ^ (words[0] ?? 0), 16777619);
      hash = Math.imul(hash ^ (words[1] ?? 0), 16777619);
    }
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}
function sameVertex(previous: readonly number[] | undefined, values: readonly number[]): boolean {
  if (previous === undefined || previous.length !== values.length) return false;
  for (let k = 0; k < values.length; k++) if (!Object.is(previous[k], values[k])) return false;
  return true;
}
function stringVertices(chunk: Chunk): void {
  chunk.strings = true; chunk.heads.clear(); chunk.links.length = 0;
  for (let index = 0; index < chunk.tuples.length; index++) chunk.vertices.set(vertexKey(chunk.tuples[index] ?? []), index);
  chunk.tuples.length = 0;
}

function add(chunk: Chunk, value: Vertex, entries: readonly [string, NativeLatticeAttribute][]): number {
  let existing: number | undefined, hash = 0, key = '';
  if (!chunk.strings) {
    const found = vertexHash(chunk, value.values);
    if (found === undefined) stringVertices(chunk);
    else {
      hash = found;
      let candidate = chunk.heads.get(hash), visited = 0;
      while (candidate !== undefined && candidate >= 0) {
        if (sameVertex(chunk.tuples[candidate], value.values)) { existing = candidate; break; }
        // Keep adversarial lookup bounded by returning to the complete original map.
        if (++visited >= 16) { stringVertices(chunk); break; }
        candidate = chunk.links[candidate];
      }
    }
  }
  if (chunk.strings) { key = vertexKey(value.values); existing = chunk.vertices.get(key); }
  if (existing !== undefined) return existing;
  const index = chunk.positions.length / 3;
  if (chunk.strings) chunk.vertices.set(key, index);
  else { chunk.tuples[index] = value.values; chunk.links[index] = chunk.heads.get(hash) ?? -1; chunk.heads.set(hash, index); }
  chunk.positions.push(...value.values.slice(0, 3));
  let offset = 3;
  entries.forEach(([, channel], i) => {
    const target = chunk.attributes[i];
    if (target === undefined) throw new Error('Native lattice attribute output missing');
    target.push(...value.values.slice(offset, offset + channel.itemSize)); offset += channel.itemSize;
  });
  return index;
}

/** Clip original native triangles into the 62.5 m L0 or 125 m L1 grid, preserving every declared vertex channel.
 * This performs no sampling or simplification. L1 initially retains native geometry; later LOD tools must report
 * their actual error. Pass the source's real indices (including terrain cuts), never a reconstructed diagonal.
 * Empty tiles are retained. The caller keeps the original native collision bake as the simulation authority.
 */
export function sliceNativeLattice(source: NativeLatticeSource, lod: 0 | 1): NativeLatticeTile[] {
  if (!tileLod(lod)) throw new Error('Native lattice LOD must be 0 or 1');
  const entries = channels(source), count = lod === 0 ? 8 : 4, size = lod === 0 ? 62.5 : 125;
  const sample = new Float64Array(1), words = new Uint32Array(sample.buffer);
  const chunks: Chunk[] = Array.from({ length: count ** 2 }, () => ({ positions: [], indices: [], attributes: entries.map(() => []), vertices: new Map(), heads: new Map<number, number>(), links: [], tuples: [], strings: false, sample, words }));
  const address = (value: number): number => Math.min(count - 1, Math.floor((value + HALF) / size));
  for (let i = 0; i < source.indices.length; i += 3) {
    const ia = source.indices[i], ib = source.indices[i + 1], ic = source.indices[i + 2];
    if (ia === undefined || ib === undefined || ic === undefined) throw new Error('Native lattice triangle missing');
    const a = vertex(source, entries, ia), b = vertex(source, entries, ib), c = vertex(source, entries, ic);
    if (areaSquared(a, b, c) === 0) throw new Error('Native lattice source has a degenerate triangle');
    for (const axis of [0, 2]) if (Math.max(component(a, axis), component(b, axis), component(c, axis)) - Math.min(component(a, axis), component(b, axis), component(c, axis)) > 500 / (source.resolution - 1) + 0.0001) throw new Error('Native lattice triangle spans more than one source cell');
    const x0 = address(Math.min(component(a, 0), component(b, 0), component(c, 0))), x1 = address(Math.max(component(a, 0), component(b, 0), component(c, 0)));
    const z0 = address(Math.min(component(a, 2), component(b, 2), component(c, 2))), z1 = address(Math.max(component(a, 2), component(b, 2), component(c, 2)));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      let polygon = [a, b, c];
      for (const [axis, boundary, greater] of [[0, -HALF + x * size, true], [0, -HALF + (x + 1) * size, false], [2, -HALF + z * size, true], [2, -HALF + (z + 1) * size, false]] as const) polygon = clip(polygon, axis, boundary, greater);
      const chunk = chunks[z * count + x];
      if (chunk === undefined) throw new Error('Native lattice tile missing');
      for (let j = 1; j + 1 < polygon.length; j++) {
        const pa = polygon[0], pb = polygon[j], pc = polygon[j + 1];
        if (pa === undefined || pb === undefined || pc === undefined || areaSquared(pa, pb, pc) === 0) continue;
        chunk.indices.push(add(chunk, pa, entries), add(chunk, pb, entries), add(chunk, pc, entries));
      }
    }
  }
  return chunks.map((chunk, i) => {
    const x = i % count, z = Math.floor(i / count), minY = chunk.positions.reduce((min, value, at) => at % 3 === 1 ? Math.min(min, value) : min, Infinity);
    const maxY = chunk.positions.reduce((max, value, at) => at % 3 === 1 ? Math.max(max, value) : max, -Infinity);
    const attributes: NativeLatticeTile['attributes'] = {};
    entries.forEach(([name, channel], at) => { attributes[name] = { itemSize: channel.itemSize, values: Float64Array.from(chunk.attributes[at] ?? []) }; });
    return { lod, x, z, size, positions: Float64Array.from(chunk.positions), indices: Uint32Array.from(chunk.indices), attributes,
      bounds: { min: [-HALF + x * size, chunk.indices.length === 0 ? 0 : minY, -HALF + z * size], max: [-HALF + (x + 1) * size, chunk.indices.length === 0 ? 0 : maxY, -HALF + (z + 1) * size] } };
  });
}
