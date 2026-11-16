import { expect, test } from 'vitest';
import layout from '../data/layout.json' with { type: 'json' };
import creatures from '../data/creatures.json' with { type: 'json' };
import manifest from '../manifest.json' with { type: 'json' };

// TEMPLATE-E2E TC-M7b (J361: "a bigger route, about 400 m"): the three quests in their chain order, station to station in
// straight lines (the walls round the yard and the pond garden only lengthen it): the sword's rack, the first adventure
// (hut, blob), the Lamplighter's (braziers A, B, C, the Warden, back to her), then the Pond Hermit's, whose mossling pack
// now holds the meadow past the south loop road.
const at = (p: { x: number; z: number }): [number, number] => [p.x, p.z];
const pair = (p: number[] | undefined): [number, number] => [p?.[0] ?? Number.NaN, p?.[1] ?? Number.NaN];
const ROUTE: [number, number][] = [
  [manifest.spawn.x, manifest.spawn.z], at(layout.RACK), [layout.HUT.x, layout.HUT.doorZ], at(layout.BLOB), at(layout.LAMPLIGHTER),
  pair(layout.BRAZIERS[0]), pair(layout.BRAZIERS[1]), pair(layout.BRAZIERS[2]), at(layout.BOSS), at(layout.LAMPLIGHTER),
  at(layout.HERMIT), at(layout.MEADOW), at(layout.HERMIT),
];

test('the three quests walk 400 m or more', () => {
  let metres = 0;
  for (let i = 1; i < ROUTE.length; i++) {
    const [ax = 0, az = 0] = ROUTE[i - 1] ?? [], [bx = 0, bz = 0] = ROUTE[i] ?? [];
    metres += Math.hypot(bx - ax, bz - az);
  }
  expect(metres).toBeGreaterThanOrEqual(400);
});

test('the pack stands in its meadow, and the meadow is a named place on the map', () => {
  const pack = creatures.groups.find(group => group.id === 'template.mosslings');
  expect(pack?.home).toEqual([layout.MEADOW.x, layout.MEADOW.z]);
  for (const row of creatures.spawns.filter(spawn => spawn.id.startsWith('mossling:')))
    expect(Math.hypot((row.at[0] ?? 0) - layout.MEADOW.x, (row.at[2] ?? 0) - layout.MEADOW.z)).toBeLessThan(layout.MEADOW.r);
  expect(manifest.pois.some(poi => poi.id === 'mossling-meadow' && poi.x === layout.MEADOW.x && poi.z === layout.MEADOW.z)).toBe(true);
});
