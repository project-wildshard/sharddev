// oxlint-disable-next-line import/no-nodejs-modules -- The test reads the bodies' committed head and captain.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { speciesDef } from '../src/shared/engine/entities/species/registry';
import { speciesWithLook, type SpeciesLook } from '../src/client/engine/entities/species/look';
import { HullLookBook } from '../src/client/game/looks/speciesBook';
import { BOAR_LOOK } from '../src/client/game/systems/species/view/boar';
import { BEAR_LOOK } from '../src/client/game/systems/species/view/bear';
import { BOAR } from '../src/client/game/systems/species/boar';
import { BEAR } from '../src/client/game/systems/species/bear';
import { PINE_BOAR } from '../src/shards/pine-hollow/generators/speciesRows';
import { SPECIES_LOOKS } from '../src/shards/pine-hollow/generators/nativeView';
import { driftwoodCreatureBodyBank } from '../src/shards/driftwood-isle/generators/creatureBodyBank';
import { installWorldFixture } from './fixtures/worldSetup';

await installWorldFixture();

// G602: Pine's boar and bear resolve through the hull book's 'registered' base (the kit looks the page registers), which
// lends look fields only. Before, the book read the kit looks directly; the species each page registers must not change.
const before = (kit: SpeciesLook, kind: string, row: { readonly variants?: Readonly<Record<string, object>> }): SpeciesLook =>
  ({ ...kit, id: `pine.look.${kind}`, species: `pine.${kind}`, kind, variants: { ...kit.variants, ...row.variants } });
const pick = (species: ReturnType<typeof speciesWithLook>) => ({ think: species.think, act: species.act, damageMul: species.damageMul,
  build: species.build, fur: species.fur, pose: species.pose, rigContract: species.rigContract, variants: species.variants.map(variant => ({ id: variant.id, tint: variant.tint, traits: variant.traits })) });

test('Pine boar and bear keep their looks and their rows decide think, act and damage', () => {
  const book = new HullLookBook(SPECIES_LOOKS);
  for (const [kind, kit, row] of [['boar', BOAR_LOOK, PINE_BOAR], ['bear', BEAR_LOOK, BEAR]] as const) {
    const look = book.look(kind), source = SPECIES_LOOKS.rows.find(entry => entry.kind === kind);
    if (source === undefined) throw new Error(`Missing Pine ${kind} row`);
    expect(look).not.toHaveProperty('think'); expect(look).not.toHaveProperty('act'); expect(look).not.toHaveProperty('damageMul');
    expect(look.build).toBe(kit.build); expect(look.fur).toEqual(kit.fur); expect(look.pose).toEqual(kit.pose);
    const now = pick(speciesWithLook(row, look)), then = pick(speciesWithLook(row, before(kit, kind, source)));
    expect(now).toEqual(then);
    expect(now.think).toBe(then.think); expect(now.act).toBe(then.act); expect(now.damageMul).toBe(then.damageMul);
  }
  expect(BOAR.kind).toBe('boar');
});

test('Driftwood fauna boar and bear keep their kit look fields on packed bodies and lend no gameplay', async () => {
  const bank = await driftwoodCreatureBodyBank(url => new Uint8Array(readFileSync(`public${url}`))), fauna = bank.rows;
  const book = new HullLookBook({ ...fauna.fauna, body: { file: fauna.file, bytes: fauna.bytes, bodies: fauna.bodies } },
    { file: name => name === fauna.file ? Promise.resolve(bank.bin) : Promise.reject(new Error(`Unknown product file ${name}`)) });
  for (const [kind, kit] of [['boar', BOAR_LOOK], ['bear', BEAR_LOOK]] as const) {
    const look = book.look(kind);
    expect(look).not.toHaveProperty('think'); expect(look).not.toHaveProperty('damageMul');
    expect(look.fur).toEqual(kit.fur); expect(look.pose).toEqual(kit.pose); expect(look.rigContract).toEqual(kit.rigContract);
    expect(look.build).not.toBe(kit.build);
  }
});

test('the antler king keeps its own think and damage; its look lends none', () => {
  const book = new HullLookBook(SPECIES_LOOKS);
  book.registerDerived();
  const king = speciesDef('antler-king'), look = book.look('antler-king');
  expect(look).not.toHaveProperty('think'); expect(look).not.toHaveProperty('damageMul');
  // the king's registration carries its own think and damage; a look merges under it and now lends neither
  expect(typeof king.think).toBe('function'); expect(typeof king.damageMul).toBe('function');
  expect({ ...look, ...king }.think).toBe(king.think); expect({ ...look, ...king }.damageMul).toBe(king.damageMul);
});
