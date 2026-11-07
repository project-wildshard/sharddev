import { beforeEach, expect, test } from 'vitest';
import * as v from 'valibot';
import { bindFlatTerrain } from '@wildshard/engine/test/terrain';
import { ForagerPopulation } from '../src/shared/engine/ai/ambientForager';
import { ForagerPopulationSchema, parseAmbientLife } from '@wildshard/format/ambientLife';
import { PINE_LIFE } from '../src/shards/pine-hollow/generators/ambientLife';
import marmots from '../src/shards/nalati-grasslands/data/marmotForager.json' with { type: 'json' };

beforeEach(() => bindFlatTerrain({ heightAt: () => 0, waterLevel: () => -100,
  normalAt: () => [0, 1, 0], cabinMask: () => 0, pondMask: () => 0, streamAt: () => null }));

test('Pine hares and Nalati marmots flee on their shipped policy rows', () => {
  for (const row of [parseAmbientLife(PINE_LIFE).forager, v.parse(ForagerPopulationSchema, marmots)]) {
    const viewer = { x: 0, z: 0, fx: 0, fz: 1 };
    const population = new ForagerPopulation(row, 41);
    if (row.place.kind === 'roam') population.roam(viewer); else population.colonies([{ x: 5, z: 5 }]);
    expect(population.rows.length).toBeGreaterThan(0);
    const first = population.rows[0]; if (first === undefined) throw new Error('Missing forager');
    viewer.x = first.x; viewer.z = first.z;
    let escaped = false;
    for (let i = 0; i < 600; i++) { population.update(1 / 60, viewer, true); escaped ||= population.rows.some(r => r.mode === 'flee' || r.mode === 'hide'); }
    expect(escaped, row.id).toBe(true);
    const saved = population.snapshot(), resumed = new ForagerPopulation(row, 41);
    resumed.restore(saved);
    expect(resumed.snapshot()).toEqual(saved);
    if (row.place.kind !== 'colonies') continue;
    for (let i = 0; i < 120; i++) {
      population.update(1 / 60, viewer, true); resumed.update(1 / 60, viewer, true);
    }
    expect(resumed.snapshot()).toEqual(population.snapshot());
    expect(population.rows.every(r => [r.x, r.z, r.yaw, r.sink].every(Number.isFinite))).toBe(true);
  }
});
