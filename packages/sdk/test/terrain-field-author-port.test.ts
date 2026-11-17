import { expect, expectTypeOf, test } from 'vitest';
import { createTerrainField, terrainFieldPolicy } from '../src/sharddev/bake/nativeTerrainField';
import { forestDefaultTreeSpecs } from '../src/sharddev/bake/forest';
import { buildTerrain } from '@wildshard/engine/world/terrainField';
import type { buildTerrain as formatBuildTerrain } from '@wildshard/format/terrainField';
import { CHUNK_HALF, ROAD_WIDTH, ROAD_LENGTH } from '@wildshard/engine/core/config';
import { TREE_SPECS } from '@wildshard/engine/world/forest/treeSpec';


test('native field and planting metadata retain complete signatures, mandatory dimensions and identity', () => {
  expectTypeOf<typeof createTerrainField>().toEqualTypeOf<typeof formatBuildTerrain>();
  expectTypeOf<ReturnType<typeof forestDefaultTreeSpecs>>().toEqualTypeOf<typeof TREE_SPECS>();
  expect(terrainFieldPolicy()).toEqual({ half: CHUNK_HALF, roadWidth: ROAD_WIDTH, roadLength: ROAD_LENGTH });
  expect(forestDefaultTreeSpecs()).toStrictEqual(TREE_SPECS);
  expect(forestDefaultTreeSpecs()).toBe(forestDefaultTreeSpecs());
  const originalField = buildTerrain(17, { landscape: (x, z, noise) => noise.n.get(x / 10, z / 10) + x / 20 - z / 30, trails: [], cabinSites: [] });
  const field = createTerrainField(17, { landscape: (x, z, noise) => noise.n.get(x / 10, z / 10) + x / 20 - z / 30, trails: [], cabinSites: [] });
  for (const z of [-250, -220, 0, 220, 250]) for (const x of [-250, -220, 0, 220, 250]) {
    expect(field.heightAt(x, z)).toBe(originalField.heightAt(x, z));
    expect(field.normalAt(x, z)).toEqual(originalField.normalAt(x, z));
    expect(field.trailDistance(x, z)).toBe(originalField.trailDistance(x, z));
  }
});
