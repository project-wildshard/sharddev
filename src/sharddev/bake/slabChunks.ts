import { BufferAttribute, BufferGeometry, Float16BufferAttribute, type Matrix4, Vector3, type TypedArrayConstructor } from 'three';

/** Private build evidence: ordinals address the joined oracle, not a new runtime protocol. */
export interface SlabGeometryChunk {
  geometry: BufferGeometry; triangles: number[]; bytes: number;
  worldHeight: number; maxTriangleHeight: number;
}
interface Triangle { ordinal: number; corners: [number, number, number]; minY: number; maxY: number }
interface Bucket { quadrant: number; band: number; triangles: Triangle[]; minY: number; maxY: number }

/** Upload bytes of exactly the final native geometry, including the index width. */
export function slabGeometryBytes(geometry: BufferGeometry): number {
  let bytes = geometry.index?.array.byteLength ?? 0;
  for (const attribute of Object.values(geometry.attributes)) {
    if (!(attribute instanceof BufferAttribute)) throw new Error('Slab geometry needs plain native channels');
    bytes += attribute.array.byteLength;
  }
  return bytes;
}

/** Compare the same raw bits in native words when both owned views align.
 * Shared, empty and unaligned views retain the original byte read order. */
function verifySlabChannelCopy(before: Uint8Array, after: Uint8Array, selected: readonly number[], bytes: number): void {
  if (bytes > 0 && bytes % 4 === 0 && selected.length > 0
    && before.buffer instanceof ArrayBuffer && after.buffer instanceof ArrayBuffer
    && before.byteLength > 0 && after.byteLength > 0
    && before.byteOffset % 4 === 0 && after.byteOffset % 4 === 0
    && before.byteLength % 4 === 0 && after.byteLength % 4 === 0) {
    const input = new Uint32Array(before.buffer, before.byteOffset, before.byteLength / 4);
    const output = new Uint32Array(after.buffer, after.byteOffset, after.byteLength / 4);
    const words = bytes / 4;
    selected.forEach((vertex, at) => { for (let word = 0; word < words; word++)
      if (input[vertex * words + word] !== output[at * words + word]) throw new Error('Slab channel copy differs'); });
    return;
  }
  selected.forEach((vertex, at) => { for (let byte = 0; byte < bytes; byte++)
    if (before[vertex * bytes + byte] !== after[at * bytes + byte]) throw new Error('Slab channel copy differs'); });
}

function subset(source: BufferGeometry, selected: readonly number[], indices: readonly number[]): BufferGeometry {
  const output = new BufferGeometry();
  try {
    for (const [name, attribute] of Object.entries(source.attributes)) {
      if (!(attribute instanceof BufferAttribute)) throw new Error('Slab geometry needs plain native channels');
      const Storage = attribute.array.constructor as TypedArrayConstructor;
      const values = new Storage(selected.length * attribute.itemSize), width = attribute.itemSize;
      selected.forEach((vertex, at) => values.set(attribute.array.subarray(vertex * width, (vertex + 1) * width), at * width));
      const copied = attribute instanceof Float16BufferAttribute && values instanceof Uint16Array
        ? new Float16BufferAttribute(values, width, attribute.normalized) : new BufferAttribute(values, width, attribute.normalized);
      copied.gpuType = attribute.gpuType;
      // Check raw storage, including signed zero and raw half-float words. This is independent of numeric getters.
      const before = new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength);
      const after = new Uint8Array(copied.array.buffer, copied.array.byteOffset, copied.array.byteLength);
      const bytes = attribute.itemSize * attribute.array.BYTES_PER_ELEMENT;
      verifySlabChannelCopy(before, after, selected, bytes);
      output.setAttribute(name, copied);
    }
    output.setIndex(new BufferAttribute(selected.length > 65535 ? Uint32Array.from(indices) : Uint16Array.from(indices), 1));
    return output;
  } catch (error) { output.dispose(); throw error; }
}

/** Keep one chunk per tile/key while it fits; split oversized content by quadrant, then height and bytes.
 * A resident cell packs in source order across tiles, splitting only at the byte cap.
 * A tall original triangle is never split.
 * Displacements and normals have already passed through the original whole-piece join's exact transform order. */
export function partitionSlabGeometry(source: BufferGeometry, tile: number, world: Matrix4, maximumBytes = 4_000_000, residentCell = false): SlabGeometryChunk[] {
  if (!Number.isInteger(tile) || tile < 0 || tile > 63 || !Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 4_000_000
    || world.elements.some(value => !Number.isFinite(value))) throw new Error('Invalid slab partition budget or tile');
  const position = source.getAttribute('position'), index = source.index;
  if (!(position instanceof BufferAttribute) || position.itemSize !== 3 || position.normalized || !(position.array instanceof Float32Array)
    || Object.keys(source.morphAttributes).length > 0 || source.groups.length > 0) throw new Error('Slab needs rigid float32 positions');
  const count = index?.count ?? position.count;
  if (count % 3 !== 0) throw new Error('Slab needs complete triangles');
  let stride = 0;
  for (const attribute of Object.values(source.attributes)) {
    if (!(attribute instanceof BufferAttribute) || attribute.count !== position.count) throw new Error('Slab channel layout differs');
    stride += attribute.itemSize * attribute.array.BYTES_PER_ELEMENT;
  }
  const x0 = -250 + tile % 8 * 62.5, z0 = -250 + Math.floor(tile / 8) * 62.5;
  const buckets = new Map<string, Bucket>(), point = new Vector3();
  for (let offset = 0; offset < count; offset += 3) {
    const a = index?.getX(offset) ?? offset, b = index?.getX(offset + 1) ?? offset + 1, c = index?.getX(offset + 2) ?? offset + 2;
    if (![a, b, c].every(vertex => Number.isInteger(vertex) && vertex >= 0 && vertex < position.count)) throw new Error('Slab index outside source');
    let x = 0, z = 0, y = 0, minY = Infinity, maxY = -Infinity;
    for (const vertex of [a, b, c]) {
      point.fromBufferAttribute(position, vertex).applyMatrix4(world);
      if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error('Slab position is not finite');
      x += point.x / 3; y += point.y / 3; z += point.z / 3; minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
    }
    const quadrant = (z >= z0 + 31.25 ? 2 : 0) + (x >= x0 + 31.25 ? 1 : 0), band = Math.floor(y / 62.5), key = `${quadrant}:${band}`;
    const bucket = buckets.get(key) ?? { quadrant, band, triangles: [], minY: Infinity, maxY: -Infinity };
    bucket.triangles.push({ ordinal: offset / 3, corners: [a, b, c], minY, maxY });
    bucket.minY = Math.min(bucket.minY, minY); bucket.maxY = Math.max(bucket.maxY, maxY); buckets.set(key, bucket);
  }
  const byteCost = (triangles: readonly Triangle[]): number => {
    const vertices = new Set<number>(); for (const triangle of triangles) for (const vertex of triangle.corners) vertices.add(vertex);
    return vertices.size * stride + triangles.length * 3 * (vertices.size > 65535 ? 4 : 2);
  };
  const bands = [...buckets.values()].sort((a, b) => a.quadrant - b.quadrant || a.band - b.band), all = bands.flatMap(bucket => bucket.triangles).sort((a, b) => a.ordinal - b.ordinal);
  const combined = (triangles: Triangle[], quadrant: number): Bucket => ({ quadrant, band: 0, triangles,
    minY: triangles.reduce((value, triangle) => Math.min(value, triangle.minY), Infinity), maxY: triangles.reduce((value, triangle) => Math.max(value, triangle.maxY), -Infinity) });
  const groups: Bucket[] = [];
  if (residentCell || byteCost(all) <= maximumBytes) groups.push(combined(all, 0));
  else for (const quadrant of [0, 1, 2, 3]) {
    const rows = bands.filter(bucket => bucket.quadrant === quadrant), triangles = rows.flatMap(bucket => bucket.triangles).sort((a, b) => a.ordinal - b.ordinal);
    if (triangles.length === 0) continue;
    if (byteCost(triangles) <= maximumBytes) { groups.push(combined(triangles, quadrant)); continue; }
    // Height is a split axis for oversized content, never a reason to create many tiny draws.
    let previous: Bucket | undefined;
    for (const bucket of rows) {
      if (previous !== undefined && byteCost([...previous.triangles, ...bucket.triangles]) <= maximumBytes) {
        for (const triangle of bucket.triangles) previous.triangles.push(triangle);
        previous.minY = Math.min(previous.minY, bucket.minY); previous.maxY = Math.max(previous.maxY, bucket.maxY);
      } else { groups.push(bucket); previous = bucket; }
    }
  }
  const chunks: SlabGeometryChunk[] = [], covered = new Uint8Array(count / 3);
  try {
    for (const group of groups) {
      let vertices: number[] = [], corners: number[] = [], triangles: number[] = [], remap = new Map<number, number>();
      let minY = Infinity, maxY = -Infinity, maxTriangleHeight = 0;
      const flush = (): void => {
        if (triangles.length === 0) return;
        const geometry = subset(source, vertices, corners), bytes = slabGeometryBytes(geometry);
        if (bytes > maximumBytes) { geometry.dispose(); throw new Error('Slab upload exceeds budget'); }
        for (const triangle of triangles) { if (covered[triangle] !== 0) { geometry.dispose(); throw new Error('Slab triangle appears twice'); } covered[triangle] = 1; }
        geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        chunks.push({ geometry, triangles, bytes, worldHeight: maxY - minY, maxTriangleHeight });
        vertices = []; corners = []; triangles = []; remap = new Map(); minY = Infinity; maxY = -Infinity; maxTriangleHeight = 0;
      };
      for (const triangle of group.triangles) {
        const added = new Set(triangle.corners.filter(vertex => !remap.has(vertex))).size, vertexCount = vertices.length + added;
        const bytes = vertexCount * stride + (corners.length + 3) * (vertexCount > 65535 ? 4 : 2);
        if (triangles.length > 0 && bytes > maximumBytes) flush();
        for (const vertex of triangle.corners) {
          let local = remap.get(vertex);
          if (local === undefined) { local = vertices.length; vertices.push(vertex); remap.set(vertex, local); }
          corners.push(local);
        }
        triangles.push(triangle.ordinal); minY = Math.min(minY, triangle.minY); maxY = Math.max(maxY, triangle.maxY);
        maxTriangleHeight = Math.max(maxTriangleHeight, triangle.maxY - triangle.minY);
      }
      flush();
    }
    if (covered.some(value => value !== 1)) throw new Error('Slab partition omits a source triangle');
    return chunks;
  } catch (error) { for (const chunk of chunks) chunk.geometry.dispose(); throw error; }
}
