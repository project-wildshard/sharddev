import { expandNativeHuntSource } from '@wildshard/sdk/internal/nativeHuntSource';
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
import { readSpeciesPrograms } from '@wildshard/format/speciesPrograms';
import { hashImmutableBytes } from '@wildshard/sdk/immutable';
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

test('original Driftwood native swords declare complete contact effects by their native identities', () => {
  const frozen = JSON.parse(readFileSync(resolve('../sdk/test/fixtures/driftwood-native-combat.json'), 'utf8')) as { sections: { name: string; hash: string; bytes: number; wire: string }[] };
  const sections = new Map<string, unknown>();
  for (const row of frozen.sections) {
    const bytes = new TextEncoder().encode(row.wire);
    expect(bytes.length).toBe(row.bytes); expect(hashImmutableBytes(bytes)).toBe(row.hash);
    sections.set(row.name, JSON.parse(row.wire));
  }
  const source = emptyShardfile({ slug: 'native-combat', name: 'Native combat', author: 'Test', saveRevision: 1, seed: 17 });
  const payload = sections.get('combat/items') as { items: unknown };
  source.items = parseItems(payload.items);
  const native = readSpeciesPrograms(sections.get('actors/species-programs'));
  expect(native.program?.species.filter(row => row.kind === 'crab' || row.kind === 'sailor').map(row => row.id)).toEqual(['creature.crab', 'creature.sailor']);
  const before = JSON.stringify(source.items), warnings: string[] = [];
  const expanded = expandCombatSource(source, message => { warnings.push(message); }, sections);
  for (const item of expanded.items.rows) {
    if (item.kind !== 'weapon' || item.profile?.family !== 'melee') continue;
    for (const move of [...item.profile.moves.combo, item.profile.moves.heavy]) {
      expect(move.debris).toEqual({default: {surface: 'sand', count: 10, atFeet: true, sparks: false}, overrides: [
        {target: 'creature.crab', effect: {surface: 'shell', count: 9, atFeet: false, sparks: true}},
        {target: 'creature.sailor', effect: {surface: 'wood', count: 8, atFeet: false, sparks: true}},
      ]});
    }
  }
  expect(JSON.stringify(source.items)).toBe(before);
  expect(warnings.join(' ')).not.toContain('retained native');
});

test('handwritten native declarations emit explicit effects and cap flags without source mutation', () => {
  const root = fixtureRoot('combat-native-handwritten-'), warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const source = fixture();
    const metadata = {page: [], native: [{id: 'native.shell', kind: 'crab', label: 'Native shell', variants: [{id: 'plain', label: 'Plain', rarity: 'common', weight: 1, scale: [1, 1]}]}],
      hunt: {limit: 8, player: 'host', fight: {capExempt: ['crab']}, bands: {states: [], legacyKinds: []}, hit: {namespace: 'creature', tags: []}}};
    writeOutputProduct(source, new Map(), resolve(root, 'source'), {platform: emitPlatformSections(new Map([['actors/species-programs', metadata]]))});
    const original = readFileSync(resolve(root, 'source/sections/actors/species-programs.json'), 'utf8');
    const settled = settleHandwrittenCreatureLayers(resolve(root, 'source'), resolve(root, 'settled'));
    const native = readSpeciesPrograms(settled.sections.get('actors/species-programs'));
    expect(native.native[0]?.capExempt).toBeUndefined();
    expect(native.hunt?.fight.capExemptTags).toEqual(['creature.crab']);
    const item = settled.shard.items.rows[0];
    if (item?.kind !== 'weapon' || item.profile?.family !== 'melee') throw new Error('Missing original sword');
    expect(item.profile.moves.heavy.debris?.overrides).toContainEqual({target: 'native.shell', effect: {surface: 'shell', count: 9, atFeet: false, sparks: true}});
    expect(readFileSync(resolve(root, 'source/sections/actors/species-programs.json'), 'utf8')).toBe(original);
  } finally {warning.mockRestore();rmSync(root, {recursive: true, force: true});}
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

test('the original captain keeps the level cap exemption when native hunt has no cap list', () => {
  const frozen = JSON.parse(readFileSync(resolve('../sdk/test/fixtures/driftwood-native-combat.json'), 'utf8')) as { sections: { name: string; hash: string; bytes: number; wire: string }[] };
  const row = frozen.sections.find(section => section.name === 'actors/species-programs');
  if (row === undefined) throw new Error('Missing immutable native fixture');
  const bytes = new TextEncoder().encode(row.wire);
  expect(bytes.length).toBe(row.bytes); expect(hashImmutableBytes(bytes)).toBe(row.hash);
  const native = readSpeciesPrograms(expandNativeHuntSource(JSON.parse(row.wire), () => undefined));
  expect(native.hunt?.fight.capExempt).toBeUndefined();
  const captain = native.program?.species.find(species => species.kind === 'captain');
  expect(captain).toBeDefined(); expect(captain?.capExempt).toBeUndefined();
  const source = fixture(), metadata = JSON.parse(readFileSync(resolve('../sdk/src/shards/pastel-plain/manifest.json'), 'utf8'));
  source.manifest = { ...metadata, fight: { maxHitDamage: 20, capExempt: ['captain'] } };
  const sections = new Map([['actors/species-programs', native]]);
  const result = expandCombatSource(parseShardfile(source, sections), () => undefined, sections);
  expect(result.manifest?.fight?.capExemptTags).toEqual(['creature.captain']);
  expect(result.manifest?.fight?.maxHitDamage).toBe(20);
  expect(captain?.capExempt).toBeUndefined();
});
