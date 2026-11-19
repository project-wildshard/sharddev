// MOSSGATE-ZONE MZ9: the cell map fills the 500 m cell. Each region's rect is listed here, so a change to the map is a change to
// this test; the places span 400 m both ways, sit in their regions, and every path and entry ties the map together.
import { expect, test } from 'vitest';
import { ENTRIES, HALF, PATHS, PLACES, REGIONS, inside, regionAt } from './layout';

test('Mossgate is seven regions across the cell, none overlapping', () => {
  expect(REGIONS.map((region) => [region.id, region.rect.x0, region.rect.x1, region.rect.z0, region.rect.z1])).toEqual([
    ['yard', -50, 50, -50, 50],
    ['meadow', -80, 60, -230, -60],
    ['thicket', 70, 230, -230, -60],
    ['downs', 80, 230, -50, 110],
    ['bog', -230, -70, -50, 110],
    ['quarry', -80, 80, 120, 230],
    ['ridge', -230, -100, -230, -80],
  ]);
  for (const region of REGIONS) {
    const { x0, x1, z0, z1 } = region.rect;
    expect(x0 >= -HALF && x1 <= HALF && z0 >= -HALF && z1 <= HALF && x0 < x1 && z0 < z1, region.id).toBe(true);
    for (const other of REGIONS) {
      if (other === region) continue;
      const apart = other.rect.x0 > x1 || other.rect.x1 < x0 || other.rect.z0 > z1 || other.rect.z1 < z0;
      expect(apart, `${region.id} and ${other.id}`).toBe(true);
    }
  }
});

test('twelve named places span 400 m both ways, each inside its region', () => {
  expect(PLACES).toHaveLength(12);
  expect(new Set(PLACES.map((place) => place.id)).size).toBe(12);
  const xs = PLACES.map((place) => place.x), zs = PLACES.map((place) => place.z);
  expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(400);
  expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThanOrEqual(400);
  for (const place of PLACES) expect(regionAt(place.x, place.z)?.id, place.id).toBe(place.region);
  for (const region of REGIONS) expect(PLACES.some((place) => place.region === region.id), region.id).toBe(true);
});

test('four entry roads run from the cell edges to the yard, and paths reach every place', () => {
  const yard = REGIONS.find((region) => region.id === 'yard');
  expect(ENTRIES.map((entry) => entry.id)).toEqual(['north', 'east', 'south', 'west']);
  for (const entry of ENTRIES) {
    expect(Math.max(Math.abs(entry.gate[0]), Math.abs(entry.gate[1])), entry.id).toBe(HALF);
    expect(yard !== undefined && inside(yard.rect, entry.to[0], entry.to[1]), entry.id).toBe(true);
  }
  const ids = new Set(PLACES.map((place) => place.id)), reached = new Set(['hollow.yard', 'hollow.pond']);
  for (const path of PATHS) {
    expect(ids.has(path.from) && ids.has(path.to), `${path.from} to ${path.to}`).toBe(true);
    const end = PLACES.find((place) => place.id === path.to), last = path.points.at(-1);
    expect(last, path.to).toEqual([end?.x, end?.z]);
  }
  // every place is reachable from the yard along the paths
  for (let grew = true; grew;) {
    grew = false;
    for (const path of PATHS) if (reached.has(path.from) && !reached.has(path.to)) { reached.add(path.to); grew = true; }
  }
  expect([...reached].sort()).toEqual([...ids].sort());
});
