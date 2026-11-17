import { expect, expectTypeOf, test } from 'vitest';
import { SphereGeometry, type BufferGeometry } from 'three';
import { Rng } from '../random';
import { Rng as NativeRng } from '@wildshard/engine/core/rng';
import { loft as nativeLoft, skinPlain as nativeSkin, S as nativeStation, isLowPoly, setLowPoly, registerToonPaint } from '@wildshard/engine/entities/species/loft';
import { BEAR_LOOK } from '@wildshard/engine/game/systems/species/view/bear';
import { BOAR_LOOK } from '@wildshard/engine/game/systems/species/view/boar';
import type { AnimalDims as NativeDims, AnimalSpecies as NativeBody, BoneDef as NativeBone } from '@wildshard/engine/entities/species/registry';
import { bakeCommonBody, commonBodyVariants, withBodyGeometry,loft,skinPlain,S,type Paint,withSpeciesGeometry, type AnimalDims, type AnimalSpecies, type BoneDef } from '@wildshard/kit/bake/species';

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
    setLowPoly(true);
    try { withSpeciesGeometry({}, compare); } finally { setLowPoly(false); }
  }
});

test('kit bodies retain every original variant, typed channel, bone and random draw in both styles', () => {
  for (const custom of [false, true]) for (const low of [false, true]) {
    const paints = custom ? { boar: () => paint, bear: () => paint } : {};
    setLowPoly(low);
    // Native paint registration is independent of the kit context.
    for (const kind of ['boar', 'bear'] as const) {
      if (custom) registerToonPaint(kind, () => paint);
    }
    try {
      withBodyGeometry(low, paints, () => {
        for (const kind of ['boar', 'bear'] as const) for (const variant of commonBodyVariants(kind)) {
          const originalLook = kind === 'boar' ? BOAR_LOOK : BEAR_LOOK;
          expect(variant).toEqual({ id: variant.id, label: variant.id, weight: 1, rarity: 'common', scale: [1, 1], ...originalLook.variants?.[variant.id] });
          for (const seed of [0, 841, 0xffffffff]) {
            const rng = new Rng(seed), originalRng = new NativeRng(seed);
            const actual = bakeCommonBody(kind, variant, rng.snapshot());
            const original = originalLook.build(variant, originalRng);
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
        }
      });
    } finally { setLowPoly(false); }
  }
});

test('nested and failed kit recipes restore style and paint owners', () => {
  withBodyGeometry(true, { boar: () => paint }, () => {
    const variant = commonBodyVariants('boar')[0];
    if (variant === undefined) throw new Error('Missing boar variant');
    const before = bakeCommonBody('boar', variant, new Rng(1).snapshot());
    expect(() => withBodyGeometry(false, {}, () => { throw new Error('refused'); })).toThrow('refused');
    const after = bakeCommonBody('boar', variant, new Rng(1).snapshot());
    for (const key of ['furParts', 'hardParts', 'eyeParts'] as const) {
      before.body[key].forEach((part, i) => {
        const expected = after.body[key][i];
        if (expected === undefined) throw new Error('Missing body part');
        expectGeometry(part, expected);
      });
    }
  });
});

test('failed offline recipes release the native low-poly context', () => {
  expect(() => withSpeciesGeometry({}, () => { throw new Error('recipe refused'); })).toThrow('recipe refused');
  expect(isLowPoly()).toBe(false);
});
