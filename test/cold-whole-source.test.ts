import { expect, test } from 'vitest';
import { playLibrarySteps } from '@wildshard/format/admissionControl';
import { emptyShardfile } from '@wildshard/sdk/author';
import type { OutputIndex } from '@wildshard/format/outputIndex';

const cold = '1'.repeat(64), tile = '2'.repeat(64), shared = '3'.repeat(64), dependent = '4'.repeat(64);
function fixture() {
  const source = emptyShardfile({ slug: 'cold-whole', name: 'Cold whole', author: 'Fixture', revision: 1, seed: 1 });
  for (const hash of [cold, tile, shared, dependent]) source.files.push({ hash, kind: 'glb', compressed: 100, decoded: 100, gpu: 0, triangles: 0, draws: 0, dependencies: [], critical: false });
  source.library.push(cold, tile, shared, dependent);
  source.props = { version: 1, family: 'toon', tiles: [], panels: [], models: [], far: null, colliders: [], textures: [], wholeLibrary: [cold, tile, shared, dependent] };
  const index: Pick<OutputIndex, 'files'> = { files: source.files.map(file => ({ ...file, kind: 'glb', name: `original/${file.hash}.glb`, path: `blobs/glb/${file.hash}.glb` })) };
  const sections = new Map<string, unknown>([['world/scenes', { version: 1, libraries: [], materials: [], steps: [] }], ['world/props', { props: source.props }]]);
  const select = (): ReadonlySet<string> => { const walk = playLibrarySteps(source, { index, sections }); for (;;) { const next = walk.next(); if (next.done) return next.value; } };
  return { source, sections, select };
}

test('unused retained whole sources are cold while tile, critical and dependency roots stay admitted', () => {
  const f = fixture();
  f.source.critical.push(shared);
  f.source.tiles.push({ lod: 0, x: 0, z: 0, bounds: { min: [0, 0, 0], max: [62.5, 1, 62.5] }, geometricError: 0,
    files: [tile], compressed: 100, decoded: 100, gpu: 0, triangles: 0, draws: 0 });
  const file = f.source.files.find(row => row.hash === shared); if (file === undefined) throw new Error('Missing dependency owner');
  file.dependencies.push(dependent);
  expect([...f.select()]).toEqual([cold]);
  expect(f.source.library).toContain(cold); // The original descriptor still serves cold/non-play readers.
  expect(f.source.props?.wholeLibrary).toContain(cold);
});

test('explicit source, named section and resident whole-library consumers retain exact files', () => {
  const f = fixture();
  f.sections.set('world/scenes', { version: 1, libraries: [{ id: 'live', kind: 'whole', models: [{ id: 'kept', part: 'original', files: [shared] }] }], materials: [], steps: [] });
  f.sections.set('world/ground', { sources: [`original/${cold}.glb`] });
  expect([...f.select()]).toEqual([tile, dependent]);
});

test('island assemblies keep their whole source list and critical flags cannot be deferred', () => {
  const f = fixture();
  f.sections.set('client/plan', { features: [{ kind: 'world.assembly', library: 'original' }] });
  expect([...f.select()]).toEqual([]);
  f.sections.delete('client/plan');
  const file = f.source.files.find(row => row.hash === cold); if (file === undefined) throw new Error('Missing cold source');
  file.critical = true;
  expect(f.select().has(cold)).toBe(false);
});
