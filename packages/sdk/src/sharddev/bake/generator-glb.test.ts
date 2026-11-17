import { expect, test } from 'vitest';
import { WebIO } from '@gltf-transform/core';
import { meshoptGlb } from './glbCompression';
import { newGlbDocument, readGlb, writeGlb } from './generatorGlb';

const POSITIONS = [0, 0, 0, 1, 0, 0, 0, 1, 0.5];

function triangle() {
  const doc = newGlbDocument(), buffer = doc.createBuffer();
  const position = doc.createAccessor().setType('VEC3').setArray(new Float32Array(POSITIONS)).setBuffer(buffer);
  const primitive = doc.createPrimitive().setAttribute('POSITION', position)
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array([0, 1, 2])).setBuffer(buffer));
  doc.createScene('plot').addChild(doc.createNode('tri').setMesh(doc.createMesh('tri').addPrimitive(primitive)));
  return doc;
}

test('writeGlb writes the document as gltf-transform writes it, untouched', async () => {
  expect(await writeGlb(triangle())).toEqual(await new WebIO().writeBinary(triangle()));
});

test('readGlb reads a meshopt-compressed GLB back to its positions', async () => {
  const packed = await meshoptGlb(await writeGlb(triangle()));
  const doc = await readGlb(packed), [node] = doc.getRoot().listNodes();
  const position = node?.getMesh()?.listPrimitives()[0]?.getAttribute('POSITION');
  expect(node?.getName()).toBe('tri');
  expect([...position?.getArray() ?? []]).toEqual(POSITIONS);
});
