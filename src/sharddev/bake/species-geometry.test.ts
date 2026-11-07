import { expect, expectTypeOf, test } from 'vitest';
import { SphereGeometry, type BufferGeometry } from 'three';
import { Rng } from '../random';
import { Rng as NativeRng } from '@wildshard/engine/core/rng';
import { loft as nativeLoft, skinPlain as nativeSkin, S as nativeStation, isLowPoly } from '@wildshard/engine/entities/species/loft';
import { BEAR_LOOK } from '@wildshard/engine/game/systems/species/view/bear';
import { BOAR_LOOK } from '@wildshard/engine/game/systems/species/view/boar';
import type { AnimalDims as NativeDims, AnimalSpecies as NativeBody, BoneDef as NativeBone } from '@wildshard/engine/entities/species/registry';
import { bakeCommonBody, commonBodyVariants, loft, skinPlain, S, withSpeciesGeometry, type AnimalDims, type AnimalSpecies, type BoneDef, type Paint } from './species';

test('owned species geometry types retain the complete native data contract', () => {
  expectTypeOf<AnimalDims>().toEqualTypeOf<NativeDims>();
  expectTypeOf<AnimalSpecies>().toEqualTypeOf<NativeBody>();
  expectTypeOf<BoneDef>().toEqualTypeOf<NativeBone>();
});

function expectGeometry(actual: BufferGeometry, expected: BufferGeometry): void {
  expect(actual.index?.array).toEqual(expected.index?.array);
  expect(Object.keys(actual.attributes)).toEqual(Object.keys(expected.attributes));
  for (const name of Object.keys(expected.attributes)) {
    const a = actual.getAttribute(name), b = expected.getAttribute(name);
    expect(a.itemSize).toBe(b.itemSize);
    expect(a.normalized).toBe(b.normalized);
    expect(a.array).toEqual(b.array);
  }
  actual.dispose(); expected.dispose();
}

const paint: Paint = (out, x, y, z, nx, ny, nz, _part, t, a) => { out.setRGB(x + nx, y + ny + t, z + nz + a); };

test('offline lofts and rigid skins retain every original typed channel', () => {
  for (const frame of ['x', 'z'] as const) for (const cap of [false, true]) {
    const compare = (): void => {
      const stations = [S(0, 0, 0, 0.2, 0.3, 0), S(0.1, 1, 0.5, 0.4, 0.2, 0, 1, 0.75)];
      const original = [nativeStation(0, 0, 0, 0.2, 0.3, 0), nativeStation(0.1, 1, 0.5, 0.4, 0.2, 0, 1, 0.75)];
      expectGeometry(loft(stations, 16, 'body', paint, cap, !cap, frame), nativeLoft(original, 16, 'body', paint, cap, !cap, frame));
      expectGeometry(skinPlain(new SphereGeometry(0.2, 6, 4), 2, 'eye', paint), nativeSkin(new SphereGeometry(0.2, 6, 4), 2, 'eye', paint));
    };
    compare();
    withSpeciesGeometry({}, compare);
  }
});

test('common offline bodies preserve original parts and RNG continuation', () => {
  withSpeciesGeometry({ boar: () => paint, bear: () => paint }, () => {
    for (const kind of ['boar', 'bear'] as const) for (const variant of commonBodyVariants(kind)) {
      const rng = new Rng(841), originalRng = new NativeRng(841);
      const actual = bakeCommonBody(kind, variant, rng.snapshot());
      const original = (kind === 'boar' ? BOAR_LOOK : BEAR_LOOK).build(variant, originalRng);
      expect(actual.random).toEqual(originalRng.snapshot());
      expect(actual.body.bones).toEqual(original.bones);
      expect(actual.body.dims).toEqual(original.dims);
      for (const key of ['furParts', 'hardParts', 'eyeParts'] as const) {
        expect(actual.body[key]).toHaveLength(original[key].length);
        actual.body[key].forEach((part, i) => {
          const expected = original[key][i];
          if (expected === undefined) throw new Error('Missing original body part');
          expectGeometry(part, expected);
        });
      }
    }
  });
});

test('failed offline recipes release the native low-poly context', () => {
  expect(() => withSpeciesGeometry({}, () => { throw new Error('recipe refused'); })).toThrow('recipe refused');
  expect(isLowPoly()).toBe(false);
});
