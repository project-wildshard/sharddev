// oxlint-disable-next-line import/no-nodejs-modules -- Bundle the defining author module without executing a product build.
import { resolve } from 'node:path';
import { Document, WebIO } from '@gltf-transform/core';
import { Matrix4 } from 'three';
import { expect, test, vi } from 'vitest';
import { build } from 'vite';
import { assertConfigBoundary } from '../configBoundary';
import { MapRaster } from './mapRaster';
import { mapRows, paintMapScenes } from './mapScenes';
import { rasterSceneMap } from './groundMap';

test('source map framing keeps style, empty geometry and whole-library refusals', async () => {
  const style = { kind: 'ground', classes: [{ match: '#737373', fill: '#cccccc' }] };
  const reader = { input: (): Uint8Array => { throw new Error('Unadmitted input'); }, bytes: () => new Uint8Array(),
    json: (): unknown => ({ props: { wholeLibrary: {} } }) };
  await expect(rasterSceneMap({ style: { kind: 'other' }, painter: { version: 1 } }, reader)).rejects.toThrow();
  await expect(rasterSceneMap({ style, painter: { version: 1 } }, reader)).rejects.toThrow('data map is empty');
  await expect(rasterSceneMap({ style, painter: { version: 1, props: ['props'] } }, reader)).rejects.toThrow('whole-library props');
});

test('declared wildcard paths preserve row order and refuse absent/non-array data', () => {
  const source = { groups: [{ rows: [{ value: 4 }, { value: -0 }] }, { rows: [{ value: 9 }] }] };
  expect(mapRows(source, ['groups', '*', 'rows', '*', 'value'])).toEqual([4, -0, 9]);
  expect(mapRows(source)[0] === source).toBe(true);
  expect(() => mapRows(source, ['missing'])).toThrow('Missing map scene data missing');
  expect(() => mapRows(source, ['*'])).toThrow('wildcard requires an array');
  expect(() => mapRows({}, ['toString'])).toThrow('Missing map scene data');
});

test('owned pools retain aliases, rest poses, transparent omission and hidden-standing rules', async () => {
  const doc = new Document(), buffer = doc.createBuffer();
  const position = doc.createAccessor().setBuffer(buffer).setType('VEC3')
    .setArray(new Float32Array([-10, 0, -10, 10, 0, -10, 0, 0, 10]));
  const mesh = doc.createMesh('floor').addPrimitive(doc.createPrimitive().setAttribute('POSITION', position));
  doc.createScene().addChild(doc.createNode('floor').setMesh(mesh));
  const bytes = await new WebIO().writeBinary(doc), raster = new MapRaster(32);
  const recipe = { scene: { root: 'root', nodes: [
    { kind: 'group', id: 'root', children: ['island', 'plants', 'ordinary', 'mist', 'point'] },
    { kind: 'mesh', id: 'island', name: 'decorative', geometry: 'floor', material: 'stone' },
    { kind: 'mesh', id: 'plants', geometry: 'floor', material: 'stone', instances: 2,
      matrices: [...new Matrix4().elements, ...new Matrix4().makeTranslation(100, 0, 0).elements] },
    { kind: 'mesh', id: 'ordinary', geometry: 'alias', material: 'stone', position: [1, 0, 0] },
    { kind: 'mesh', id: 'mist', geometry: 'floor', material: 'mist', position: [0, 20, 0] },
    { kind: 'object', id: 'point', source: 'light1' },
  ], materials: [{ kind: 'standard', id: 'stone', properties: {} }, { kind: 'port', id: 'mist', source: 'mist:material' }] }, lights: [{ id: 'light1' }] };
  const rows = new Map<string, unknown>([['recipe', recipe], ['rest', { nodes: { ordinary: { position: [30, 2, -7] } } }],
    ['materials', { mist: { graph: { effectState: { blend: 'alpha', depthWrite: false } } } }]]);
  const before = JSON.stringify(recipe), draw = vi.spyOn(raster, 'glb').mockResolvedValue(undefined);
  const reader = { input: (file: string): Uint8Array => { expect(file).toBe('pool'); return bytes; },
    json: (file: string): unknown => rows.get(file), bytes: (): Uint8Array => { throw new Error('Unexpected binary'); } };
  try {
    await paintMapScenes(raster, { pools: ['pool'], aliases: { alias: 'floor' }, materials: [{ file: 'materials' }],
      recipes: [{ file: 'recipe', rest: 'rest', lights: ['lights'] }] }, { hide: ['decorative'], hideStanding: ['decorative'] }, reader);
    expect(draw.mock.calls).toHaveLength(2);
    expect(draw.mock.calls.map(([file, matrix, _select, options]) => ({ owned: file === bytes, pose: matrix?.elements, local: options?.local })))
      .toEqual([{ owned: true, pose: new Matrix4().makeTranslation(100, 0, 0).elements, local: true },
        { owned: true, pose: new Matrix4().makeTranslation(30, 2, -7).elements, local: true }]);
    expect(JSON.stringify(recipe)).toBe(before);
  } finally { draw.mockRestore(); }
});

test('unknown geometry, cyclic hierarchy, and unsupported nodes still refuse', async () => {
  const read = { input: (): Uint8Array => { throw new Error('Unexpected geometry'); }, bytes: () => new Uint8Array(),
    json: (): unknown => ({ root: 'root', nodes: [{ kind: 'group', id: 'root', children: ['root'] }] }) };
  await expect(paintMapScenes(new MapRaster(8), { recipes: [{ file: 'scene' }] }, {}, read)).rejects.toThrow('Invalid map scene hierarchy root');
  await expect(paintMapScenes(new MapRaster(8), { recipes: [{ file: 'scene' }] }, {}, { ...read,
    json: () => ({ root: 'root', nodes: [{ kind: 'mesh', id: 'root', geometry: 'missing' }] }) }))
    .rejects.toThrow('Missing declared map geometry missing');
  await expect(paintMapScenes(new MapRaster(8), { recipes: [{ file: 'scene' }] }, {}, { ...read,
    json: () => ({ root: 'root', nodes: [{ kind: 'unknown', id: 'root' }] }) }))
    .rejects.toThrow('Unsupported map scene node unknown');
});

test('fitted models use the declared byte identity with no inferred public directory', async () => {
  const doc = new Document(), buffer = doc.createBuffer();
  const position = doc.createAccessor().setBuffer(buffer).setType('VEC3')
    .setArray(new Float32Array([-10, 0, -10, 10, 0, -10, 0, 0, 10]));
  const mesh = doc.createMesh('floor').addPrimitive(doc.createPrimitive().setAttribute('POSITION', position));
  doc.createScene().addChild(doc.createNode('floor').setMesh(mesh));
  const bytes = await new WebIO().writeBinary(doc), raster = new MapRaster(32), identities: string[] = [];
  const reader = { input: (file: string): Uint8Array => { identities.push(file); return bytes; },
    json: (file: string): unknown => file === 'models' ? { figure: 'author/figure.glb' } : {
      scene: { root: 'model', nodes: [{ kind: 'object', id: 'model', source: 'figure', position: [3, 4, 5] }] },
      imports: [{ id: 'figure', kind: 'model', model: 'figure', fit: { size: 10, floor: 2 } }],
    }, bytes: () => new Uint8Array() };
  const draw = vi.spyOn(raster, 'glb').mockResolvedValue(undefined);
  try {
    await paintMapScenes(raster, { models: [{ file: 'models' }], recipes: [{ file: 'scene' }] }, {}, reader);
    expect(identities).toEqual(['author/figure.glb']); expect(draw.mock.calls).toHaveLength(1);
    expect(draw.mock.calls[0]?.[0] === bytes).toBe(true);
    expect(draw.mock.calls[0]?.[1]?.elements).toEqual(new Matrix4().makeScale(.5, .5, .5).setPosition(3, 6, 5).elements);
    identities.length = 0;
    await paintMapScenes(raster, { models: [{ file: 'models' }], recipes: [{ file: 'scene' }] }, {}, {
      ...reader, model: url => reader.input(`declared:${url}`),
    });
    expect(identities).toEqual(['declared:author/figure.glb']);
  } finally { draw.mockRestore(); }
});

test('the private-scene painter fits the unchanged author config boundary', async () => {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: resolve('src/sharddev/bake/mapScenes.ts'), formats: ['es'] },
    rolldownOptions: { external: [/^node:/u], output: { codeSplitting: false } } } });
  const output = Array.isArray(result) ? result[0] : result;
  if (output === undefined || !('output' in output)) throw new Error('Missing private-scene painter bundle');
  const chunks = output.output.filter(row => row.type === 'chunk'); expect(chunks).toHaveLength(1);
  for (const chunk of chunks) expect(() => assertConfigBoundary([...chunk.imports, ...chunk.dynamicImports])).not.toThrow();
});
