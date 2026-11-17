// SDK-SPLIT SP6: the sdk reads the format laws (SP4, shard-format 0.16.0) from shard-format, never through the engine.
// Each file below once imported a law the engine defined; SP4 moved the law into format and SP5 made the engine read it
// there too. A file listed here may import no engine path at all, so the sdk's bake tree stays engine-free as SP7 and
// SP8 move the rest (the SP1 dep-guard counts what is left).
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', 'src', 'sharddev');
const ENGINE_FREE = [
  'bake/nativeTerrainField.ts', 'bake/contactRows.ts', 'bake/wholePieceJoin.ts', 'bake/meadow.ts', 'bake/farImpostor.ts',
  'outputProduct.ts', 'interactions.ts', 'quests.ts', 'questGraph.ts', 'rows.ts',
  // SP6b: voxel AO and the geometry bake are the sdk's own copies
  'bake/facetedGeometry.ts', 'bake/voxelAO.ts', 'bake/geometryBake.ts',
  // SP6c: the placeholder geometry (and its far-proxy builder) and the terrain chunk geometry are the sdk's own copies
  'bake/placeholders.ts', 'bake/placeholderGeometry.ts', 'bake/farProxy.ts', 'bake/terrainGeometry.ts',
  // SP8a: the library half reaches no engine module in place; dev-bound files move to packages/dev in SP8b
  'worldScenes.ts', 'bake/slabs.ts', 'bake/wholeGeometryPieces.ts', 'projectGeneration.ts', 'kit/geometryPack.ts', 'bake/mapAssembly.ts',
  'bake/splatGround.ts',
];
/** Files that keep an engine import SP6 does not own: kit content is SP3's, the GLB whole-piece decoder and the client
 *  channel view stay engine reads until SP8, and `splatGround`'s engine texture table (`filePolicy`) leaves with SP7. */
const LAW_IMPORTS_GONE: Readonly<Record<string, readonly string[]>> = {
  'bake/forest.ts': ['world/forest/placement', 'world/terrainField', 'level/data'],
  'bake/slabs.ts': ['models/nativeGeometry', 'game/plugin/geometry'],
  'bake/mapRest.ts': ['physics/mover'],
  'bake/splatGround.ts': ['world/BakedTerrain', 'world/Terrain', 'world/Heightfield'],
  // SP7a: the build's and check's clocks are performance.now(), not the engine's diagnostic clock
  'project.ts': ['core/clock'],
  'check.ts': ['core/clock'],
  'watch/watch.ts': ['core/clock'],
};

const engineImports = (file: string): string[] =>
  [...readFileSync(resolve(ROOT, file), 'utf8').matchAll(/(?:from |import\()'@wildshard\/engine\/([^']+)'/gu)].map(m => m[1] ?? '');

test.each(ENGINE_FREE)('%s imports no engine path', file => {
  expect(engineImports(file)).toEqual([]);
});

test.each(Object.entries(LAW_IMPORTS_GONE))('%s reads its format laws from shard-format', (file, gone) => {
  expect(engineImports(file).filter(path => gone.includes(path))).toEqual([]);
});

const localImports = (file: string): string[] =>
  [...readFileSync(resolve(ROOT, file), 'utf8').matchAll(/from '(\.[^']+)'/gu)].map(m => m[1] ?? '');

test('SP7b: the build names no engine music; check does, at its validate step (the cook refuses unknown names too)', () => {
  expect(localImports('project.ts')).not.toContain('./engineMusic');
  expect(localImports('checkProject.ts')).toContain('./engineMusic');
});

test('SP8a: generation never loads the portal proof itself; build alone refuses it, naming wildshard check', async () => {
  const text = readFileSync(resolve(ROOT, 'projectGeneration.ts'), 'utf8');
  expect(text).not.toMatch(/projectEntryProof'/u);
  const { createProjectGeneration, providePortalEntryProof, PORTAL_PROOF_REFUSAL } = await import('../src/sharddev/projectGeneration');
  expect(PORTAL_PROOF_REFUSAL).toContain('wildshard check');
  const scratch = resolve(import.meta.dirname, '..', 'tmp', 'sp8a-generation');
  mkdirSync(scratch, { recursive: true });
  try {
    const context = createProjectGeneration(scratch, '0'.repeat(64), new Map(), resolve(scratch, 'cache'));
    await expect(context.proveStaticPortalEntries({} as never, [])).rejects.toThrow(PORTAL_PROOF_REFUSAL);
    const proof = { lanes: 1, steps: 2, portalTransfers: 3 };
    providePortalEntryProof(async () => proof);
    try { await expect(context.proveStaticPortalEntries({} as never, [])).resolves.toBe(proof); }
    finally { providePortalEntryProof(undefined); }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test('SP8a: the author CLI hands generation the engine portal walk (dev)', () => {
  expect(readFileSync(resolve(ROOT, 'cli.ts'), 'utf8')).toMatch(/providePortalEntryProof\(/u);
});
