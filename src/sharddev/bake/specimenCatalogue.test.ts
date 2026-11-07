import { expect, test } from 'vitest';
import { parse } from 'valibot';
import { PickupCatalogueSchema } from '@wildshard/format/specimenCatalogue';
import original from '@wildshard/engine/game/data/pickupCatalogue' with { type: 'json' };
import { sharedPickupCatalogue } from './specimenCatalogue';

test('offline pickup metadata preserves the complete shared catalogue', () => {
  expect(sharedPickupCatalogue()).toEqual(parse(PickupCatalogueSchema, original));
});

test('each recipe owns its admitted pickup rows', () => {
  const changed = sharedPickupCatalogue(), independent = sharedPickupCatalogue();
  changed.geometries.reverse();
  changed.looks.length = 0;
  expect(independent).toEqual(parse(PickupCatalogueSchema, original));
  expect(sharedPickupCatalogue()).toEqual(independent);
});
