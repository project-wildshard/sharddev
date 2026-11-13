// The geometry bake codec as the SDK reads it (SHARD-AUTHORING SA12): an offline bake stores each attribute's typed
// array exactly as its builder made it, then the index as int32 deltas, every block 4-byte aligned (SHARD-PLATFORM M3,
// the kit system). `test/sdk-engine-types.test.ts` keeps these types equal to the engine's codec
// (game/plugin/bakedGeometry); `kit/bakedGeometry.test.ts` reads the same geometry from the same bytes as it.
import { BufferAttribute, BufferGeometry, Float16BufferAttribute } from 'three';

/** An attribute's element type in a geometry bake ('f16' is a half float held in a Uint16Array). */
export type BakedType = 'f32' | 'f16' | 'u16' | 'i8' | 'u8';
/** One baked geometry: its attributes [name, type, item size, normalized], vertex count, index kind and count, and whether it has a box. */
export interface BakedGeometryRow {
  readonly attrs: readonly (readonly [string, BakedType, number, boolean])[];
  readonly count: number;
  readonly index: 'u16' | 'u32' | null;
  readonly indexCount: number;
  /** whether the builder computed its bounding box (every one computes its sphere) */
  readonly box: boolean;
}

/** Bytes per element of each baked type. */
export const BAKED_BYTES: Readonly<Record<BakedType, number>> = { f32: 4, f16: 2, u16: 2, i8: 1, u8: 1 };

/** A block's length padded to 4 bytes. */
export function pad4(n: number): number { return Math.ceil(n / 4) * 4; }

/** The bytes a row's blocks take in a bake: each attribute padded to 4 bytes, then the index as int32 deltas. */
export function bakedGeometryBytes(row: BakedGeometryRow): number {
  let n = 0;
  for (const [, type, size] of row.attrs) n += pad4(row.count * size * BAKED_BYTES[type]);
  return n + (row.index === null ? 0 : row.indexCount * 4);
}

/** One attribute block's typed array, copied so the attribute owns it. */
function attribute(bytes: Uint8Array, offset: number, count: number, [, type, size, normalized]: BakedGeometryRow['attrs'][number]): BufferAttribute {
  const buffer = bytes.slice(offset, offset + count * size * BAKED_BYTES[type]).buffer;
  if (type === 'f32') return new BufferAttribute(new Float32Array(buffer), size, normalized);
  if (type === 'f16') return new Float16BufferAttribute(new Uint16Array(buffer), size, normalized);
  if (type === 'u16') return new BufferAttribute(new Uint16Array(buffer), size, normalized);
  if (type === 'i8') return new BufferAttribute(new Int8Array(buffer), size, normalized);
  return new BufferAttribute(new Uint8Array(buffer), size, normalized);
}

/** Reads one baked geometry from the bytes at an offset: its attributes, its index summed back from the deltas, its
 * bounding sphere and (when the row says so) its box. The arrays are copies the geometry owns. */
export function readBakedGeometry(bytes: Uint8Array, offset: number, row: BakedGeometryRow): BufferGeometry {
  const g = new BufferGeometry();
  let at = offset;
  for (const attr of row.attrs) {
    const [name, type, size] = attr;
    g.setAttribute(name, attribute(bytes, at, row.count, attr));
    at += pad4(row.count * size * BAKED_BYTES[type]);
  }
  if (row.index !== null) {
    const deltas = new Int32Array(bytes.slice(at, at + row.indexCount * 4).buffer);
    const index = row.index === 'u16' ? new Uint16Array(row.indexCount) : new Uint32Array(row.indexCount);
    let last = 0;
    for (let i = 0; i < deltas.length; i++) { last += deltas[i] ?? 0; index[i] = last; }
    g.setIndex(new BufferAttribute(index, 1));
  }
  g.computeBoundingSphere();
  if (row.box) g.computeBoundingBox();
  return g;
}
