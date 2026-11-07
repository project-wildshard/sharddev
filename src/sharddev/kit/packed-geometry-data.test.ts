import { expect, test } from 'vitest';
import { BufferAttribute, BufferGeometry } from 'three';
import { GeometryPackData, packedRows } from '@wildshard/format/geometryPack';
import { GeometryPack as NativeGeometryPack } from '@wildshard/engine/models/geometryPack';
import { GeometryPack, GeometryPackWriter } from './geometryPack';

test.each(['expanded', 'u16', 'u32'] as const)('packed %s arrays preserve bits, indices, groups and independent loans', mode => {
  const geometry = new BufferGeometry(), positions = mode === 'expanded'
    ? [-0, 0, 0, 1, 0, 0, 0, 1, 0, -0, 0, 0, 0, 1, 0, -1, 0, 0]
    : [-0, 0, 0, 1, 0, 0, 0, 1, 0, -1, 0, 0];
  geometry.setAttribute('position', new BufferAttribute(Float32Array.from(positions), 3));
  if (mode !== 'expanded') geometry.setIndex(new BufferAttribute(mode === 'u16' ? new Uint16Array([0, 1, 2, 0, 2, 3]) : new Uint32Array([0, 1, 2, 0, 2, 3]), 1));
  geometry.addGroup(0, 3, 0); geometry.addGroup(3, 3, 1);
  const writer = new GeometryPackWriter('independent-fixture'), index = writer.add(geometry);
  const floats = writer.addFloats(new Float32Array([-0, 1, 2, -0]), 2), bytes = writer.bytes(), rows = packedRows(writer.rows());
  const data = new GeometryPackData(bytes, rows, 'pure-fixture');
  const decoded = data.read(index), position = decoded.attributes.find(row => row.name === 'position');
  if (position === undefined) throw new Error('Missing decoded positions');
  expect(Array.from(position.array)).toEqual(positions); expect(Object.is(position.array[0], -0)).toBe(true);
  position.array[0] = 99;
  expect(Object.is(data.read(index).attributes[0]?.array[0], -0)).toBe(true);
  for (const Reader of [GeometryPack, NativeGeometryPack]) {
    const pack = new Reader(bytes, rows, 'adapter-fixture'), copy = pack.geometry(index);
    try {
      const attribute = copy.getAttribute('position'); if (!(attribute instanceof BufferAttribute)) throw new Error('Missing native positions');
      expect(Array.from(attribute.array)).toEqual(positions); expect(Object.is(attribute.array[0], -0)).toBe(true);
      expect(copy.groups).toEqual(geometry.groups); expect(copy.getIndex()?.array).toEqual(geometry.getIndex()?.array);
      const block = pack.floats(floats); expect(Array.from(block)).toEqual([-0, 1, 2, -0]);
      block[0] = 10; expect(Object.is(pack.floats(floats)[0], -0)).toBe(true);
    } finally { copy.dispose(); }
  }
  expect(() => data.read(99)).toThrow('no baked geometry');
  expect(() => new GeometryPackData(new Uint8Array(0), rows, 'bad-fixture')).toThrow('the bake holds');
  geometry.dispose();
});
