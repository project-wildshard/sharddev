// oxlint-disable-next-line import/no-nodejs-modules -- Exercise a real bounded source project and remove it after the proof.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- All fixture assets and outputs belong to repository scratch.
import { resolve } from 'node:path';
import { afterAll, expect, test, vi } from 'vitest';
import { parseRows } from '@wildshard/format/rows';
import { parseShardfile, shardfileRules } from '@wildshard/format/shardSchema';
import { resolveSkinLookFiles } from '@wildshard/format/skinAssets';
import { speciesKinds } from '@wildshard/engine/entities/species/registry';
import { emptyShardfile } from '../../../sdk/src/sharddev/author';
import { kitCreature } from '../../../sdk/src/sharddev/kitCreatures';
import { buildProject } from '../../../sdk/src/sharddev/project';
import { checkProject } from './checkProject';
import { validateOutputProduct } from '../../../sdk/src/sharddev/outputProduct';
import { closeFixtures, fixtureRoot } from '../../../sdk/src/sharddev/test/ownedScratch';

afterAll(closeFixtures);

test.each(['boar', 'bear'] as const)('complete kit %s and an authored reskin build and check without engine registrations', async kind => {
  const root = fixtureRoot('kit-creature-fixture-'), warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    expect(speciesKinds()).toEqual([]);
    const products = await Promise.all([
      kitCreature(kind, { id: `fixture.${kind}`, look: `fixture.${kind}.look`, family: kind === 'boar' ? 'toon' : 'pbr' }),
      kitCreature('boar', { id: 'fixture.reskin', look: 'author.reskin.look', family: 'toon', skins: { boar: 'black', sow: 'black', big: 'black', scarback: 'black', ironhide: 'black' } }),
    ]);
    const source = emptyShardfile({ slug: 'kit-creature-fixture', name: 'Kit creatures', author: 'Test', revision: 1, seed: 17 });
    const files = new Map(products.flatMap(product => product.files.map(file => [file.hash, file] as const)));
    const assets = new Map(products.flatMap(product => [...product.assets]));
    source.files = [...files.values()]; source.library = [...new Set(products.flatMap(product => product.library))];
    source.budgets.library = { resident: source.files.reduce((sum, file) => sum + file.decoded + file.gpu, 0), compressed: source.files.reduce((sum, file) => sum + file.compressed, 0) };
    source.rows = parseRows({ ...source.rows, species: products.map(product => product.species), strikes: products.flatMap(product => product.strikes), looks: products.map(product => product.look) });
    source.items.catalogue = [...new Map(products.flatMap(product => product.items.map(item => [item.id, item] as const))).values()];
    source.creatures.spawns = products.map((product, index) => {
      const variant = product.species.variants[0]; if (variant === undefined) throw new Error('Missing fixture variant');
      return { id: `fixture.actor.${index}`, species: product.species.id, variant: variant.id, at: [index * 10, 0, 0], yaw: index * 0.2, seed: index + 1, scale: 1, brain: null, strike: null };
    });
    expect(shardfileRules(source)).toEqual([]);
    const text = JSON.stringify(parseShardfile(source));
    mkdirSync(resolve(root, 'assets'));
    for (const [hash, bytes] of assets) writeFileSync(resolve(root, 'assets', hash), bytes);
    writeFileSync(resolve(root, 'data.json'), text);
    writeFileSync(resolve(root, 'shard.config.ts'), "import input from './data.json' with { type: 'json' };\nexport default input;\n");
    await buildProject(root, resolve(root, 'built'), { client: null });
    const built = validateOutputProduct(resolve(root, 'built'));
    expect(built.shard.rows.species.map(row => row.harvest)).toEqual(products.map(product => product.species.harvest));
    expect(built.shard.items.catalogue).toEqual(source.items.catalogue);
    expect(built.shard.creatures.spawns).toEqual(source.creatures.spawns);
    expect(built.shard.rows.looks).toEqual(products.map(product => product.look));
    for (const [hash, bytes] of assets) expect(built.assets.get(hash)).toEqual(bytes);
    const reskin = built.shard.rows.looks.find(row => row.id === 'author.reskin.look');
    if (reskin === undefined) throw new Error('Missing authored reskin');
    const resolved = resolveSkinLookFiles(built.shard, reskin, built.assets);
    expect(resolved.variants?.get('sow')).toBe(resolved.variants?.get('black'));
    const result = await checkProject(root, resolve(root, 'checked'));
    expect(result.refusals).toEqual([]); expect(result.verdict).toBe('pass');
    expect(result.steps.find(step => step.name === 'build')?.status).toBe('pass');
    expect(result.steps.find(step => step.name === 'validate')?.status).toBe('pass');
    expect(readFileSync(resolve(root, 'data.json'), 'utf8')).toBe(text);
    expect(speciesKinds()).toEqual([]);
  } finally { warnings.mockRestore(); rmSync(root, { recursive: true, force: true }); }
});
