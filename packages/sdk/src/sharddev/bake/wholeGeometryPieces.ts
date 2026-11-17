// SDK-SPLIT SP8a: the sdk's own copy of the engine's whole-piece decode (engine `game/shardfile/wholeGeometryPieces` and
// `models/nativeGeometry`'s `admitNativeWholeGeometry`), so `bake/slabs` reaches no engine module. The run lists and the
// channel schema are format's (SP4e); the GLB node decode stays three code. The engine is the oracle until SP14
// (`whole-geometry-pieces-port.test.ts`).
import { BufferAttribute, BufferGeometry, Float16BufferAttribute, InstancedMesh, InterleavedBufferAttribute, Matrix4, type Mesh, type TypedArray } from 'three';
import * as v from 'valibot';
import { NativeAttributesSchema } from '@wildshard/format/nativeGeometryChannels';
import { readWholePartition, type WholeGeometryPiece as FormatWholePiece } from '@wildshard/format/wholePartition';

/** A decoded whole piece over three's geometry and matrix. */
export type WholeGeometryPiece = FormatWholePiece<BufferGeometry, Matrix4>;
const semantics: Readonly<Record<string, string>> = { POSITION: 'position', NORMAL: 'normal', COLOR_0: 'color', TEXCOORD_0: 'uv', TANGENT: 'tangent' };

/** A padded channel reads back interleaved; its stored values are copied out unchanged into a plain attribute. */
function plain(attribute: unknown): unknown {
  if (!(attribute instanceof InterleavedBufferAttribute)) return attribute;
  const data = attribute.data, source: TypedArray = data.array, out = new (source.constructor as new (length: number) => TypedArray)(attribute.count * attribute.itemSize);
  const size = attribute.itemSize, stride = data.stride;
  if (stride === size && attribute.offset === 0 && !(source instanceof Float32Array) && !(source instanceof Float64Array)) out.set(source);
  else if (size >= 1 && size <= 4 && Number.isInteger(size)) {
    let target = 0, at = attribute.offset;
    for (let i = 0; i < attribute.count; i++, at += stride) {
      out[target++] = source[at] ?? 0;
      if (size > 1) out[target++] = source[at + 1] ?? 0;
      if (size > 2) out[target++] = source[at + 2] ?? 0;
      if (size > 3) out[target++] = source[at + 3] ?? 0;
    }
  } else for (let i = 0; i < attribute.count; i++) for (let c = 0; c < size; c++) out[i * size + c] = source[i * stride + attribute.offset + c] ?? 0;
  return new BufferAttribute(out, attribute.itemSize, attribute.normalized);
}

/** One admission and restoration of a node's original typed channels, with the detached channel snapshot. */
function admitNativeWholeGeometry(node: Mesh): { readonly geometry: BufferGeometry; readonly channels: v.InferOutput<typeof NativeAttributesSchema> } {
  const metadata: unknown = node.userData['nativeAttributes'], input: unknown = node.geometry;
  if (!(input instanceof BufferGeometry)) throw new Error('Whole shape needs geometry');
  const channels = v.parse(NativeAttributesSchema, metadata), result = new BufferGeometry();
  for (const [name, row] of Object.entries(channels)) {
    const channel = semantics[row.semantic] ?? row.semantic.toLowerCase();
    const attribute: unknown = plain(input.getAttribute(channel));
    if (!(attribute instanceof BufferAttribute) || attribute.itemSize !== row.itemSize || attribute.normalized !== row.normalized) throw new Error(`Whole shape missing typed channel ${channel}`);
    if (row.storage === 'Float16Array') {
      if (!(attribute.array instanceof Uint16Array)) throw new Error('Whole half-float channel needs uint16 bits');
      result.setAttribute(name, new Float16BufferAttribute(attribute.array, row.itemSize, row.normalized));
    } else {
      if (attribute.array.constructor.name !== row.storage) throw new Error('Whole channel storage mismatch');
      result.setAttribute(name, attribute.clone());
    }
  }
  const index = input.getIndex();
  result.setIndex(index?.clone() ?? null);
  return { geometry: result, channels };
}

/** Decode independent render pieces. Every local channel, source ordinal and original matrix is checked. */
export function wholeGeometryPieces(nodes: readonly Mesh[]): WholeGeometryPiece[] {
  const result: WholeGeometryPiece[] = [], seen = new Map<string, Set<number>>();
  try {
    for (const node of nodes) {
      const row = readWholePartition(node.userData['wholePartition']);
      const instances: unknown = node.userData['instances64'];
      const pose: unknown = node.userData['matrix64'] ?? (node instanceof InstancedMesh && node.count === 1 && Array.isArray(instances) && instances.length === 1 ? instances[0] : undefined);
      const values = v.parse(v.pipe(v.array(v.pipe(v.number(), v.finite())), v.length(16)), pose);
      const { geometry, channels } = admitNativeWholeGeometry(node);
      try {
        if (geometry.groups.length > 0 || Object.keys(geometry.morphAttributes).length > 0) throw new Error('Whole piece needs one plain draw');
        for (const [name, channel] of Object.entries(channels)) {
          const attribute = geometry.getAttribute(name);
          if (attribute === undefined || attribute.count !== row.vertices.length || attribute.itemSize !== channel.itemSize) throw new Error('Whole piece channel layout differs');
        }
        if (new Set(row.vertices).size !== row.vertices.length || row.vertices.some(vertex => vertex >= row.vertexCount)) throw new Error('Whole vertex ordinal outside source');
        if ((row.index === 'none' ? row.vertexCount : row.indexCount) % 3 !== 0) throw new Error('Whole source topology differs');
        const index = geometry.index, count = index?.count ?? geometry.getAttribute('position').count;
        if (count !== row.triangles.length * 3) throw new Error('Whole piece triangle count differs');
        const triangles = seen.get(row.id) ?? new Set<number>(); seen.set(row.id, triangles);
        for (let local = 0; local < count; local++) {
          const at = index === null ? local : index.getX(local), vertex = row.vertices[at];
          if (!Number.isInteger(at) || vertex === undefined) throw new Error('Whole missing triangle vertex');
          if (row.index === 'none' && vertex !== (row.triangles[Math.floor(local / 3)] ?? -1) * 3 + local % 3) throw new Error('Whole non-indexed topology differs');
        }
        for (const triangle of row.triangles) {
          if (triangle >= (row.index === 'none' ? row.vertexCount : row.indexCount) / 3 || triangles.has(triangle)) throw new Error('Whole duplicate or invalid triangle');
          triangles.add(triangle);
        }
        if (row.grid !== undefined) {
          const position = geometry.getAttribute('position'), source = position instanceof InterleavedBufferAttribute ? position.data.array : position.array;
          if (!(source instanceof Int16Array) || position.normalized || position.itemSize !== 3) throw new Error('Whole grid needs Int16 positions');
          const restored = new Float32Array(position.count * 3), origin = row.grid.origin;
          for (let i = 0; i < position.count; i++) for (let axis = 0; axis < 3; axis++) {
            const at = position instanceof InterleavedBufferAttribute ? i * position.data.stride + position.offset + axis : i * 3 + axis;
            restored[i * 3 + axis] = Math.fround((source[at] ?? 0) * row.grid.step + (origin[axis] ?? 0));
          }
          geometry.setAttribute('position', new BufferAttribute(restored, 3));
        }
        result.push({ part: row.id, geometry, matrix: new Matrix4().fromArray(values), vertices: row.vertices, triangles: row.triangles,
          vertexCount: row.vertexCount, indexCount: row.indexCount, layout: JSON.stringify(channels) });
      } catch (error) { geometry.dispose(); throw error; }
    }
    return result;
  } catch (error) { for (const piece of result) piece.geometry.dispose(); throw error; }
}
