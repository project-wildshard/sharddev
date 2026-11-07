import { BufferAttribute, BufferGeometry, InterleavedBufferAttribute } from 'three';
import * as platform from '@wildshard/format/geometryPack';

export type PackedGroup = platform.PackedGroup;
export type PackedGeometryRow = platform.PackedGeometryRow;
export type PackedGeometryRows = platform.PackedGeometryRows;
export type PackedGeometryJson = platform.PackedGeometryJson;
/** Authoring geometry projection; isolated bakers never import runtime services. */
export class GeometryPack extends platform.GeometryPackData {
  /** Bind fresh decoded arrays to native geometry without sharing mutable storage. */
  geometry(i: number): BufferGeometry {
    const data = this.read(i), geometry = new BufferGeometry();
    for (const attribute of data.attributes) geometry.setAttribute(attribute.name, new BufferAttribute(attribute.array, attribute.size));
    if (data.index !== null) geometry.setIndex(new BufferAttribute(data.index, 1));
    for (const group of data.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
    return geometry;
  }
}
export const packedRows: typeof platform.packedRows = platform.packedRows;

/**
 * The writer of a pack (build-time): geometries added in order, each attribute's floats then an index, every block padded
 * to 4 bytes. A geometry built without an index stores its distinct vertices once (bit-equal floats in every attribute)
 * and the index that expands them back, in order; one built with an index keeps its own (16 or 32 bit, as built).
 * `GeometryPack` reads the bytes back to the builder's exact arrays.
 */
export class GeometryPackWriter {
  private readonly packed: PackedGeometryRow[] = [];
  private readonly chunks: Uint8Array[] = [];
  private size = 0;
  private readonly label: string;

  /** `label` the error messages' name. */
  constructor(label: string) { this.label = label; }

  /** Append geometry `g` (plain float32 attributes only); returns its index in the pack. */
  add(g: BufferGeometry): number {
    const names = Object.keys(g.attributes), attrs = names.map((name): [string, number] => [name, g.getAttribute(name).itemSize]);
    const count = g.getAttribute(names[0] ?? 'position').count, own = g.getIndex();
    const groups = g.groups.length === 0 ? {} : { groups: g.groups.map((group) => ({ start: group.start, count: group.count, materialIndex: group.materialIndex ?? 0 })) };
    const floats = (name: string): Float32Array => {
      const a = g.getAttribute(name);
      if (a instanceof InterleavedBufferAttribute || !(a.array instanceof Float32Array) || a.normalized) throw new Error(`[${this.label}] ${name}: plain float32 only`);
      return a.array.subarray(0, a.count * a.itemSize);
    };
    if (own !== null) {
      for (const name of names) this.push(new Uint8Array(floats(name).slice().buffer));
      const u32 = own.array instanceof Uint32Array;
      this.push(new Uint8Array((u32 ? Uint32Array.from(own.array) : Uint16Array.from(own.array)).buffer));
      this.packed.push({ attrs, count, unique: count, own: u32 ? 'u32' : 'u16', indexCount: own.count, ...groups });
      return this.packed.length - 1;
    }
    const arrays = names.map(floats), keys = new Map<string, number>(), index = new Uint32Array(count), firsts: number[] = [];
    const bits = new Uint32Array(1), view = new Float32Array(bits.buffer);
    for (let i = 0; i < count; i++) {
      let key = '';
      arrays.forEach((a, k) => { const w = attrs[k]?.[1] ?? 0; for (let c = 0; c < w; c++) { view[0] = a[i * w + c] ?? 0; key += `${String(bits[0])},`; } });
      let at = keys.get(key);
      if (at === undefined) { at = firsts.length; keys.set(key, at); firsts.push(i); }
      index[i] = at;
    }
    arrays.forEach((a, k) => {
      const w = attrs[k]?.[1] ?? 0, out = new Float32Array(firsts.length * w);
      firsts.forEach((i, j) => { for (let c = 0; c < w; c++) out[j * w + c] = a[i * w + c] ?? 0; });
      this.push(new Uint8Array(out.buffer));
    });
    this.push(new Uint8Array((firsts.length < 65536 ? Uint16Array.from(index) : index).buffer));
    this.packed.push({ attrs, count, unique: firsts.length, own: null, indexCount: count, ...groups });
    return this.packed.length - 1;
  }

  /**
   * Append a block of floats (instance matrices, say: anything a page reads back bit for bit, which JSON cannot carry: it
   * drops a `-0`'s sign), `size` floats to an item; returns its index (`GeometryPack.floats`).
   */
  addFloats(values: Float32Array, size: number): number {
    const g = new BufferGeometry(); g.setAttribute('values', new BufferAttribute(values, size));
    return this.add(g);
  }

  /** The pack's rows so far (its byte size and every geometry's row). */
  rows(): PackedGeometryRows { return { bytes: this.size, geometries: this.packed.map((row) => ({ ...row, attrs: row.attrs.map(([name, w]) => [name, w] as const) })) }; }

  /** The pack's bytes so far (uncompressed). */
  bytes(): Uint8Array {
    const out = new Uint8Array(this.size);
    let at = 0;
    for (const c of this.chunks) { out.set(c, at); at += c.length; }
    return out;
  }

  private push(bytes: Uint8Array): void {
    const padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4); padded.set(bytes);
    this.chunks.push(padded); this.size += padded.length;
  }
}

/** Fetch a zlib-deflated bake and inflate it (a failed fetch throws). */
export async function fetchDeflated(url: string): Promise<Uint8Array> {
  // The authoring codec is also imported by isolated Node bakers. Only a runtime
  // fetch needs the engine's presentation-aware decoder.
  const { fetchDeflatedBytes } = await import('@wildshard/engine/core/deflate');
  return fetchDeflatedBytes(url);
}

/** Fetch a zlib bake whose four-byte words are stored in byte lanes, restoring them within the live frame budget. */
export async function fetchLaneBake(url: string): Promise<Uint8Array> {
  const { fetchLaneBytes } = await import('@wildshard/engine/core/deflate');
  return fetchLaneBytes(url);
}
