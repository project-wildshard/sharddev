import { expect, expectTypeOf, test } from 'vitest';
import * as v from 'valibot';
import { worldSceneTileGroups, worldSceneTileFiles, type AuthorSceneTileGroup, type AuthorSceneTileFiles } from '../src/sharddev/worldScenes';

test('scene tile groups retain native order, empty groups and detached ownership', () => {
  const original = v.record(v.string(), v.strictObject({ files: v.array(v.string()), resident: v.boolean() }));
  const input = { z: { files: ['b.glb', 'a.glb', 'b.glb'], resident: true }, a: { files: [], resident: false } };
  const current = worldSceneTileGroups(input), before = v.parse(original, input);
  expectTypeOf(current).toEqualTypeOf<Record<string, AuthorSceneTileGroup>>();
  expect(JSON.stringify(current)).toBe(JSON.stringify(before));
  expect(current).not.toBe(input);
  expect(current['z']?.files).not.toBe(input.z.files);
  expect(current['z']?.files).toEqual(['b.glb', 'a.glb', 'b.glb']);
  expect(worldSceneTileGroups({})).toEqual({});
  expect(worldSceneTileGroups([])).toEqual(v.parse(original, []));
});

test('scene tile group admission keeps all original strict member refusals', () => {
  const original = v.record(v.string(), v.strictObject({ files: v.array(v.string()), resident: v.boolean() }));
  for (const bad of [null, { a: {} }, { a: { files: [], resident: 'true' } },
    { a: { files: [1], resident: true } }, { a: { files: [], resident: false, extra: true } }]) {
    expect(() => worldSceneTileGroups(bad)).toThrow();
    expect(() => v.parse(original, bad)).toThrow();
  }
});

test('source tile files retain exact native order, optionality and unknown metadata stripping', () => {
  const original = v.array(v.object({ file: v.string(), additionalFiles: v.exactOptional(v.array(v.string())) }));
  const input = [{ file: 'b.glb', additionalFiles: ['z', 'a', 'z'], ignored: 1 }, { file: 'a.glb' }];
  const actual = worldSceneTileFiles(input);
  expectTypeOf(actual).toEqualTypeOf<AuthorSceneTileFiles[]>();
  expect(JSON.stringify(actual)).toBe(JSON.stringify(v.parse(original, input)));
  expect(actual[0]?.additionalFiles).not.toBe(input[0]?.additionalFiles);
  expect(Object.hasOwn(actual[1] ?? {}, 'additionalFiles')).toBe(false);
  for (const bad of [null, {}, [{ file: 1 }], [{ file: 'a', additionalFiles: undefined }],
    [{ file: 'a', additionalFiles: [1] }], [{ additionalFiles: [] }]]) {
    expect(() => worldSceneTileFiles(bad)).toThrow();
    expect(() => v.parse(original, bad)).toThrow();
  }
});
