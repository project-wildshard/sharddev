import { expect, test } from 'vitest';
import layout from '../data/layout.json' with { type: 'json' };
import { templateHeightAt } from './landscape';
import { buildTemplateWorld, CROSSING_CLEAR, LILIES, mossgateDressing, mossgateFoliage, mushroomCaps, pondPlanting, REEDS, TREES } from './world';
import { Box3, Group, Mesh } from 'three';

// LF1-5: the yard's foliage stands clear of every walk the MH-2, MH-3 and LF1-0 proofs take and of every use point, so no
// tree trunk blocks a path. Tufts and ferns carry no collider at all.
const ROUTES: readonly [[number, number], [number, number]][] = [
  [[0, 0], [layout.HUT.x, layout.HUT.doorZ]], // spawn to the hut door
  [[0, 0], [layout.MOSSGATE.x, layout.MOSSGATE.z]], [[layout.MOSSGATE.x, layout.MOSSGATE.z], [-18, layout.MOSSGATE.z]], // MH-2: through the moss gate
  [[0, 0], [19, 20]], [[18.2, 20], [36, 20]], // MH-3: to the pond's west bank and across the stones
  [[0, 0], [-8.3, 7.4]], [[-8.3, 7.4], [layout.ARENA.x, layout.ARENA.z]], // MH-3: to the arena gate and in
  ...layout.BRAZIERS.map(([x, z]): [[number, number], [number, number]] => [[0, 0], [x ?? 0, z ?? 0]]), // each brazier's use point
];
/** MH-5: the Lamplighter's feet, and the walk from spawn to talk to it (its own walk, so no collider may block it either). */
const LAMPLIGHTER: [number, number] = [layout.LAMPLIGHTER.x, layout.LAMPLIGHTER.z];
const TALK_WALK: [[number, number], [number, number]] = [[0, 0], LAMPLIGHTER];
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
    for (const route of [...ROUTES, TALK_WALK]) expect(distance([c.x, c.z], route) - reach, `trunk at (${c.x}, ${c.z})`).toBeGreaterThan(1.5);
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
    for (const route of [...ROUTES, TALK_WALK]) expect(distance([c.x, c.z], route) - reach, `dressing collider at (${c.x}, ${c.z})`).toBeGreaterThan(0.5);
  }
});

// MH-5: the Lamplighter stands 1.5 m off every proof walk and use point (its body never pushes a walk aside or hides a
// brazier's prompt), and 1 m off every tree trunk and dressing collider (its figure stands in the open).
test('the Lamplighter stands clear of the walks and of the yard trees and dressing', () => {
  for (const route of ROUTES) expect(distance(LAMPLIGHTER, route), `walk to (${String(route[1])})`).toBeGreaterThan(1.5);
  const colliders = [...mossgateFoliage(templateHeightAt()).colliders, ...mossgateDressing(templateHeightAt()).colliders];
  for (const c of colliders) {
    if (c.kind !== 'box') throw new Error('a yard collider is a box');
    expect(Math.hypot(c.x - LAMPLIGHTER[0], c.z - LAMPLIGHTER[1]) - Math.hypot(c.hx, c.hz), `collider at (${c.x}, ${c.z})`).toBeGreaterThan(1);
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

// LF1-8: the pond's reeds, lily pads and lip sit in L0 tile 0/4/4 only (it is at 8 draws, so they ride its static draw), keep
// clear of the MH-3 crossing (the bridge walk along z = POND.z, and the stones either side of it), carry no collider, and
// the pads float on the water inside the rim.
test('the pond planting stays in tile 0/4/4 and off the crossing', () => {
  const root = pondPlanting(templateHeightAt()), { x: cx, z: cz } = layout.POND;
  root.updateMatrixWorld(true);
  let meshes = 0, pads = 0;
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    meshes++;
    // a lily pad (an upward fan with no height) floats on the water, never under it
    if (node.name === 'lily-pad') { pads++; expect(node.position.y).toBeGreaterThan(0); }
    const box = new Box3().setFromObject(node);
    // L0 tile 0/4/4 spans x [0, 62.5) and z [0, 62.5)
    expect(box.min.x >= 0 && box.max.x < 62.5 && box.min.z >= 0 && box.max.z < 62.5, `mesh at (${box.min.x}, ${box.min.z})`).toBe(true);
    // nothing on the crossing west of B's bank: the walk's capsule and the 1.75 m stones keep 1.2 m each side of z = POND.z
    if (box.max.x > 18 && box.min.x < 36) expect(box.min.z > cz + 1.2 || box.max.z < cz - 1.2, `mesh over the crossing at (${box.min.x}, ${box.min.z})..(${box.max.x}, ${box.max.z})`).toBe(true);
  });
  expect(meshes).toBeGreaterThan(REEDS.length);
  expect(pads).toBe(LILIES.length);
  // no collider: the planting is registered without one, so the swim before B and the bridge walk after are unchanged
  const pieces: { id: string; colliders?: unknown[] }[] = [];
  buildTemplateWorld({ root: new Group(), scope: { own: () => undefined, onDispose: () => undefined }, piece: (part) => { pieces.push(part); }, rng: { stream: () => ({ range: (a: number) => a }) }, heightAt: templateHeightAt() }, 0);
  expect(pieces.find(part => part.id === 'template.pond-planting')?.colliders ?? []).toHaveLength(0);
  expect(CROSSING_CLEAR).toBeGreaterThanOrEqual(1.2);
  for (const [dx, dz, r] of LILIES) expect(Math.hypot(dx, dz) + r, `lily at (${dx}, ${dz})`).toBeLessThan(4.6);
  for (const [deg, r] of REEDS) {
    const a = (deg * Math.PI) / 180, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    expect(Math.abs(z - cz), `reed at ${deg} degrees`).toBeGreaterThan(CROSSING_CLEAR);
    for (const [bx = 0, bz = 0] of layout.BRAZIERS) expect(Math.hypot(x - bx, z - bz), `reed at ${deg} degrees by a brazier`).toBeGreaterThan(2.5);
  }
});
