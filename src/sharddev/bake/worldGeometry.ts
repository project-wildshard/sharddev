import { MeshoptEncoder } from 'meshoptimizer/encoder';
import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Matrix4, Quaternion, Vector3, type Box3 } from 'three';
import type { WorldPrimitive } from './world';
import { floatPositionError } from './geometryError';

await MeshoptEncoder.ready;

interface Channel { key: string; width: number; data: Float32Array | Float64Array }
type Vertex = number[];
function channels(source: WorldPrimitive): Channel[] {
  const n = source.positions.length / 3;
  const rows: Channel[] = [{ key: 'position', width: 3, data: source.positions }];
  for (const [key, data, width] of [['normal', source.normals, 3], ['uv', source.uv, 2], ['color', source.colours, source.colours === null ? 3 : source.colours.length / n], ['tangent', source.tangents, 4]] as const) {
    if (data !== null) rows.push({ key, data, width });
  }
  return rows;
}
function cut(input: readonly Vertex[], axis: number, boundary: number, greater: boolean): Vertex[] {
  const output: Vertex[] = [];
  for (let i = 0; i < input.length; i++) {
    const a = input[i], b = input[(i + 1) % input.length];
    if (a === undefined || b === undefined) continue;
    const av = a[axis] ?? 0, bv = b[axis] ?? 0;
    const insideA = greater ? av >= boundary : av <= boundary, insideB = greater ? bv >= boundary : bv <= boundary;
    if (insideA) output.push(a);
    if (insideA !== insideB) {
      // Canonical endpoints keep adjacent tile cuts byte-identical at their shared boundary.
      const [start, end] = av < bv ? [a, b] : [b, a];
      const t = (boundary - (start[axis] ?? 0)) / ((end[axis] ?? 0) - (start[axis] ?? 0));
      const vertex = start.map((value, at) => value + ((end[at] ?? value) - value) * t);
      vertex[axis] = boundary; output.push(vertex);
    }
  }
  return output;
}

function outsideFirstCuts(positions: Float64Array, a: number, b: number, c: number, bounds: readonly [number, number, number, number]): boolean {
  const ax = positions[a * 3] ?? Number.NaN, bx = positions[b * 3] ?? Number.NaN, cx = positions[c * 3] ?? Number.NaN;
  const insideMin = ax >= bounds[0] && bx >= bounds[0] && cx >= bounds[0];
  if (ax < bounds[0] && bx < bounds[0] && cx < bounds[0]) return true;
  if (insideMin && ax > bounds[1] && bx > bounds[1] && cx > bounds[1]) return true;
  // Only inspect z when both earlier x cuts leave every original vertex intact.
  // Otherwise their rounded intersections must still go through the old clipper.
  if (!insideMin || ax > bounds[1] || bx > bounds[1] || cx > bounds[1]) return false;
  const az = positions[a * 3 + 2] ?? Number.NaN, bz = positions[b * 3 + 2] ?? Number.NaN, cz = positions[c * 3 + 2] ?? Number.NaN;
  if (az < bounds[2] && bz < bounds[2] && cz < bounds[2]) return true;
  return az >= bounds[2] && bz >= bounds[2] && cz >= bounds[2] && az > bounds[3] && bz > bounds[3] && cz > bounds[3];
}

/** Clip every authored vertex channel to one tile, preserving vertical faces and both bridge layers.
 * This is offline render geometry clipping; the independent WMC1 baker remains the collision authority. */
export function worldGeometry(source: WorldPrimitive, bounds?: readonly [number, number, number, number], transform?: readonly number[], storageError?: (metres: number) => void): BufferGeometry {
  const rows = channels(source), output = rows.map(() => [] as number[]), matrix = transform === undefined ? null : new Matrix4().fromArray(transform);
  const vertex = (index: number): Vertex => {
    const values: Vertex = [];
    for (const row of rows) for (const value of row.data.subarray(index * row.width, (index + 1) * row.width)) values.push(value);
    return values;
  };
  for (let i = 0; i < source.indices.length; i += 3) {
    const ai = source.indices[i] ?? 0, bi = source.indices[i + 1] ?? 0, ci = source.indices[i + 2] ?? 0;
    if (bounds !== undefined && outsideFirstCuts(source.positions, ai, bi, ci, bounds)) continue;
    let polygon = [vertex(ai), vertex(bi), vertex(ci)];
    if (bounds !== undefined) for (const [axis, boundary, greater] of [[0, bounds[0], true], [0, bounds[1], false], [2, bounds[2], true], [2, bounds[3], false]] as const) polygon = cut(polygon, axis, boundary, greater);
    for (let at = 1; at + 1 < polygon.length; at++) {
      const a = polygon[0], b = polygon[at], c = polygon[at + 1];
      if (a === undefined || b === undefined || c === undefined) continue;
      const pa = new Vector3().fromArray(a), pb = new Vector3().fromArray(b), pc = new Vector3().fromArray(c);
      if (pb.sub(pa).cross(pc.sub(pa)).lengthSq() === 0) continue;
      for (const point of [a, b, c]) {
        let offset = 0;
        rows.forEach((row, channel) => { output[channel]?.push(...point.slice(offset, offset + row.width)); offset += row.width; });
      }
    }
  }
  const geometry = new BufferGeometry();
  rows.forEach((row, at) => { geometry.setAttribute(row.key, new Float32BufferAttribute(output[at] ?? [], row.width)); });
  if (!geometry.hasAttribute('normal')) geometry.computeVertexNormals();
  if (matrix !== null) geometry.applyMatrix4(matrix);
  if (storageError !== undefined) {
    const positions = output[0] ?? [];
    if (matrix === null) storageError(floatPositionError(positions));
    else {
      const stored = geometry.getAttribute('position'), point = new Vector3();
      let error = 0;
      for (let storedVertex = 0; storedVertex < stored.count; storedVertex++) {
        point.fromArray(positions, storedVertex * 3).applyMatrix4(matrix);
        error = Math.max(error, Math.hypot(point.x - stored.getX(storedVertex), point.y - stored.getY(storedVertex), point.z - stored.getZ(storedVertex)));
      }
      storageError(error);
    }
  }
  return geometry;
}

/** RM8.1: a tile's position grid. One power-of-two step for every tile (1/512 m, coarsened only where a tile is too
 *  tall for 16 bits) and an origin on that grid, so a point two tiles share quantizes to the same place in both. */
export interface TileGrid { origin: readonly [number, number, number]; step: number }
export function tileGrid(box: Box3): TileGrid {
  const centre = box.getCenter(new Vector3()).toArray(), lo = box.min.toArray(), hi = box.max.toArray();
  for (let step = 1 / 512; step <= 1; step *= 2) {
    const origin = centre.map(value => Math.round(value / step) * step) as [number, number, number];
    if (origin.every((o, axis) => Math.abs((lo[axis] ?? 0) - o) / step <= 32767 && Math.abs((hi[axis] ?? 0) - o) / step <= 32767)) return { origin, step };
  }
  throw new Error('World tile is too large for a 16-bit position grid');
}
/** RM8.1e: the grid of a primitive whose graph reads its model-space position (the open plots' hologram, turned about
 *  its model origin): origin pinned at that model origin, so the graph's model space is the authored metres times one
 *  uniform scale (1 / step) and a turn about the origin, a linear map, comes out the same once the node scales back. */
export function modelGrid(box: Box3): TileGrid {
  const lo = box.min.toArray(), hi = box.max.toArray();
  for (let step = 1 / 512; step <= 1; step *= 2) {
    if (lo.every(v => Math.abs(v) / step <= 32767) && hi.every(v => Math.abs(v) / step <= 32767)) return { origin: [0, 0, 0], step };
  }
  throw new Error('World primitive is too far from its model origin for a 16-bit position grid');
}
/** The node transform that dequantizes a grid's Int16 positions. */
export function tileGridTransform(grid: TileGrid): Matrix4 {
  return new Matrix4().compose(new Vector3(...grid.origin), new Quaternion(), new Vector3(grid.step, grid.step, grid.step));
}

/** RM8.1: a tile primitive's geometry for the wire. Normals become normalized Int8 and colours normalized Uint16
 *  (KHR_mesh_quantization, written by staticGlb's `quantizedChannels`; normals within ~0.5 degree, colours within
 *  1/65535); then every vertex whose channels are all equal is welded into one (uvs and tangents stay exact float32)
 *  under a 16-bit index when the vertices fit, a 32-bit one otherwise. A clipped tile was a triangle soup of three
 *  float32 vertices a triangle. With a `grid`, positions become unnormalized Int16 on it (within half its step),
 *  colours Uint8 (within 1/510), and vertices and triangles are reordered for the vertex cache and for meshopt. */
export function compactTileGeometry(source: BufferGeometry, grid?: TileGrid): BufferGeometry {
  const keys = Object.keys(source.attributes).sort(), index = source.getIndex(), count = index === null ? source.getAttribute('position').count : index.count;
  const colour = grid === undefined ? 65535 : 255;
  const rows = keys.map((key) => {
    const attribute = source.getAttribute(key), width = attribute.itemSize;
    const quantize = key === 'normal' ? (v: number) => Math.max(-127, Math.min(127, Math.round(v * 127)))
      : key === 'color' ? (v: number) => Math.max(0, Math.min(colour, Math.round(v * colour)))
      : key === 'position' && grid !== undefined ? (v: number, c: number) => {
        const q = Math.round((v - (grid.origin[c] ?? 0)) / grid.step);
        if (Math.abs(q) > 32767) throw new Error('World tile position outside its 16-bit grid'); return q;
      } : null;
    return { key, width, quantize, read: (vertex: number, component: number) => attribute.getComponent(vertex, component), out: [] as number[] };
  });
  const seen = new Map<string, number>(), order: number[] = [];
  const heads = new Map<number, number>(), links: number[] = [];
  const sample = new Float64Array(1), words = new Uint32Array(sample.buffer);
  let numeric = rows.every(row => Number.isSafeInteger(row.width) && row.width > 0), next = 0;
  const hashValues = (values: readonly number[]): number | undefined => {
    let hash = 2166136261;
    for (const value of values) {
      if (typeof value !== 'number') return undefined;
      // String keys equate both zeros and every NaN payload.
      if (value === (value | 0)) hash = Math.imul(hash ^ value, 16777619);
      else if (Number.isNaN(value)) { hash = Math.imul(hash, 16777619); hash = Math.imul(hash ^ 0x7ff80000, 16777619); }
      else {
        sample[0] = value === 0 ? 0 : value;
        hash = Math.imul(hash ^ (words[0] ?? 0), 16777619);
        hash = Math.imul(hash ^ (words[1] ?? 0), 16777619);
      }
    }
    hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
    hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
    return (hash ^ (hash >>> 16)) >>> 0;
  };
  const sameValues = (vertex: number, values: readonly number[]): boolean => {
    let offset = 0;
    for (const row of rows) for (let component = 0; component < row.width; component++) {
      const value = values[offset++], previous = row.out[vertex * row.width + component];
      if (value !== previous && !(typeof value === 'number' && typeof previous === 'number' && Number.isNaN(value) && Number.isNaN(previous))) return false;
    }
    return true;
  };
  const useStrings = (): void => {
    numeric = false; heads.clear(); links.length = 0;
    for (let vertex = 0; vertex < next; vertex++) {
      const values = rows.flatMap(row => row.out.slice(vertex * row.width, (vertex + 1) * row.width));
      seen.set(values.join(','), vertex);
    }
  };
  for (let corner = 0; corner < count; corner++) {
    const vertex = index === null ? corner : index.getX(corner), values: number[] = [];
    for (const row of rows) for (let c = 0; c < row.width; c++) { const v = row.read(vertex, c); values.push(row.quantize === null ? v : row.quantize(v, c)); }
    let at: number | undefined, hash = 0, key = '';
    if (numeric) {
      const found = hashValues(values);
      if (found === undefined) useStrings();
      else {
        hash = found;
        let candidate = heads.get(hash), visited = 0;
        while (candidate !== undefined && candidate >= 0) {
          if (sameValues(candidate, values)) { at = candidate; break; }
          // Preserve bounded lookup cost for adversarial buckets via the original map.
          if (++visited >= 16) { useStrings(); break; }
          candidate = links[candidate];
        }
      }
    }
    if (!numeric) { key = values.join(','); at = seen.get(key); }
    if (at === undefined) {
      at = next++;
      if (numeric) { links[at] = heads.get(hash) ?? -1; heads.set(hash, at); }
      else seen.set(key, at);
      let offset = 0;
      for (const row of rows) { row.out.push(...values.slice(offset, offset + row.width)); offset += row.width; }
    }
    order.push(at);
  }
  // with a grid: triangles in vertex-cache order, vertices in first-use order (meshopt's codecs compress both far better)
  const indices = Uint32Array.from(order), remap = grid === undefined ? null : MeshoptEncoder.reorderMesh(indices, true, true)[0];
  const output = new BufferGeometry();
  for (const row of rows) {
    let values = row.out;
    if (remap !== null) {
      const moved = Array.from({ length: values.length }, () => 0), map = remap;
      for (let old = 0; old < next; old++) for (let c = 0; c < row.width; c++) moved[(map[old] ?? 0) * row.width + c] = values[old * row.width + c] ?? 0;
      values = moved;
    }
    output.setAttribute(row.key, row.key === 'normal' ? new BufferAttribute(Int8Array.from(values), row.width, true)
      : row.key === 'color' ? new BufferAttribute(grid === undefined ? Uint16Array.from(values) : Uint8Array.from(values), row.width, true)
      : row.key === 'position' && grid !== undefined ? new BufferAttribute(Int16Array.from(values), row.width)
      : new Float32BufferAttribute(values, row.width));
  }
  output.setIndex(new BufferAttribute(next <= 65535 ? Uint16Array.from(indices) : indices, 1));
  return output;
}

/** Combine same-material primitives into one draw without changing their authored channels. */
export function mergeWorldGeometry(parts: readonly BufferGeometry[]): BufferGeometry {
  const first = parts[0]; if (first === undefined) throw new Error('World merge needs geometry');
  const keys = Object.keys(first.attributes).sort(), output = new BufferGeometry();
  for (const part of parts) if (Object.keys(part.attributes).sort().join('/') !== keys.join('/')) throw new Error('World material primitives have incompatible vertex channels');
  for (const key of keys) {
    const width = first.getAttribute(key).itemSize, values: number[] = [];
    for (const part of parts) {
      const row = part.getAttribute(key); if (row.itemSize !== width) throw new Error('World material vertex channel width differs');
      for (let vertex = 0; vertex < row.count; vertex++) for (let c = 0; c < width; c++) values.push(row.getComponent(vertex, c));
    }
    output.setAttribute(key, new Float32BufferAttribute(values, width));
  }
  return output;
}
