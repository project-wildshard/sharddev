import { expect, test } from 'vitest';
import { armPalette } from '@wildshard/engine/player/firstPersonArms';
import { lin } from '@wildshard/engine/math/color';
import { bakeArmColour, bakeArmPalette, type bakeGloveFist } from './riderArms';

const style: Parameters<typeof bakeGloveFist>[0] = {
  leather: 0x785534, leatherLight: 0x887455, leatherDark: 0x291808, leatherEdge: 0x9a8877,
  thread: [0.2, 0.3, 0.5], jade: 0x226644, jadeDark: 0x112211, fleece: 0xddeeff,
  fleeceShade: 0x888888, fleeceDeep: 0x444444, wool: 0x667788, woolShade: 0x334455,
  red: [0.8, 0.1, 0.1], redDeep: 0x330000, redLine: 0xff0000, gold: 0xffdc40,
};

test('author arm colours preserve exact native conversion and every ordered palette channel', () => {
  for (const value of [0, 0xffffff, 0x705231, 0x010203, 0xff1a0f]) expect(bakeArmColour(value)).toEqual(lin(value));
  const actual = bakeArmPalette(style), expected = armPalette(style);
  expect(actual).toEqual(expected);
  expect(Object.keys(actual)).toEqual(Object.keys(expected));
});

test('one author palette cannot mutate another recipe or its linear input triples', () => {
  const changed = bakeArmPalette(style), retained = bakeArmPalette(style);
  changed.leather.setRGB(0, 0, 0);
  changed.thread.setRGB(1, 1, 1);
  expect(retained).toEqual(armPalette(style));
  expect(style.thread).toEqual([0.2, 0.3, 0.5]);
});
