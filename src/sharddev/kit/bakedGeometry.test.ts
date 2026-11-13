// SHARD-AUTHORING SA12: the SDK's bake reader is its own; it reads the same geometry from the same bytes as the engine's.
import { expect, test } from 'vitest';
import * as engine from '@wildshard/engine/game/plugin/bakedGeometry';
import type { BufferGeometry } from 'three';
import { BAKED_BYTES, bakedGeometryBytes, pad4, readBakedGeometry, type BakedGeometryRow } from './bakedGeometry';

/** A bake of `row` at `offset`: each attribute's values in its type, padded to 4 bytes, then the index as int32 deltas. */
function bake(row: BakedGeometryRow, offset: number, values: Record<string, readonly number[]>, index: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(offset + bakedGeometryBytes(row) + 8);
  let at = offset;
  for (const [name, type] of row.attrs) {
    const data = values[name] ?? [];
    const view = type === 'f32' ? new Float32Array(data) : type === 'i8' ? new Int8Array(data) : type === 'u8' ? new Uint8Array(data) : new Uint16Array(data);
    bytes.set(new Uint8Array(view.buffer), at); at += pad4(view.byteLength);
  }
  let last = 0;
  const deltas = new Int32Array(index.map(i => { const d = i - last; last = i; return d; }));
  bytes.set(new Uint8Array(deltas.buffer), at);
  return bytes;
}

function shape(g: BufferGeometry): unknown {
  return {
    attributes: Object.fromEntries(Object.entries(g.attributes).map(([name, a]) => [name, { kind: a.constructor.name, type: a.array.constructor.name, size: a.itemSize, normalized: a.normalized, array: [...a.array] }])),
    index: g.index === null ? null : { type: g.index.array.constructor.name, array: [...g.index.array] },
    sphere: g.boundingSphere === null ? null : [g.boundingSphere.center.toArray(), g.boundingSphere.radius],
    box: g.boundingBox === null ? null : [g.boundingBox.min.toArray(), g.boundingBox.max.toArray()],
  };
}

const position = [0, 0, 0, 2, 0, 0, 0, 3, -1, 1.5, 2, 4];
const rows: readonly [BakedGeometryRow, Record<string, readonly number[]>, readonly number[]][] = [
  [{ attrs: [['position', 'f32', 3, false], ['color', 'u8', 3, true], ['normal', 'i8', 3, true], ['uv', 'f16', 2, false]], count: 4, index: 'u16', indexCount: 6, box: true },
    { position, color: [255, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], normal: [0, 127, 0, -127, 0, 0, 0, 0, 127, 1, 2, 3], uv: [0x3c00, 0, 0x3800, 0x3c00, 0, 0x3800, 0x3c00, 0x3c00] }, [0, 1, 2, 2, 3, 0]],
  [{ attrs: [['position', 'f32', 3, false], ['wear', 'u16', 1, true]], count: 4, index: 'u32', indexCount: 3, box: false }, { position, wear: [1, 2, 3, 65535] }, [3, 1, 0]],
  [{ attrs: [['position', 'f32', 3, false]], count: 4, index: null, indexCount: 0, box: false }, { position }, []],
  // Positions that are not packed f32 take three's accessor path in the engine's bounds scan: same bounds.
  [{ attrs: [['position', 'i8', 3, true]], count: 4, index: null, indexCount: 0, box: true }, { position: [0, 0, 0, 127, -64, 3, -127, 90, 12, 5, 5, -5] }, []],
  [{ attrs: [['position', 'f16', 3, false]], count: 2, index: 'u16', indexCount: 2, box: true }, { position: [0x3c00, 0, 0xbc00, 0x4000, 0x3800, 0] }, [1, 0]],
];

test('the SDK codec sizes and reads a bake exactly as the engine does', () => {
  expect(BAKED_BYTES).toEqual(engine.BAKED_BYTES);
  for (const n of [0, 1, 3, 4, 5, 13]) expect(pad4(n)).toBe(engine.pad4(n));
  for (const [row, values, index] of rows) {
    expect(bakedGeometryBytes(row)).toBe(engine.bakedGeometryBytes(row));
    const bytes = bake(row, 12, values, index);
    const ours = readBakedGeometry(bytes, 12, row);
    expect(shape(ours)).toEqual(shape(engine.readBakedGeometry(bytes, 12, row)));
    expect((ours.boundingBox !== null)).toBe(row.box);
  }
  const [row, values, index] = rows[0] ?? [];
  if (row === undefined || values === undefined || index === undefined) throw new Error('no first row');
  expect([...readBakedGeometry(bake(row, 0, values, index), 0, row).getAttribute('position').array]).toEqual(position);
});
