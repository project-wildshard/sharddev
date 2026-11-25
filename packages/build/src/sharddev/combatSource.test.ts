// oxlint-disable-next-line import/no-nodejs-modules -- Exercise real immutable source and generated products.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Fixture output stays beneath the lane's repository scratch.
import { resolve } from 'node:path';
import { afterAll, expect, test, vi } from 'vitest';
import { commonCreature } from '@wildshard/kit/creatures';
import { IRON_MELEE_PROFILE } from '@wildshard/kit/geometry/starterCombat';
import { parseRows } from '@wildshard/format/rows';
import { parseItems } from '@wildshard/format/items';
import { parseShardfile } from '@wildshard/format/shardSchema';
import { emptyShardfile } from '@wildshard/sdk/author';
import { expandCombatSource } from '@wildshard/sdk/internal/combatSource';
import { buildProject } from './project';
import { validateOutputProduct, writeOutputProduct } from '@wildshard/sdk/outputProduct';
import { settleHandwrittenCreatureLayers } from '@wildshard/sdk/internal/handwrittenCreatureLayers';
import { emitPlatformSections } from '@wildshard/sdk/platformSections';
import { closeFixtures, fixtureRoot } from '@wildshard/sdk/internal/test/ownedScratch';

afterAll(closeFixtures);
function fixture() {
  const source = emptyShardfile({ slug: 'combat-source', name: 'Combat source', author: 'Test', saveRevision: 1, seed: 17 });
  const creatures = [['own.shell', 'crab'], ['own.shell2', 'crab'], ['own.timber', 'sailor'], ['own.sand', 'boar']].map(([id, kind]) => {
    if (id === undefined || kind === undefined) throw new Error('Missing fixture species');
    const row = commonCreature('boar', { id, look: `${id}.look` }); row.species.kind = kind; row.species.harvest = [];
    return row;
  });
  source.rows = parseRows({ ...source.rows, species: creatures.map(row => row.species), strikes: creatures.flatMap(row => row.strikes),
    looks: creatures.map(row => ({ id: row.species.body?.look, species: row.species.id, recipe: 'engine.sphere', material: null, parameters: {}, animation: { recipe: 'engine.scale-wave', parameters: {} } })) });
  const items = parseItems(JSON.parse(readFileSync(resolve('../sdk/src/shards/pastel-plain/data/items.json'), 'utf8')));
  const iron = items.rows.find(row => row.id === 'weapon.sword-iron'); if (iron?.kind !== 'weapon') throw new Error('Missing original iron row');
  source.items = parseItems({ ...source.items, rows: [{ ...iron, profile: IRON_MELEE_PROFILE }], loadout: { ...source.items.loadout, primary: iron.id } });
  return parseShardfile(source);
}
test('normal source expansion preserves original sword quantities, row identities, explicit policies and randomness', () => {
  const source = fixture(), before = JSON.stringify(source), random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Combat expansion drew RNG'); });
  try {
    const result = expandCombatSource(source, () => undefined), item = result.items.rows[0];
    if (item?.kind !== 'weapon' || item.profile?.family !== 'melee') throw new Error('Missing melee profile');
    expect(item.profile.moves.heavy.debris).toEqual({ default: { surface: 'sand', count: 10, atFeet: true, sparks: false }, overrides: [
      { target: 'own.shell', effect: { surface: 'shell', count: 9, atFeet: false, sparks: true } },
      { target: 'own.shell2', effect: { surface: 'shell', count: 9, atFeet: false, sparks: true } },
      { target: 'own.timber', effect: { surface: 'wood', count: 8, atFeet: false, sparks: true } },
    ] });
    expect(result.rows.species.map(row => row.capExempt)).toEqual([false, false, false, false]);
    expect(expandCombatSource(result, () => { throw new Error('Repeated combat expansion'); })).toBe(result);
    const species = source.rows.species[0], original = source.items.rows[0];
    if (species === undefined || original?.kind !== 'weapon' || original.profile?.family !== 'melee') throw new Error('Missing explicit control');
    species.capExempt = true; original.profile.moves.heavy.debris = { default: { surface: 'wood', count: 1, atFeet: false, sparks: false } };
    const explicit = expandCombatSource(source, () => undefined), weapon = explicit.items.rows[0];
    expect(explicit.rows.species[0]?.capExempt).toBe(true);
    expect(weapon?.kind === 'weapon' ? weapon.profile?.family === 'melee' ? weapon.profile.moves.heavy.debris : undefined : undefined).toEqual(original.profile.moves.heavy.debris);
    delete species.capExempt; delete original.profile.moves.heavy.debris; expect(JSON.stringify(source)).toBe(before);
  } finally { random.mockRestore(); }
});
test('normal SDK and handwritten source builds emit the same complete admitted combat declarations', async () => {
  const root = fixtureRoot('combat-source-'), warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const source = fixture(), text = JSON.stringify(source);
    writeFileSync(resolve(root, 'data.json'), text);
    writeFileSync(resolve(root, 'shard.config.ts'), "import input from './data.json' with { type: 'json' };\nexport default input;\n");
    await buildProject(root, resolve(root, 'built'), { client: null });
    const built = validateOutputProduct(resolve(root, 'built'));
    writeOutputProduct(source, new Map(), resolve(root, 'handwritten'));
    const settled = settleHandwrittenCreatureLayers(resolve(root, 'handwritten'), resolve(root, 'settled'));
    expect(settled.shard.rows.species).toEqual(built.shard.rows.species); expect(settled.shard.items).toEqual(built.shard.items);
    expect(readFileSync(resolve(root, 'data.json'), 'utf8')).toBe(text);
  } finally { warning.mockRestore(); rmSync(root, { recursive: true, force: true }); }
});

// FORMAT-PRUNE FP20: the species-program family is retired (the engine refuses it at admission, engine b75b5f57d); the
// native hunt expansion and its native contact roster went with it, so a hand-written product naming one is refused.
test('a hand-written product with a native species program is refused at build, naming the section (FP20)', () => {
  const root = fixtureRoot('combat-native-retired-');
  try {
    const metadata = {page: [], native: [], hunt: {limit: 8, player: 'host', fight: {capExempt: ['crab']}, bands: {states: [], legacyKinds: []}, hit: {namespace: 'creature', tags: []}}};
    writeOutputProduct(fixture(), new Map(), resolve(root, 'source'), {platform: emitPlatformSections(new Map([['actors/species-programs', metadata]]))});
    expect(() => settleHandwrittenCreatureLayers(resolve(root, 'source'), resolve(root, 'settled'))).toThrow('Section actors/species-programs is retired (FORMAT-PRUNE FP20)');
  } finally {rmSync(root, {recursive: true, force: true});}
});

test('ordinary cap compilation keeps conditional request tags and authored overrides', () => {
  const source = fixture();
  const metadata = JSON.parse(readFileSync(resolve('../sdk/src/shards/pastel-plain/manifest.json'), 'utf8'));
  source.manifest = { ...metadata, fight: { capExempt: ['crab', 'state.rage', 'effect.hot'] } };
  const first = source.rows.species[0], second = source.rows.species[1];
  if (first === undefined || second === undefined) throw new Error('Missing explicit controls');
  first.capExempt = true; second.capExempt = false;
  const admitted = parseShardfile(source), before = JSON.stringify(admitted);
  const result = expandCombatSource(admitted, () => undefined);
  expect(result.rows.species.map(row => row.capExempt)).toEqual([true, false, undefined, undefined]);
  expect(result.manifest?.fight?.capExemptTags).toEqual(['creature.crab', 'state.rage', 'creature.state.rage', 'effect.hot', 'creature.effect.hot']);
  expect(JSON.stringify(admitted)).toBe(before);
  expect(expandCombatSource(result, () => { throw new Error('Repeated policy expansion'); })).toBe(result);
});
