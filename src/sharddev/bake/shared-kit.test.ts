import { expect, test } from 'vitest';
import { Vector3, type BufferGeometry } from 'three';
import { forearm, gloveFist, riderArm } from '@wildshard/engine/player/firstPersonArms';
import { SWORD_WOOD } from '@wildshard/engine/game/weapons/starterMeleeProfile';
import STARTER_BOW from '@wildshard/engine/game/weapons/starterBow.json' with { type: 'json' };
import PICKUPS from '@wildshard/engine/game/data/pickupCatalogue' with { type: 'json' };
import { TREE_SPECS } from '@wildshard/engine/world/forest/treeSpec';
import { BARREL_BODY } from '@wildshard/engine/world/interact/barrel';
import { sharedMeleeAuthorBase } from '@wildshard/kit/weapons/meleeProfile';
import { sharedBowAuthorBase } from '@wildshard/kit/weapons/bowProfile';
import { sharedPickupCatalogue } from '@wildshard/kit/bake/specimenCatalogue';
import { forestDefaultTreeSpecs } from './forest';
import { puzzleBarrelBody } from '@wildshard/kit/bake/nativeInteractionFacts';
import { bakeGloveFist, bakeRiderArm, bakeForearm } from '@wildshard/kit/bake/riderArms';

const style: Parameters<typeof gloveFist>[0] = {
  leather: 0x785534, leatherLight: 0x887455, leatherDark: 0x291808, leatherEdge: 0x9a8877,
  thread: [0.2, 0.3, 0.5], jade: 0x226644, jadeDark: 0x112211, fleece: 0xddeeff,
  fleeceShade: 0x888888, fleeceDeep: 0x444444, wool: 0x667788, woolShade: 0x334455,
  red: [0.8, 0.1, 0.1], redDeep: 0x330000, redLine: 0xff0000, gold: 0xffdc40,
};
function geometry(actual: BufferGeometry, expected: BufferGeometry): void {
  try {
    expect(actual.index?.array).toEqual(expected.index?.array);
    expect(Object.keys(actual.attributes)).toEqual(Object.keys(expected.attributes));
    for (const key of Object.keys(expected.attributes)) {
      const a = actual.getAttribute(key), b = expected.getAttribute(key);
      expect(a.itemSize).toBe(b.itemSize); expect(a.normalized).toBe(b.normalized);
      expect(a.array).toEqual(b.array);
    }
    expect(actual.boundingSphere).toEqual(expected.boundingSphere);
  } finally { actual.dispose(); expected.dispose(); }
}

test('kit shared tables and rich sword poses equal every original field', () => {
  expect(sharedMeleeAuthorBase()).toEqual(SWORD_WOOD);
  expect(sharedBowAuthorBase()).toEqual(STARTER_BOW);
  expect(sharedPickupCatalogue()).toEqual(PICKUPS);
  expect(forestDefaultTreeSpecs()).toEqual(TREE_SPECS);
  expect(puzzleBarrelBody()).toEqual(BARREL_BODY);
  const changed = sharedMeleeAuthorBase();
  changed.moves?.rest.pos.set(0, 0, 0);
  changed.moves?.combo[0]?.trail.color.setRGB(0, 0, 0);
  changed.sweep.extensions = [];
  expect(sharedMeleeAuthorBase()).toEqual(SWORD_WOOD);
});

test('kit gloves and arms retain every original geometry byte and attachment frame', () => {
  for (const mirror of [false, true]) for (const R of [0.009, 0.02, 0.04]) {
    const opts = { R, mirror, thumbRing: true, curl: 0.6, thumbCurl: 0.4 };
    const actual = bakeGloveFist(style, opts), expected = gloveFist(style, opts);
    expect(actual.wrist).toEqual(expected.wrist);
    expect(actual.wristDir).toEqual(expected.wristDir);
    expect(actual.hook).toEqual(expected.hook);
    geometry(actual.geometry, expected.geometry);
    for (const part of ['fist', 'arm', 'both'] as const) {
      const dir = new Vector3(0.2, 0.3, -0.8);
      geometry(bakeForearm(style, dir, 0.7, R, { mirror, part }), forearm(style, dir, 0.7, R, { mirror, part }));
    }
  }
  for (const length of [0.7, 0.9]) for (const seed of [1, 913]) {
    geometry(bakeRiderArm(style, length, seed), riderArm(style, length, seed));
  }
});
