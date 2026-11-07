// oxlint-disable-next-line import/no-nodejs-modules -- Bundle the defining source module without publishing a product.
import { resolve } from 'node:path';
import { Document, WebIO } from '@gltf-transform/core';
import { expect, test } from 'vitest';
import { build } from 'vite';
import { BufferAttribute, BufferGeometry, Matrix4, Vector3 } from 'three';
import { assertConfigBoundary } from '../configBoundary';
import { MapRaster } from './mapRaster';

function floor(height: number): Promise<Uint8Array> {
  const doc = new Document(), buffer = doc.createBuffer();
  const position = doc.createAccessor().setBuffer(buffer).setType('VEC3')
    .setArray(new Float32Array([200, height, 200, 200, height, 150, 150, height, 200]));
  const mesh = doc.createMesh('floor').addPrimitive(doc.createPrimitive().setAttribute('POSITION', position));
  doc.createScene().addChild(doc.createNode('floor').setMesh(mesh));
  return new WebIO().writeBinary(doc);
}

test('owned GLBs need no reader and documents cache by exact input identity', async () => {
  const bytes = await floor(4), raster = new MapRaster(100);
  const doc = await raster.document(bytes);
  expect(await raster.document(bytes) === doc).toBe(true);
  expect(await raster.document(new Uint8Array(bytes)) === doc).toBe(false);
  await raster.glb(bytes);
  expect(raster.triangles).toBe(1);
  expect(raster.height[12 * 100 + 12]).toBe(4 * 65536);
  await expect(raster.document('ungranted.glb')).rejects.toThrow('explicit byte reader');
  await expect(raster.glb(bytes, undefined, () => false)).rejects.toThrow('missing map geometry part');
});

test('retained file identities use only the explicit reader and cache stays per raster', async () => {
  const first = await floor(4), second = await floor(8); let reads = 0;
  const reader = (file: string): Uint8Array => {
    expect(file).toBe('floor.glb'); reads++; return reads === 1 ? first : second;
  };
  const raster = new MapRaster(100, {}, reader), other = new MapRaster(100, {}, reader);
  await raster.glb('floor.glb'); await raster.glb('floor.glb');
  expect(reads).toBe(1); expect(raster.triangles).toBe(2);
  expect(raster.height[12 * 100 + 12]).toBe(4 * 65536);
  await other.glb('floor.glb'); expect(reads).toBe(2);
  expect(other.height[12 * 100 + 12]).toBe(8 * 65536);
  const refused = new MapRaster(100, {}, () => { throw new Error('Unadmitted input'); });
  await expect(refused.glb('ungranted.glb')).rejects.toThrow('Unadmitted input');
});

test('the canonical raster bundles without filesystem, module or compiler services', async () => {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: resolve('src/sharddev/bake/mapRaster.ts'), formats: ['es'] },
    rolldownOptions: { external: [/^node:/u], output: { codeSplitting: false } } } });
  const output = Array.isArray(result) ? result[0] : result;
  if (output === undefined || !('output' in output)) throw new Error('Missing raster author bundle');
  const chunks = output.output.filter(row => row.type === 'chunk'); expect(chunks).toHaveLength(1);
  for (const chunk of chunks) expect(() => assertConfigBoundary([...chunk.imports, ...chunk.dynamicImports])).not.toThrow();
});

test('indexed and direct faces retain complete transformed depth and colour buffers', () => {
  const positions = new Float32Array([-120, 4, -120, 120, 8, 120, 120, 6, -120, -120, 9, -120, 120, 9, -120, 120, 9, 120]);
  for (const indexed of [false, true]) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(positions.length).fill(1), 3));
    if (indexed) geometry.setIndex([2, 1, 0, 5, 4, 3]);
    const matrix = new Matrix4().makeRotationY(.27).setPosition(7, -2, 11);
    const actual = new MapRaster(32, { clipBelow: 0, clipAbove: 20 }), expected = new MapRaster(32, { clipBelow: 0, clipAbove: 20 });
    actual.geometry(geometry, matrix);
    const points = Array.from({ length: 6 }, (_, index) => new Vector3().fromArray(positions, index * 3).applyMatrix4(matrix).toArray());
    const indices = indexed ? [2, 1, 0, 5, 4, 3] : [0, 1, 2, 3, 4, 5];
    for (const offset of [0, 3]) expected.triangle(indices.slice(offset, offset + 3).map(index => {
      const point = points[index]; if (point === undefined) throw new Error('Missing reference point'); return point;
    }), [[255, 255, 255], [255, 255, 255], [255, 255, 255]]);
    expect(actual.triangles).toBe(2);
    expect(actual.height.some(height => height !== -2147483648)).toBe(true);
    expect(actual.height).toEqual(expected.height); expect(actual.colour).toEqual(expected.colour);
    geometry.dispose();
  }
});

test('shared GLB vertices retain winding, coloured edges and clipping after projection', async () => {
  const doc = new Document(), buffer = doc.createBuffer();
  const positions = new Float32Array([-120, 4, -120, 120, 8, 120, 120, 6, -120, -120, 10, 120]);
  const colours = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1]);
  const indices = new Uint16Array([0, 1, 2, 0, 3, 1, 2, 1, 0]);
  const accessor = (array: Float32Array<ArrayBuffer>) => doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(array);
  const primitive = doc.createPrimitive().setAttribute('POSITION', accessor(positions)).setAttribute('COLOR_0', accessor(colours))
    .setIndices(doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(indices));
  doc.createScene().addChild(doc.createNode('shared').setMesh(doc.createMesh().addPrimitive(primitive)));
  const bytes = await new WebIO().writeBinary(doc);
  for (const shift of [-3, 4]) {
    const matrix = new Matrix4().makeRotationY(.37).setPosition(11, shift, -7);
    const actual = new MapRaster(40, { clipBelow: 2, clipAbove: 11 }), expected = new MapRaster(40, { clipBelow: 2, clipAbove: 11 });
    await actual.glb(bytes, matrix);
    const points = Array.from({ length: 4 }, (_, i) => new Vector3().fromArray(positions, i * 3).applyMatrix4(matrix).toArray());
    for (let i = 0; i < indices.length; i += 3) {
      const selected = Array.from(indices.subarray(i, i + 3));
      expected.triangle(selected.map(index => { const point = points[index]; if (point === undefined) throw new Error('Missing reference vertex'); return point; }),
        selected.map(index => Array.from(colours.subarray(index * 3, index * 3 + 3), value => value * 255)));
    }
    expect(actual.triangles).toBe(3);
    expect(actual.colour.some(value => value > 0)).toBe(true);
    expect(actual.height).toEqual(expected.height); expect(actual.colour).toEqual(expected.colour);
  }
});

test('internal pixel-centre bounds match public raster edges and wide-coordinate fallback', () => {
  const boundary = 1048576;
  const cases: number[][] = [
    [511, 511, 513, 511, 512, 513], [510, 510, 511, 510, 510, 511],
    [512, 512, 1536, 512, 512, 1536], [512, 512, 513, 512, 512, 513],
    [-boundary, -boundary, boundary, -boundary, 512, boundary],
    [-boundary - 1, -boundary, boundary, -boundary, 512, boundary + 1],
    [0, 0, 1, 0, boundary, 1], [512, 512, 512, 512, 512, 512],
  ];
  let seed = 357;
  for (let row = 0; row < 256; row++) cases.push(Array.from({ length: 6 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % (boundary * 2 + 3) - boundary - 1;
  }));
  const matrix = new Matrix4(), colours = [[255, 0, 0], [0, 255, 0], [0, 0, 255]];
  for (const coordinates of cases) for (const reverse of [false, true]) {
    const geometry = new BufferGeometry(), size = 8;
    const points = Array.from({ length: 3 }, (_, index) => {
      const x = coordinates[index * 2], z = coordinates[index * 2 + 1];
      if (x === undefined || z === undefined) throw new Error('Missing projected test point');
      return new Vector3(250 - x * 500 / (size * 1024), index === 1 ? -0 : index + .25,
        250 - z * 500 / (size * 1024)).applyMatrix4(matrix).toArray();
    });
    geometry.setAttribute('position', new BufferAttribute(Float64Array.from(points.flat()), 3));
    geometry.setAttribute('color', new BufferAttribute(Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]), 3));
    const order = reverse ? [2, 1, 0] : [0, 1, 2]; geometry.setIndex(order);
    const actual = new MapRaster(size, { clipBelow: -.25, clipAbove: 3 }), expected = new MapRaster(size, { clipBelow: -.25, clipAbove: 3 });
    actual.geometry(geometry, matrix);
    expected.triangle(order.map(index => {
      const point = points[index]; if (point === undefined) throw new Error('Missing reference point'); return point;
    }), order.map(index => {
      const colour = colours[index]; if (colour === undefined) throw new Error('Missing reference colour'); return colour;
    }));
    expect(actual.triangles).toBe(expected.triangles);
    expect(actual.height).toEqual(expected.height); expect(actual.colour).toEqual(expected.colour);
    geometry.dispose();
  }
});
