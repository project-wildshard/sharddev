import { expect, expectTypeOf, test } from 'vitest';
import { parse, type InferOutput } from 'valibot';
import { modelSceneSourceFile, bakedSceneSourceFile, sceneDrawRows } from '../src/sharddev/worldScenes';
import { SceneDrawsSchema } from '@wildshard/format/sceneDraws';

test('model source publication retains the native 256-mesh and 256-hero bounds', () => {
  const input: Parameters<typeof modelSceneSourceFile>[1] = { rows: {
    meshes: [], meshUrls: {}, hd: [], hdUrls: {}, hdLooks: {}, aoFloor: 0.2,
  } };
  const before = structuredClone(input);
  expect(modelSceneSourceFile('world/sources/models.json', input).file.name).toBe('world/sources/models.json');
  for (const field of ['meshes', 'hd'] as const) {
    expect(() => modelSceneSourceFile('world/sources/models.json', { ...input, rows: { ...input.rows, [field]: Array.from({ length: 256 }, () => 'fixture') } })).not.toThrow();
    expect(() => modelSceneSourceFile('world/sources/models.json', { ...input, rows: { ...input.rows, [field]: Array.from({ length: 257 }, () => 'fixture') } })).toThrow('Invalid declared model source');
  }
  expect(input).toEqual(before);
});

test('baked source publication retains all 128 native kind tables and refuses the 129th', () => {
  const rows = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`part-${i}`, { kinds: [], colliders: [] }]));
  const input = { rows: rows(128), urls: {} }, before = structuredClone(input);
  expect(bakedSceneSourceFile('world/sources/bakes.json', input).file.name).toBe('world/sources/bakes.json');
  expect(() => bakedSceneSourceFile('world/sources/bakes.json', { rows: rows(129), urls: {} })).toThrow('Invalid declared bake source');
  expect(input).toEqual(before);
});

test('effect draw admission retains native defaults, finite ports and exact inventory refusals', () => {
  expectTypeOf<ReturnType<typeof sceneDrawRows>>().toEqualTypeOf<InferOutput<typeof SceneDrawsSchema>>();
  const draw = { kind: 'buffered', file: 'world/particles.bin', material: 'embers' };
  expect(sceneDrawRows([draw])).toEqual(parse(SceneDrawsSchema, [draw]));
  for (const bad of [[{ ...draw, scale: Number.POSITIVE_INFINITY }], [{ ...draw, executable: () => 1 }], Array.from({ length: 33 }, () => draw)]) {
    expect(() => sceneDrawRows(bad)).toThrow();
    expect(() => parse(SceneDrawsSchema, bad)).toThrow();
  }
});
