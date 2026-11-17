// oxlint-disable-next-line import/no-nodejs-modules -- Measure the build-only download encoding in the author intake fixture.
import { gzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- Author-source admission needs real filesystem/symlink refusal coverage.
import { mkdirSync, mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The fixture owns a bounded temporary project directory.
import { resolve } from 'node:path';
import { nameBlob, emitNamedBlobs, readNamedBlob } from './blobs';
import { nameBlobBytes } from './blobBytes';
import { hashImmutableBytes } from './immutable';
import { compileGltfSource } from './bake/gltfSource';
import { parseGlb } from './assets';
import { NodeIO } from '@gltf-transform/core';

const wasm = new Uint8Array([1, 2, 3]);
const position = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
const indices = new Uint16Array([0, 1, 2]);
const gltf = (uri = 'geometry.bin') => ({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  buffers: [{ byteLength: position.byteLength, uri }, { byteLength: indices.byteLength, uri: 'data:application/octet-stream;base64,AAABAAIA' }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: position.byteLength }, { buffer: 1, byteOffset: 0, byteLength: indices.byteLength }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }, { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' }] });
const jsonBytes = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

test('declared named JSON schemas survive admission and reject malformed values', () => {
  const jsonSchema = { $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', properties: { n: { type: 'number' } }, required: ['n'], additionalProperties: false };
  const blob = nameBlob('data/checked.json', 'json', jsonBytes({ n: 1 }), { jsonSchema });
  expect(emitNamedBlobs([blob]).files[0]?.jsonSchema).toEqual(jsonSchema);
  expect(() => nameBlob('data/bad.json', 'json', jsonBytes({ n: 'bad' }), { jsonSchema })).toThrow('refuses its schema');
  expect(() => nameBlob('data/bad.json', 'json', jsonBytes({}), { jsonSchema })).toThrow('refuses its schema');
  expect(() => nameBlob('data/raw.bin', 'bin', new Uint8Array([1]), { jsonSchema })).toThrow('JSON schema requires');
  expect(() => nameBlobBytes('data/unchecked.json', 'json', jsonBytes({ n: 'bad' }), { jsonSchema })).toThrow('requires its validator');
});

test('named blobs derive hash paths/costs, own their bytes and refuse ambiguous or changed entries', () => {
  const source = Uint8Array.from(wasm), blob = nameBlob('behaviour/director.bin', 'bin', source, { critical: true });
  expect(nameBlobBytes('behaviour/director.bin', 'bin', source, { critical: true })).toEqual(blob);
  source.fill(255);
  expect(blob.bytes).toEqual(wasm);
  expect(blob.file).toMatchObject({ name: 'behaviour/director.bin', path: `blobs/bin/${hashImmutableBytes(wasm)}.bin`, critical: true });
  const emitted = emitNamedBlobs([blob]);
  expect(emitted.assets.get(blob.file.hash)).toEqual(wasm);
  expect(emitted.files).toEqual([blob.file]);
  expect(() => nameBlob('../escape.wasm', 'wasm', wasm)).toThrow('logical name');
  expect(() => nameBlob('bad.wasm', 'wasm', new Uint8Array([1, 2]))).toThrow();
  expect(() => nameBlob('bad.bin', 'bin', wasm, { decoded: 0 })).toThrow('understate');
  expect(() => nameBlob('model.bin', 'bin', jsonBytes(gltf()))).toThrow('compile to GLB');
  expect(() => emitNamedBlobs([blob, blob])).toThrow('Duplicate');
  expect(() => emitNamedBlobs([blob, nameBlob('alias.bin', 'bin', wasm)])).toThrow('Duplicate');
  blob.bytes.fill(0);
  expect(() => emitNamedBlobs([blob])).toThrow();
});

test('text glTF compiles external and embedded buffers into an admitted GLB without geometry changes', async () => {
  const resources: string[] = [];
  const bytes = await compileGltfSource(jsonBytes(gltf()), uri => { resources.push(uri); return new Uint8Array(position.buffer); });
  expect(resources).toEqual(['geometry.bin']);
  const document = await new NodeIO().readBinary(bytes), primitive = document.getRoot().listMeshes()[0]?.listPrimitives()[0];
  expect(primitive?.getAttribute('POSITION')?.getArray()).toEqual(position);
  expect(primitive?.getIndices()?.getArray()).toEqual(indices);
  expect(parseGlb(bytes).triangles).toBeGreaterThan(0);
  expect(nameBlob('models/triangle.glb', 'glb', bytes).file.path).toMatch(/^blobs\/glb\/[a-f0-9]{64}\.glb$/u);
  await expect(compileGltfSource(jsonBytes({ ...gltf(), extensionsRequired: ['UNSUPPORTED_extension'] }), () => { throw new Error('Never read'); })).rejects.toThrow('unsupported extension');
});

test('named source intake refuses remote resources and project escapes including symlinks', async () => {
  mkdirSync(resolve('tmp'), { recursive: true });
  const scratch = mkdtempSync(resolve('tmp/named-blobs-')), project = resolve(scratch, 'project');
  mkdirSync(project);
  try {
    writeFileSync(resolve(project, 'model.gltf'), jsonBytes(gltf()));
    writeFileSync(resolve(project, 'geometry.bin'), new Uint8Array(position.buffer));
    writeFileSync(resolve(scratch, 'outside.bin'), wasm);
    symlinkSync(resolve(scratch, 'outside.bin'), resolve(project, 'escape.bin'));
    const blob = await readNamedBlob(project, 'models/triangle.glb', 'model.gltf', 'glb');
    expect(blob.file.kind).toBe('glb');
    const packed = await readNamedBlob(project, 'models/triangle.glb', 'model.gltf', 'glb', { meshopt: true });
    expect(gzipSync(packed.bytes, { level: 9 }).length).toBeLessThanOrEqual(gzipSync(blob.bytes, { level: 9 }).length);
    expect(parseGlb(packed.bytes)).toMatchObject({ gpu: blob.file.gpu, triangles: blob.file.triangles, draws: blob.file.draws });
    await expect(readNamedBlob(project, 'bad.bin', 'geometry.bin', 'bin', { meshopt: true })).rejects.toThrow('GLB');
    await expect(readNamedBlob(project, 'escape.bin', '../outside.bin', 'bin')).rejects.toThrow('escapes');
    await expect(readNamedBlob(project, 'escape.bin', 'escape.bin', 'bin')).rejects.toThrow('escapes');
    await expect(readNamedBlob(project, 'model.bin', 'model.gltf', 'bin')).rejects.toThrow('GLB');
    writeFileSync(resolve(project, 'remote.gltf'), jsonBytes(gltf('https://example.invalid/geometry.bin')));
    await expect(readNamedBlob(project, 'models/remote.glb', 'remote.gltf', 'glb')).rejects.toThrow('local relative');
    writeFileSync(resolve(project, 'outside.gltf'), jsonBytes(gltf('../outside.bin')));
    await expect(readNamedBlob(project, 'models/outside.glb', 'outside.gltf', 'glb')).rejects.toThrow('escapes');
  } finally { rmSync(scratch, { recursive: true }); }
});

test('named JSON bakes keep exact bytes and reject malformed data and disguised glTF', () => {
  const bytes = jsonBytes({ places: [[1, 2, 3]] }), blob = nameBlob('world/places.json', 'json', bytes);
  expect(blob.file).toMatchObject({ kind: 'json', decoded: bytes.length, gpu: 0 });
  expect(emitNamedBlobs([blob]).assets.get(blob.file.hash)).toEqual(bytes);
  expect(() => nameBlob('bad.json', 'json', new TextEncoder().encode('{'))).toThrow();
  expect(() => nameBlob('bad.json', 'json', new Uint8Array([255]))).toThrow();
  expect(() => nameBlob('model.json', 'json', jsonBytes(gltf()))).toThrow('compile to GLB');
});


test('a byte validator cannot leave the final named hash bound to earlier bytes', () => {
  const bytes = new TextEncoder().encode('[1]');
  const blob = nameBlobBytes('changed.json', 'json', bytes, { jsonSchema: { $schema: 'http://json-schema.org/draft-07/schema#', type: 'array' } }, (_schema, value) => {
    value[1] = 50;
  });
  expect(new TextDecoder().decode(blob.bytes)).toBe('[2]');
  expect(blob.file.hash).toBe(hashImmutableBytes(blob.bytes));
  expect(bytes).toEqual(new TextEncoder().encode('[1]'));
});
