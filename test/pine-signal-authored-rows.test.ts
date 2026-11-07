import { expect, test } from 'vitest';
import * as v from 'valibot';
import sky from '../src/shards/pine-hollow/data/sky.json' with { type: 'json' };
import { KEYED_SKY } from '@wildshard/format/keyedSky';
import { keyedSkyDay } from '../src/shared/game/looks/keyedSkyClock';
import { signalFireGraphs } from '../src/shards/sunscar-dunes/generators/fireLook';
import { signalProductRows } from './fixtures/sunscar-source-program';

const FIRE_GRAPHS = signalFireGraphs('5fe421ef5db33fc737043742feea77ad24105299c23e120b62c39e206e331b0a');

test('the keyed clock consumes the authored sky JSON', () => {
  expect(keyedSkyDay(sky).style).toEqual(sky);
});

test('the clock boundary refuses malformed tuples and weather field kinds', () => {
  expect(v.safeParse(KEYED_SKY, { ...sky, dusk: [0.06] }).success).toBe(false);
  expect(v.safeParse(KEYED_SKY, { ...sky, overcast: [{ op: 'grey', key: 'lightI', by: 0.6, tint: [1, 1, 1] }] }).success).toBe(false);
});

test('the admitted Signal product contains the complete offline fire graphs', () => {
  const product = signalProductRows();
  for (const [id, graph] of Object.entries(FIRE_GRAPHS)) {
    expect(product.look.materials[id]).toEqual({ family: 'graph', graph });
  }
});
