// oxlint-disable-next-line import/no-nodejs-modules -- This proof owns a real bounded author project.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Keep all fixture output in the lane's repository scratch.
import { resolve } from 'node:path';
import { afterAll, expect, test, vi } from 'vitest';
import { commonCreature } from '@wildshard/kit/creatures';
import { parseRows } from '@wildshard/format/rows';
import { parseShardfile, type Shardfile } from '@wildshard/format/shardSchema';
import { emptyShardfile } from './author';
import { expandHarvestSource } from './harvestSource';
import { buildProject } from './project';
import { validateOutputProduct, writeOutputProduct } from './outputProduct';
import { settleHandwrittenCreatureLayers } from './handwrittenCreatureLayers';
import { closeFixtures, fixtureRoot } from './test/ownedScratch';

afterAll(closeFixtures);
function fixture(): Shardfile {
  const source = emptyShardfile({ slug: 'harvest-fixture', name: 'Harvest fixture', author: 'Test', revision: 1, seed: 17 });
  const content = commonCreature('boar', { id: 'fixture.boar', look: 'fixture.look' });
  delete content.species.harvest;
  source.rows = parseRows({ ...source.rows, species: [content.species], strikes: content.strikes,
    looks: [{ id: 'fixture.look', species: 'fixture.boar', recipe: 'engine.sphere', material: null, parameters: {}, animation: { recipe: 'engine.scale-wave', parameters: {} } }] });
  source.items.catalogue = [{ id: 'boar-tusk', label: 'Authored tusk', icon: 'star', travels: true }];
  return parseShardfile(source);
}
test('old drops gain complete catalogue metadata while explicit declarations and pack policy win', () => {
  const source = fixture(), before = JSON.stringify(source), warnings: string[] = [];
  const built = expandHarvestSource(source, line => { warnings.push(line); });
  expect(built.rows.species[0]?.harvest).toEqual(commonCreature('boar', { id: 'fixture.boar', look: 'fixture.look' }).species.harvest);
  expect(built.items.catalogue?.find(row => row.id === 'boar-tusk')).toEqual(source.items.catalogue?.[0]);
  expect(built.items.catalogue?.map(row => row.id)).toEqual(['boar-tusk', 'boar-meat', 'boar-hide']);
  expect(built.items.loadout).toEqual(source.items.loadout); expect(built.manifest).toEqual(source.manifest);
  expect(JSON.stringify(source)).toBe(before); expect(warnings).toHaveLength(1);
  expect(expandHarvestSource(built, () => { throw new Error('Repeated expansion'); })).toBe(built);
  const row = source.rows.species[0]; if (row === undefined) throw new Error('Missing species');
  row.harvest = []; expect(expandHarvestSource(source)).toBe(source);
  delete row.harvest; row.kind = 'own.label'; expect(expandHarvestSource(source)).toBe(source);
});
test('normal build and handwritten settlement both publish admitted harvest and metadata', async () => {
  const root = fixtureRoot('harvest-source-'), warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const source = fixture(), text = JSON.stringify(source);
    writeFileSync(resolve(root, 'data.json'), text);
    writeFileSync(resolve(root, 'shard.config.ts'), "import input from './data.json' with { type: 'json' };\nexport default input;\n");
    const built = await buildProject(root, resolve(root, 'built'), { client: null });
    const product = validateOutputProduct(resolve(root, 'built'));
    expect(product.shard.rows.species[0]?.harvest).toEqual(built.rows.species[0]?.harvest);
    expect(product.shard.items.catalogue).toEqual(built.items.catalogue);
    expect(readFileSync(resolve(root, 'data.json'), 'utf8')).toBe(text);
    writeOutputProduct(source, new Map(), resolve(root, 'handwritten'));
    const settled = settleHandwrittenCreatureLayers(resolve(root, 'handwritten'), resolve(root, 'settled'));
    expect(settled.shard.rows.species[0]?.harvest).toEqual(built.rows.species[0]?.harvest);
    expect(settled.shard.items.catalogue).toEqual(built.items.catalogue);
  } finally { warnings.mockRestore(); rmSync(root, { recursive: true, force: true }); }
});
