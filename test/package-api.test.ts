// oxlint-disable-next-line import/no-nodejs-modules -- Inspect the actual package exports and retained guide sources.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { packageApiDocuments, packageApiSurface, publicModules } from '../scripts/docs/package-api.mjs';
import { authoringExamples } from '../scripts/docs/authoring-reference.mjs';

test('SDK docs read moved kit bindings and exact checked examples without engine context files', () => {
  const root = resolve(import.meta.dirname, '..');
  const surface = packageApiSurface(root), documents = packageApiDocuments(root, surface);
  const kit = surface.indexes['kit'] ?? [], sdk = surface.indexes['sharddev'] ?? [];
  for (const path of ['bake/species', 'bake/riderArms', 'bake/specimenCatalogue', 'bake/nativeInteractionFacts', 'weapons/meleeProfile', 'weapons/bowProfile']) {
    expect(kit.filter(row => row.from === `@wildshard/kit/${path}`).length).toBeGreaterThan(0);
    expect(sdk.some(row => row.from === `@wildshard/sdk/${path}`)).toBe(false);
  }
  const modules = publicModules(resolve(root, 'packages/kit'));
  expect(modules.some(row => row.from === '@wildshard/kit/geometry/species')).toBe(true);
  expect(modules.some(row => row.from.includes('test'))).toBe(false);
  expect(kit.filter(row => row.from === '@wildshard/kit/geometry/species').map(row => ({ name: row.name, kind: row.kind, doc: row.doc }))).toEqual(
    kit.filter(row => row.from === '@wildshard/kit/bake/species').map(row => ({ name: row.name, kind: row.kind, doc: row.doc })),
  );
  for (const example of authoringExamples()) expect(documents['docs/api/SHARDDEV.md']).toContain(example.source.trimEnd());
  expect(documents['docs/api/KIT.md']).toContain('commonSpeciesRows');
  expect(documents['docs/api/FORMAT.md']).toContain('readSpecies');
});
