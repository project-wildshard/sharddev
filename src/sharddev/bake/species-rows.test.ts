import { expect, test } from 'vitest';
import { deriveSpecies } from '@wildshard/engine/ai/species';
import { BOAR } from '@wildshard/engine/game/systems/species/boar';
import { BEAR } from '@wildshard/engine/game/systems/species/bear';
import { bakeSpecies, commonSpeciesRows, deriveSpeciesRows } from './species';

test('shared author species preserve every original gameplay field and ordered variant', () => {
  expect(commonSpeciesRows('boar', 'author.boar')).toEqual(bakeSpecies(BOAR, 'author.boar'));
  expect(commonSpeciesRows('bear', 'author.bear')).toEqual(bakeSpecies(BEAR, 'author.bear'));
  const before = commonSpeciesRows('boar', 'author.boar'), copy = commonSpeciesRows('boar', 'author.boar');
  before.variants.reverse();
  if (before.tuning !== undefined) before.tuning.hp = 1;
  expect(copy).toEqual(bakeSpecies(BOAR, 'author.boar'));
});

test('derived author fields retain complete predecessor tuning and strict admission', () => {
  const parent = commonSpeciesRows('boar', BOAR.id);
  if (parent.tuning === undefined) throw new Error('Original boar has no tuning');
  const patch = { id: 'author.thrall', tuning: { ...parent.tuning, hp: 350 } };
  expect(deriveSpeciesRows(parent, patch)).toEqual(bakeSpecies(deriveSpecies(BOAR, patch), patch.id));
  expect(parent).toEqual(bakeSpecies(BOAR, BOAR.id));
  expect(() => deriveSpeciesRows(parent, { id: 'author.invalid', walkSpeed: Number.NaN })).toThrow();
});
