import { expect, test } from 'vitest';
import { parseWorldSceneModels } from '@wildshard/format/worldSceneModels';
import { parse } from 'valibot';
import { parseSceneBuffers } from '@wildshard/format/sceneBuffers';
import { WorldSceneWeldSchema, parseWorldSceneWeld } from '@wildshard/format/worldSceneWeld';
import { WorldSceneSurfaceSchema } from '@wildshard/format/worldSceneSurface';
import { BakedBuildingLookSchema, parseBuildingLifeRows, emptyBuildingLifeRows as nativeEmptyBuildingLifeRows } from '@wildshard/format/buildings';
import { parsePrivateScene } from '@wildshard/format/clientChannels';
import { worldSceneModels, worldSceneBuffers, worldSceneWeldRows, worldSceneWeldData, worldSceneSurfaceProperties, buildingLookRows, buildingLifeRows, emptyBuildingLifeRows, privateSceneRows } from './worldScenes';

const model = {
  key: 'marker', id: 'author-scene/marker', name: 'Marker', category: 'props',
  pipeline: 'code', file: 'models/marker.ts', defaults: {},
  choices: [{ id: 'only', params: {}, size: [1, 2, 3], draws: [], colliders: [] }],
};

test('author private scenes preserve complete defaults and defining refusals', () => {
  const input = { version: 1, root: 'root', nodes: [{ kind: 'group', id: 'root', children: [] }], materials: [] };
  expect(privateSceneRows(input)).toEqual(parsePrivateScene(input));
  for (const invalid of [{ ...input, version: 9 }, { ...input, root: '' }, { ...input, callback: () => undefined }]) {
    expect(() => privateSceneRows(invalid)).toThrow();
    expect(() => parsePrivateScene(invalid)).toThrow();
  }
});

test('author model catalogues preserve every admitted field and default', () => {
  const input = { product: 'author-scene', models: [model] };
  expect(worldSceneModels(input)).toEqual(parseWorldSceneModels(input));
});

test('author model catalogues retain identity, finite data and callback refusals', () => {
  expect(() => worldSceneModels({ product: 'author-scene', models: [model, model] })).toThrow();
  expect(() => worldSceneModels({ product: 'other', models: [model] })).toThrow();
  expect(() => worldSceneModels({ product: 'author-scene', models: [model], callback: () => undefined })).toThrow();
  expect(() => worldSceneModels({ product: 'author-scene', models: [{ ...model, choices: [{ ...model.choices[0], size: [1, Number.NaN, 3] }] }] })).toThrow();
});

test('author buffered scenes retain defaults, named range references and refusals', () => {
  const input = { version: 1, name: 'sparks', buffers: [{ id: 'positions', storage: 'f32', file: 'world/points.bin', byteLength: 24 }],
    attributes: [{ id: 'position', buffer: 'positions', size: 3 }], geometries: [{ id: 'points', attributes: { position: 'position' } }],
    draws: [{ id: 'points', draw: { kind: 'points', geometry: 'points' } }] };
  expect(worldSceneBuffers(input)).toEqual(parseSceneBuffers(input));
  for (const invalid of [{ ...input, attributes: [{ id: 'position', buffer: 'missing', size: 3 }] },
    { ...input, buffers: [{ ...input.buffers[0], bytes: 'AAAA' }] }, { ...input, draws: [{ id: 'points', draw: { kind: 'points', geometry: 'missing' } }] }]) {
    expect(() => worldSceneBuffers(invalid)).toThrow();
    expect(() => parseSceneBuffers(invalid)).toThrow();
  }
});

test('author frozen topology retains original transform words, defaults and uniqueness', () => {
  const matrixBits = Array.from(new Uint32Array(Float64Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -0, 0, 0, 1).buffer));
  const input = { id: 'shell', root: 'root', nodes: [{ id: 'group', kind: 'group', parent: 'root', layers: -1, matrixBits, matrixAutoUpdate: false }],
    materials: [{ id: 'wood', kind: 'standard', properties: { roughness: 0.8, color: [0.1, 0.2, 0.3] } }] };
  expect(worldSceneWeldRows(input)).toEqual(parseWorldSceneWeld(input));
  const draft = worldSceneWeldData(input);
  expect(draft).toEqual(parse(WorldSceneWeldSchema, input));
  expect(Object.isFrozen(draft)).toBe(false);
  expect(Object.isFrozen(worldSceneWeldRows(input))).toBe(true);
  expect(draft).not.toBe(input);
  for (const invalid of [{ ...input, nodes: [...input.nodes, ...input.nodes] },
    { ...input, nodes: [{ ...input.nodes[0], matrixBits: [1] }] }, { ...input, callback: () => undefined }]) {
    expect(() => worldSceneWeldRows(invalid)).toThrow();
    expect(() => worldSceneWeldData(invalid)).toThrow();
    expect(() => parseWorldSceneWeld(invalid)).toThrow();
  }
});

test('author surface properties retain complete tuples and finite-property refusals', () => {
  const input = { color: [0.1, 0.2, 0.3], normalScale: [1, -1], roughness: 0.8, metalness: 0.1, transparent: true, opacity: 0.5,
    emissive: [0, 0.2, 0.3], side: 2, depthWrite: false, vertexColors: true };
  expect(worldSceneSurfaceProperties(input)).toEqual(parse(WorldSceneSurfaceSchema.entries.properties, input));
  for (const invalid of [{ ...input, color: [1, 2] }, { ...input, roughness: Number.NaN }, { ...input, side: 4 }, { ...input, callback: () => undefined }]) {
    expect(() => worldSceneSurfaceProperties(invalid)).toThrow();
    expect(() => parse(WorldSceneSurfaceSchema.entries.properties, invalid)).toThrow();
  }
});

test('author building policy preserves the original look and living defaults', () => {
  const input = { detail: ['wood'], far: ['stone'], door: { leaf: 'wood', hinges: 'iron', battens: 'wood', reach: 2, open: 'Open', close: 'Close' },
    wheel: 'wood', lantern: { ring: 'iron', ringY: 1, drop: 2, scale: 0.5, glassName: 'glass',
      glass: { color: 1, emissive: [0, 0, 0], emissiveIntensity: 1, roughness: 0.5, metalness: 0, opacity: 1 },
      frame: { color: 2, roughness: 0.7, metalness: 1 } }, particles: { center: [0, 1, 0], radius: 3 }, deck: [0.1, 0.2] };
  expect(buildingLookRows(input)).toEqual(parse(BakedBuildingLookSchema, input));
  const life = { doors: [], swings: [], wheels: [], flickers: [], lamps: [], sites: [], shared: [] };
  expect(buildingLifeRows(life)).toEqual(parseBuildingLifeRows(life));
  const first = emptyBuildingLifeRows(), second = emptyBuildingLifeRows();
  expect(first).toEqual(nativeEmptyBuildingLifeRows());
  first.shared.push('owned');
  expect(second.shared).toEqual([]);
  for (const invalid of [{ ...input, deck: [1] }, { ...input, wheel: '' }, { ...input, callback: () => undefined }]) {
    expect(() => buildingLookRows(invalid)).toThrow();
    expect(() => parse(BakedBuildingLookSchema, invalid)).toThrow();
  }
  for (const invalid of [{ ...life, shared: Array.from({ length: 9 }, () => 'light') }, { ...life, callback: () => undefined }]) {
    expect(() => buildingLifeRows(invalid)).toThrow();
    expect(() => parseBuildingLifeRows(invalid)).toThrow();
  }
});
