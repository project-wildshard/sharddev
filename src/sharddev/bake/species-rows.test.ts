import { expect, test, vi } from 'vitest';
import { deriveSpecies } from '@wildshard/engine/ai/species';
import { BOAR } from '@wildshard/engine/game/systems/species/boar';
import { BEAR } from '@wildshard/engine/game/systems/species/bear';
import { bakeSpecies, commonSpeciesRows, deriveSpeciesRows } from '@wildshard/kit/bake/species';
import deer from '@wildshard/kit/content/tuning/deer.json' with { type: 'json' };

const boarHarvest = [
  { item: 'boar-meat', count: 1 },
  { item: 'boar-hide', count: 1 },
  { item: 'boar-tusk', count: 1, variants: ['boar', 'black', 'big', 'scarback', 'ironhide'] },
];
const bearHarvest = [{ item: 'bear-pelt', count: 1 }, { item: 'bear-claw', count: 1 }];

test('shared author species preserve every original gameplay field and ordered variant', () => {
  expect(commonSpeciesRows('boar', 'author.boar')).toEqual({ ...bakeSpecies(BOAR, 'author.boar'), harvest: boarHarvest });
  expect(commonSpeciesRows('bear', 'author.bear')).toEqual({ ...bakeSpecies(BEAR, 'author.bear'), harvest: bearHarvest });
  const before = commonSpeciesRows('boar', 'author.boar'), copy = commonSpeciesRows('boar', 'author.boar');
  before.variants.reverse();
  if (before.tuning !== undefined) before.tuning.hp = 1;
  expect(copy).toEqual({ ...bakeSpecies(BOAR, 'author.boar'), harvest: boarHarvest });
});

test('derived author fields retain complete predecessor tuning and strict admission', () => {
  const parent = commonSpeciesRows('boar', BOAR.id);
  if (parent.tuning === undefined) throw new Error('Original boar has no tuning');
  const patch = { id: 'author.thrall', tuning: { ...parent.tuning, hp: 350 } };
  expect(deriveSpeciesRows(parent, patch)).toEqual({ ...bakeSpecies(deriveSpecies(BOAR, patch), patch.id), harvest: boarHarvest });
  expect(parent).toEqual({ ...bakeSpecies(BOAR, BOAR.id), harvest: boarHarvest });
  expect(() => deriveSpeciesRows(parent, { id: 'author.invalid', walkSpeed: Number.NaN })).toThrow();
});

test('old native source copies exact grazer numbers before leaving the author build', () => {
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const source = { ...BOAR, kind: 'deer', aggressive: false };
    delete source.tuning;
    const built = bakeSpecies(source, 'author.grazer');
    expect(built.tuning).toEqual(deer);
    expect(built.variants).toEqual(BOAR.variants);
    expect(source.tuning).toBeUndefined();
    expect(warnings.mock.calls).toHaveLength(1);
    expect(warnings.mock.calls[0]?.[0]).toContain('copied kit hunting tuning');
    expect(bakeSpecies(built, built.id)).toEqual(built);
    expect(warnings.mock.calls).toHaveLength(1);
    expect(bakeSpecies({ ...source, kind: 'own.policy' }, 'author.custom').tuning).toBeUndefined();
  } finally { warnings.mockRestore(); }
});
