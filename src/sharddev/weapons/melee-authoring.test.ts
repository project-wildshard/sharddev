import { expect, test } from 'vitest';
import { key } from '@wildshard/engine/game/weapons/starterMoves';
import { lin } from '@wildshard/engine/math/color';
import { Rng } from '../random';
import { meleeKey, meleeColour } from './meleeProfile';

test('author melee keys retain every original quaternion and position component', () => {
  const rng = new Rng(412);
  for (let i = 0; i < 100; i++) {
    const args: [number, number, number, number, number, number, number, number] =
      [rng.next(), rng.next(), rng.next(), rng.next(), rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1), rng.range(-4, 4)];
    const actual = meleeKey(...args), original = key(...args);
    expect(actual.t).toBe(original.t);
    expect(actual.pos.toArray()).toEqual(original.pos.toArray());
    expect(actual.q.toArray()).toEqual(original.q.toArray());
  }
});

test('author melee paint retains original linear colour and gain arithmetic', () => {
  for (const hex of [0, 0xffffff, 0xf4ece2, 0x3a2216, 0xf2c25a]) for (const gain of [0, 0.5, 1, 2])
    expect(meleeColour(hex, gain).toArray()).toEqual(lin(hex, gain).toArray());
});
