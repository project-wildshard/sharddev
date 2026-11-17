// SDK-SPLIT SP6: the sdk reads the format laws (SP4, shard-format 0.16.0) from shard-format, never through the engine.
// Each file below once imported a law the engine defined; SP4 moved the law into format and SP5 made the engine read it
// there too. A file listed here may import no engine path at all, so the sdk's bake tree stays engine-free as SP7 and
// SP8 move the rest (the SP1 dep-guard counts what is left).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', 'src', 'sharddev');
const ENGINE_FREE = [
  'bake/nativeTerrainField.ts', 'bake/contactRows.ts', 'bake/wholePieceJoin.ts', 'bake/meadow.ts', 'bake/farImpostor.ts',
  'outputProduct.ts', 'interactions.ts', 'quests.ts', 'questGraph.ts', 'rows.ts',
  // SP6b: voxel AO and the geometry bake are the sdk's own copies
  'bake/facetedGeometry.ts',
];
/** Files that keep one engine import SP6a does not own (kit content is SP3's, the three-based decoders are SP6b/SP6c's). */
const LAW_IMPORTS_GONE: Readonly<Record<string, readonly string[]>> = {
  'bake/forest.ts': ['world/forest/placement', 'world/terrainField', 'level/data'],
  'bake/slabs.ts': ['models/nativeGeometry', 'game/plugin/geometry'],
  'bake/mapRest.ts': ['physics/mover'],
  'bake/placeholders.ts': ['core/config', 'world/BakedTerrain'],
  'bake/splatGround.ts': ['world/BakedTerrain'],
};

const engineImports = (file: string): string[] =>
  [...readFileSync(resolve(ROOT, file), 'utf8').matchAll(/from '@wildshard\/engine\/([^']+)'/gu)].map(m => m[1] ?? '');

test.each(ENGINE_FREE)('%s imports no engine path', file => {
  expect(engineImports(file)).toEqual([]);
});

test.each(Object.entries(LAW_IMPORTS_GONE))('%s reads its format laws from shard-format', (file, gone) => {
  expect(engineImports(file).filter(path => gone.includes(path))).toEqual([]);
});
