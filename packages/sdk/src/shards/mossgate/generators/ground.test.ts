// MOSSGATE-ZONE MZ10: ground across the cell. Every one of the 64 terrain tiles has relief, each region has its own shape,
// the roads and paths stay walkable, and the cell's edges and entry roads meet the grid's road height.
import { expect, test } from 'vitest';
import { HALF, PATHS, PLACES } from './layout';
import { groundHeight } from './world';

const SPACING = 500 / 256;
const at = (id: string): number => { const p = PLACES.find((row) => row.id === id); return groundHeight(p?.x ?? 0, p?.z ?? 0); };

test('every terrain tile has ground: the whole 8 x 8 L0 grid carries relief', () => {
  const flat: string[] = [];
  for (let tz = 0; tz < 8; tz++) for (let tx = 0; tx < 8; tx++) {
    let lo = Infinity, hi = -Infinity;
    for (let z = 0; z <= 32; z++) for (let x = 0; x <= 32; x++) {
      const y = groundHeight(-HALF + tx * 62.5 + x * SPACING, -HALF + tz * 62.5 + z * SPACING);
      lo = Math.min(lo, y); hi = Math.max(hi, y);
    }
    // 0.75 m: the yard's south-east tile is mostly the cleanroom's flat floor, its relief starting 48 m out
    if (hi - lo < 0.75) flat.push(`${tx},${tz} (${(hi - lo).toFixed(2)} m)`);
  }
  expect(flat).toEqual([]);
});

test('each region has its own relief', () => {
  expect(at('hollow.yard')).toBe(0);
  expect(at('ridge.lookout')).toBeGreaterThan(12);
  expect(at('quarry.pit')).toBeLessThan(-4);
  expect(at('bog.mere')).toBeLessThan(-0.8);
  expect(at('bog.shrine')).toBeLessThan(at('meadow.stones'));
  expect(at('downs.barrow')).toBeGreaterThan(3);
});

test('the cell edges sit at road height, where the grid seams meet the next cell', () => {
  for (let i = -HALF; i <= HALF; i += 2) for (const [x, z] of [[i, -HALF], [i, HALF], [-HALF, i], [HALF, i]] as const) expect(groundHeight(x, z), `${x},${z}`).toBe(0);
});

test('the roads and paths are walkable: no step along them steeper than 25 degrees', () => {
  const steep: string[] = [];
  for (const path of PATHS) for (let i = 1; i < path.points.length; i++) {
    const [ax, az] = path.points[i - 1] ?? [0, 0], [bx, bz] = path.points[i] ?? [0, 0], len = Math.hypot(bx - ax, bz - az);
    for (let d = 0; d + 1 <= len; d += 1) {
      const t0 = d / len, t1 = (d + 1) / len;
      const rise = Math.abs(groundHeight(ax + (bx - ax) * t1, az + (bz - az) * t1) - groundHeight(ax + (bx - ax) * t0, az + (bz - az) * t0));
      if (Math.atan(rise) * 180 / Math.PI > 25) steep.push(`${path.from} to ${path.to} at ${(ax + (bx - ax) * t0).toFixed(0)},${(az + (bz - az) * t0).toFixed(0)}`);
    }
  }
  expect(steep).toEqual([]);
});
