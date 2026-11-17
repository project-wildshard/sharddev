// oxlint-disable-next-line import/no-nodejs-modules -- Compare raw source geometry with the retained native codec boundary.
import { inflateSync } from 'node:zlib';
// oxlint-disable-next-line import/no-nodejs-modules -- Bundle the defining build-only module without invoking any publisher.
import { resolve } from 'node:path';
import { BufferGeometry, Float32BufferAttribute, Group, Matrix4, Mesh, MeshStandardMaterial } from 'three';
import { expect, test } from 'vitest';
import { build } from 'vite';
import { WebIO } from '@gltf-transform/core';
import { MapAssembly, mapModelBytes } from '../src/sharddev/bake/mapAssembly';
import { clientSceneGlb } from '../src/sharddev/bake/glb';
import { MapAssembly as PublishedMapAssembly } from '../scripts/map-geometry.mjs';
import { assertConfigBoundary } from '../src/sharddev/configBoundary';

test('raw map packing retains native scene bytes, placements and independent buffer ownership', () => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 4, 0, 0, 4, 20, 20, 4, 0], 3));
  geometry.setAttribute('color', new Float32BufferAttribute([.2, .3, .4, .5, .6, .7, .8, .9, 1], 3));
  geometry.setIndex([0, 1, 2]);
  const raw = new MapAssembly(), retained = new PublishedMapAssembly();
  try {
    const poses = [new Matrix4().makeTranslation(1 / 3, 2 / 3, -1 / 7), new Matrix4().makeTranslation(3, 4, 5)];
    for (const assembly of [raw, retained]) { assembly.add('floor', geometry, poses); assembly.add('floor', geometry); assembly.add('empty', geometry, []); }
    const direct = raw.pack(), original = retained.encode();
    expect(direct.json).toEqual(original.json);
    expect(direct.binary).toEqual(new Uint8Array(inflateSync(original.binary)));
    expect(raw.inventory).toEqual({ floor: 3 });
    expect(raw.nodes[0]?.matrices).toEqual(poses.flatMap(pose => Array.from(Float32Array.from(pose.elements))));
    const repeated = raw.pack();
    expect(direct.json === repeated.json).toBe(false); expect(direct.binary === repeated.binary).toBe(false);
    direct.json.fill(0); direct.binary.fill(0);
    expect(raw.pack()).toEqual(repeated);
    expect(geometry.getAttribute('position').getY(0)).toBe(4);
  } finally {
    for (const assembly of [raw, retained]) for (const shape of assembly.shapes) shape.material.dispose();
    geometry.dispose();
  }
});

test('owned model bytes preserve selectors, local geometry and explicit world transforms', async () => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 4, 0, 0, 4, 20, 20, 4, 0], 3)); geometry.setIndex([0, 1, 2]);
  const material = new MeshStandardMaterial(), root = new Group(); root.name = 'root'; root.position.set(3, 4, 5);
  const first = new Mesh(geometry, material), second = new Mesh(geometry, material);
  first.name = 'first'; second.name = 'second';
  first.position.set(2, 0, 0); second.position.set(0, 6, 0); root.add(first, second); root.updateMatrixWorld(true);
  const made: BufferGeometry[] = [];
  try {
    const { glb } = clientSceneGlb(root, new Map([[material, 'plain']]));
    // The rest exporter stores poses in its separate scene. Give this raw GLB
    // an explicit native node transform to exercise the world-space selector.
    const io = new WebIO(), document = await io.readBinary(glb);
    const selected = document.getRoot().listNodes().filter(node => node.getMesh() !== null)[1];
    if (selected === undefined) throw new Error('Missing fixture mesh');
    selected.setTranslation([3, 10, 5]);
    const transformed = await io.writeBinary(document);
    const local = await mapModelBytes(transformed, 1), world = await mapModelBytes(transformed, 1, true);
    const expected = geometry.clone().applyMatrix4(second.matrixWorld); made.push(local, world, expected);
    expect(local.getAttribute('position').array).toEqual(geometry.getAttribute('position').array);
    expect(local.getIndex()?.array).toEqual(geometry.getIndex()?.array);
    expect(world.getAttribute('position').array).toEqual(expected.getAttribute('position').array);
    await expect(mapModelBytes(glb, 2)).rejects.toThrow('needs one primitive');
    await expect(mapModelBytes(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  } finally { for (const item of made) item.dispose(); geometry.dispose(); material.dispose(); }
});

test('owned GLBs cannot acquire undeclared external buffer resources', async () => {
  const json = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' }, buffers: [{ byteLength: 36, uri: 'ungranted.bin' }] }));
  const bytes = new Uint8Array(20 + Math.ceil(json.length / 4) * 4).fill(32), header = new DataView(bytes.buffer);
  header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, bytes.length, true);
  header.setUint32(12, bytes.length - 20, true); header.setUint32(16, 0x4e4f534a, true); bytes.set(json, 20);
  await expect(mapModelBytes(bytes)).rejects.toThrow('Cannot resolve external buffers');
});

test('the actual map assembly packer bundles without filesystem, module or compiler services', async () => {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: resolve('src/sharddev/bake/mapAssembly.ts'), formats: ['es'] },
    rolldownOptions: { external: [/^node:/u, 'assemblyscript/dist/asc.js'], output: { codeSplitting: false } } } });
  const output = Array.isArray(result) ? result[0] : result;
  if (output === undefined || !('output' in output)) throw new Error('Missing map assembly bundle');
  const chunks = output.output.filter(row => row.type === 'chunk'); expect(chunks).toHaveLength(1);
  for (const chunk of chunks) assertConfigBoundary([...chunk.imports, ...chunk.dynamicImports]);
});
