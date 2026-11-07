import { expect, expectTypeOf, test } from 'vitest';
import * as v from 'valibot';
import { authorFormatSchema } from '../src/sharddev/formatJsonSchema';
import type { modelSceneSourceFile } from '../src/sharddev/worldScenes';
import { hashImmutableBytes } from '../src/sdk/immutable';
import { SpeciesLookBookSchema } from '@wildshard/format/speciesBookRows';
import { PaintedLookSchema } from '@wildshard/format/paintedLook';
import { MaterialsSchema } from '@wildshard/format/materials';
import type { SpeciesDef } from '../src/shared/engine/entities/species/registry';
import type { HdLookRow } from '../src/client/game/plugin/geometry';
import type { SurfaceLook, FirelightLook, ViewerLightLook } from '@wildshard/format/surfaceLooks';
import { skyPaintedPresentation, SKY_PAINTED_GRAPHS, SKY_PAINTED_ATTRIBUTE_SOURCES } from '../src/shards/far-reach/generators/paintedLook';
import * as surfaces from '../src/shards/sunscar-dunes/generators/rows/surfaces';
import { bodySpecies } from '../src/shards/nalati-grasslands/generators/speciesRows';
import species from '../src/shards/nalati-grasslands/data/speciesLooks.json' with { type: 'json' };
import original from './fixtures/typed-look-authors-original.json' with { type: 'json' };

function observe(value: unknown): { bytes: number; hash: string } {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return { bytes: bytes.byteLength, hash: hashImmutableBytes(bytes) };
}

test('species and material selector objects retain exact defining identity and complete types', () => {
  const book = authorFormatSchema('speciesBookRows.SpeciesLookBookSchema');
  const look = authorFormatSchema('paintedLook.PaintedLookSchema'), materials = authorFormatSchema('materials.MaterialsSchema');
  expectTypeOf<typeof book>().toEqualTypeOf<typeof SpeciesLookBookSchema>();
  expectTypeOf<typeof look>().toEqualTypeOf<typeof PaintedLookSchema>();
  expectTypeOf<typeof materials>().toEqualTypeOf<typeof MaterialsSchema>();
  expect(book).toBe(SpeciesLookBookSchema); expect(look).toBe(PaintedLookSchema); expect(materials).toBe(MaterialsSchema);
  expect(v.safeParse(book, { slug: 'invalid', body: {}, rows: [{ metadata: {} }] })).toEqual(v.safeParse(SpeciesLookBookSchema, { slug: 'invalid', body: {}, rows: [{ metadata: {} }] }));
  expect(v.safeParse(look, { look: { sun: { intensity: Number.NaN } } }).success).toBe(false);
  expect(v.safeParse(materials, { bad: { family: 'missing' } }).success).toBe(false);
});

test('derived author ports keep full species gameplay variants and native surface discriminants', () => {
  type Hero = NonNullable<Parameters<typeof modelSceneSourceFile>[1]['rows']['hdLooks'][string]>;
  type Surface = NonNullable<Hero['surface']>[number];
  expectTypeOf<Hero>().toEqualTypeOf<HdLookRow>();
  expectTypeOf<Surface>().toEqualTypeOf<SurfaceLook>();
  expectTypeOf<Extract<Surface, { kind: 'firelight' }>>().toEqualTypeOf<FirelightLook>();
  expectTypeOf<Extract<Surface, { kind: 'viewerLight' }>>().toEqualTypeOf<ViewerLightLook>();
  expectTypeOf<ReturnType<typeof bodySpecies>>().toEqualTypeOf<Pick<SpeciesDef, 'kind' | 'label' | 'variants' | 'spawnOnly' | 'pose' | 'gait'>>();
  expect(() => bodySpecies('missing-author')).toThrow('Missing body species row');
});

test('all original Sky presentation, graph and attribute declaration bytes remain unchanged', () => {
  expect(observe({ presentation: skyPaintedPresentation(), graphs: SKY_PAINTED_GRAPHS, attributes: SKY_PAINTED_ATTRIBUTE_SOURCES })).toEqual(original.sky);
});

test('all original Sunscar hero/surface declaration bytes remain unchanged', () => {
  expect(observe(Object.fromEntries(Object.entries(surfaces).sort(([a], [b]) => a.localeCompare(b))))).toEqual(original.sunscar);
});

test('every original Nalati variant, modifier, pose and gait declaration byte remains unchanged', () => {
  expect(observe(species.map(row => bodySpecies(row.metadata.kind)))).toEqual(original.species);
});
