import { expect, test } from 'vitest';
import { bakeSpecies } from '../src/sharddev/bake/species';
import { species } from '../src/sharddev/species';
import { readSpeciesPrograms, readSpeciesProgram } from '@wildshard/format/speciesPrograms';
import { PINE_SPECIES_PROGRAMS } from '../src/shards/pine-hollow/generators/speciesPrograms';
import { DRIFTWOOD_SPECIES_PROGRAMS } from '../src/shards/driftwood-isle/generators/speciesPrograms';
import { speciesWithLook } from '../src/client/engine/entities/species/look';
import { HullLookBook } from '../src/client/game/looks/speciesBook';
import { SPECIES_LOOKS } from '../src/shards/pine-hollow/generators/nativeView';
import { DRIFTWOOD_BOOK } from './fake/driftwoodLooks';
import { ISLAND_BOAR, ISLAND_BEAR } from '../src/shards/driftwood-isle/generators/faunaSpecies';
import { PINE_BOAR, PINE_SPECIES, pineDeer, pineElk } from '../src/shards/pine-hollow/generators/speciesRows';
import { speciesBrains } from '../src/sharddev/speciesBrains';
import { BOAR } from '../src/client/game/systems/species/boar';
import { installWorldFixture } from './fixtures/worldSetup';

await installWorldFixture();

test('both populations admit the same gameplay fields without visual or callback metadata', () => {
  const pine = readSpeciesPrograms(structuredClone(PINE_SPECIES_PROGRAMS));
  const island = readSpeciesPrograms(structuredClone(DRIFTWOOD_SPECIES_PROGRAMS));
  expect(pine.page.map(row => row.kind)).toEqual(['boar', 'bear', 'deer', 'elk']);
  expect(pine.native.map(row => row.kind)).toEqual(['deer', 'elk', 'boar', 'bear', 'antler-king']);
  expect(island.page).toEqual(island.native);
  expect(pine.native.find(row => row.kind === 'antler-king')?.aggressive).toBe(true);
  expect(pine.page[0]).toEqual(bakeSpecies(PINE_BOAR, PINE_BOAR.id));
  expect(species(pine.page[0])).toEqual(pine.page[0]);
  expect(pine.page[0]?.spawnOnly).toEqual(PINE_BOAR.spawnOnly);
  expect(island.native[0]?.variants.map(row => row.scale)).toEqual(BOAR.variants.map(row => row.scale));
  expect(() => readSpeciesPrograms({ page: [...pine.page, pine.page[0]], native: [] })).toThrow();
  expect(() => bakeSpecies({ ...PINE_BOAR, think: () => undefined }, PINE_BOAR.id)).toThrow('callback-free');
  expect(() => species({ ...pine.page[0], parent: PINE_BOAR })).toThrow();
});

// The gameplay bake strips tint/traits; the existing view must restore exactly the same factory variants.
test('both emitted populations keep the original resolved visual variants', () => {
  const pineBook = new HullLookBook(SPECIES_LOOKS);
  pineBook.registerDerived();
  const authored = [...PINE_SPECIES, pineDeer(), pineElk(), ISLAND_BOAR, ISLAND_BEAR];
  const programs = [...PINE_SPECIES_PROGRAMS.page, ...DRIFTWOOD_SPECIES_PROGRAMS.page];
  const looks = [...pineBook.looks, DRIFTWOOD_BOOK.look('boar'), DRIFTWOOD_BOOK.look('bear')];
  for (const [i, row] of programs.entries()) {
    const before = authored[i], look = looks.find(value => value.species === row.id);
    if (before === undefined || look === undefined) throw new Error(`Missing comparison: ${row.id}`);
    const old = speciesWithLook(before, look), current = speciesWithLook(row, look);
    expect(current.variants, row.id).toEqual(old.variants);
    expect(current.spawnOnly, row.id).toEqual(old.spawnOnly);
  }
});


test('published brain/body programs bind the existing owner and refuse executable or ambiguous rows', () => {
  const program = readSpeciesPrograms(structuredClone(DRIFTWOOD_SPECIES_PROGRAMS)).program;
  if (program === undefined) throw new Error('Missing emitted enemy program');
  expect(program.species.map(row => row.kind)).toEqual(['crab', 'monkey', 'sailor', 'captain']);
  const owner = speciesBrains(program.species, program.strikes, program.modules);
  expect([...owner.kinds]).toEqual(['crab', 'monkey', 'sailor', 'captain']);
  expect(() => owner.bind('captain')).toThrow('existing body authority');
  for (const kind of ['crab', 'sailor']) expect(typeof owner.bind(kind).act).toBe('function');
  expect(() => owner.bind('monkey')).toThrow('trusted native body adapter');
  expect(program.species[0]?.body?.kind).toBe('animal');
  expect(() => readSpeciesProgram({ ...program, species: [...program.species, program.species[0]] })).toThrow();
  expect(() => readSpeciesProgram({ ...program, strikes: [...program.strikes, program.strikes[0]] })).toThrow();
  expect(() => readSpeciesProgram({ ...program, modules: { unsafe: () => undefined } })).toThrow();
});
