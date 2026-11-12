import { expect, test } from 'vitest';
import layout from '../data/layout.json' with { type: 'json' };
import { templateHeightAt } from './landscape';
import { mossgateDressing, mossgateFoliage, mushroomCaps, TREES } from './world';

// LF1-5: the yard's foliage stands clear of every walk the MH-2, MH-3 and LF1-0 proofs take and of every use point, so no
// tree trunk blocks a path. Tufts and ferns carry no collider at all.
const ROUTES: readonly [[number, number], [number, number]][] = [
  [[0, 0], [layout.HUT.x, layout.HUT.doorZ]], // spawn to the hut door
  [[0, 0], [layout.MOSSGATE.x, layout.MOSSGATE.z]], [[layout.MOSSGATE.x, layout.MOSSGATE.z], [-18, layout.MOSSGATE.z]], // MH-2: through the moss gate
  [[0, 0], [19, 20]], [[18.2, 20], [36, 20]], // MH-3: to the pond's west bank and across the stones
  [[0, 0], [-8.3, 7.4]], [[-8.3, 7.4], [layout.ARENA.x, layout.ARENA.z]], // MH-3: to the arena gate and in
  ...layout.BRAZIERS.map(([x, z]): [[number, number], [number, number]] => [[0, 0], [x ?? 0, z ?? 0]]), // each brazier's use point
];
const distance = ([px, pz]: [number, number], [[ax, az], [bx, bz]]: [[number, number], [number, number]]): number => {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
};

test('every foliage collider stands at least 1.5 m off the proofs\' walks and use points', () => {
  const { colliders } = mossgateFoliage(templateHeightAt());
  expect(colliders).toHaveLength(TREES.length);
  for (const c of colliders) {
    if (c.kind !== 'box') throw new Error('a tree trunk is a box');
    expect(c.surface).toBe('wood');
    const reach = Math.hypot(c.hx, c.hz);
    for (const route of ROUTES) expect(distance([c.x, c.z], route) - reach, `trunk at (${c.x}, ${c.z})`).toBeGreaterThan(1.5);
  }
});

// LF1-7 checks: the dressing's solid pieces (boulders, the lamp post, the hut's bench and barrels) stand clear of the
// same walks by more than the player's 0.38 m capsule, so no proof walk has to slide round one (the boulder at (-2.6, 2.6)
// stood on the spawn-to-arena walk until LF1-7's re-run).
test('every dressing collider stands at least 0.5 m off the proofs\' walks and use points', () => {
  const { colliders } = mossgateDressing(templateHeightAt());
  expect(colliders.length).toBeGreaterThan(0);
  for (const c of colliders) {
    if (c.kind !== 'box') throw new Error('a dressing collider is a box');
    const reach = Math.hypot(c.hx, c.hz);
    for (const route of ROUTES) expect(distance([c.x, c.z], route) - reach, `dressing collider at (${c.x}, ${c.z})`).toBeGreaterThan(0.5);
  }
});

test('six to eight trees, and the red caps sit in L0 tile 0/4/3 only', () => {
  expect(TREES.length).toBeGreaterThanOrEqual(6); expect(TREES.length).toBeLessThanOrEqual(8);
  const { mesh, transform } = mushroomCaps(templateHeightAt()), p = mesh.geometry.getAttribute('position');
  const ox = transform.elements[12] ?? 0, oz = transform.elements[14] ?? 0;
  // L0 tile 0/4/3 spans x [0, 62.5) and z [-62.5, 0): the one yard tile with a draw to spare
  for (let v = 0; v < p.count; v++) { const x = p.getX(v) + ox, z = p.getZ(v) + oz; expect(x >= 0 && x < 62.5 && z >= -62.5 && z < 0).toBe(true); }
  expect(mesh.castShadow).toBe(false);
});
