import { expect, test } from 'vitest';
import { POND, pondEdge, templateHeightAt } from './landscape';
import { poolMask } from './world';

// Jake, 2026-11-12 (preview, build 243820b7): "glitched into the pond cant use shift to surface". The pond was a cliff at r 5,
// which the shard's 257² lattice (1.95 m a sample) smeared into a 56° pit wall reaching past the water's 5 m circle: a swimmer
// at the bank went dry in a hole under the waterline and could not climb out. The bowl now shelves to a beach the swim can stand
// up on inside the circle, and every lattice cell round the pond is walkable. (Engine's swim law holds the mask's edge over deep
// ground too: engine test/pond-surface.test.ts.) TEMPLATES-CLEANROOM M2 made the pond the cleanroom's rounded rectangle; the
// same holds all the way round its edge.

const RES = 257, SIZE = 500, D = SIZE / (RES - 1);
/** engine player/swim.ts: SWIM_OUT, the depth a swimmer stands up at; and the motor's 40° climb limit. */
const SWIM_OUT = 1.05, MAX_CLIMB_DEG = 40;
const heightAt = templateHeightAt();
const lattice = (i: number): number => -SIZE / 2 + i * D;
/** The ground as the engine reads it: the 257² lattice's samples, blended across the cell. */
function baked(x: number, z: number): number {
  const fx = (x + SIZE / 2) / D, fz = (z + SIZE / 2) / D, ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const at = (i: number, k: number): number => heightAt(lattice(i), lattice(k));
  return (at(ix, iz) * (1 - tx) + at(ix + 1, iz) * tx) * (1 - tz) + (at(ix, iz + 1) * (1 - tx) + at(ix + 1, iz + 1) * tx) * tz;
}

test('the water\'s edge is shallow enough to stand up on, all the way round', () => {
  for (let deg = 0; deg < 360; deg += 5) {
    const [x, z] = pondEdge((deg * Math.PI) / 180, -0.1);
    expect(poolMask(x, z)).toBe(true);
    expect({ deg, depth: -baked(x, z) < SWIM_OUT }).toEqual({ deg, depth: true });
  }
  expect(heightAt(POND.x, POND.z)).toBe(POND.bed); // still deep enough to swim at the heart
});

test('every lattice edge round the pond climbs at under the motor\'s limit', () => {
  const lo = Math.floor((POND.x - POND.hx - 3 + SIZE / 2) / D), hi = Math.ceil((POND.x + POND.hx + 3 + SIZE / 2) / D);
  const zlo = Math.floor((POND.z - POND.hz - 3 + SIZE / 2) / D), zhi = Math.ceil((POND.z + POND.hz + 3 + SIZE / 2) / D);
  let steepest = 0;
  for (let iz = zlo; iz <= zhi; iz++) for (let ix = lo; ix <= hi; ix++) {
    const h = heightAt(lattice(ix), lattice(iz));
    for (const [dx, dz] of [[1, 0], [0, 1]] as const) steepest = Math.max(steepest, Math.abs(heightAt(lattice(ix + dx), lattice(iz + dz)) - h) / D);
  }
  expect((Math.atan(steepest) * 180) / Math.PI).toBeLessThan(MAX_CLIMB_DEG);
});
