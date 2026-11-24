import { expect, test, vi } from 'vitest';
import { CONTENT_CAPS } from '@wildshard/format/contentBounds';
import { NEAR_EDGE_LEAN, projectFarPlaceholder, shardfileLook } from './placeholders';
import type { PlaceholderGrid, PlaceholderLook, PlaceholderPart } from './placeholderGeometry';
import type { Shardfile } from '@wildshard/format/shardSchema';

// QA 2026-11-24 row 6 (Jake: "i want the fucking far view placeholders to look better"; J509: the look decides): a far view
// carries its zone's landmarks and leans its border back into the road instead of standing a grey wall there.
const res = 17, heights = new Float32Array(res * res).fill(10);
const grid: PlaceholderGrid = { res, size: 500, heights, splat: null };
const look: PlaceholderLook = { family: 'toon', quads: 4, colourAt: () => [0.6, 0.5, 0.3], cliff: { lip: [0.5, 0.4, 0.25], foot: [0.3, 0.25, 0.15] }, haze: { colour: [0.7, 0.7, 0.8] } };
// a 60 m tower: a box at the cell's centre
const tower: PlaceholderPart = {
  positions: Float32Array.from([-5, 10, -5, 5, 10, -5, 5, 10, 5, -5, 10, 5, -5, 70, -5, 5, 70, -5, 5, 70, 5, -5, 70, 5]),
  colours: new Float32Array(24).fill(0.4),
  index: Uint32Array.from([0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7, 4, 5, 6, 4, 6, 7]),
};

test('the far view keeps a landmark the ground alone does not have', async () => {
  const bare = await projectFarPlaceholder(grid, look), marked = await projectFarPlaceholder(grid, look, CONTENT_CAPS.far, [tower]);
  expect(marked.far.triangles).toBe(bare.far.triangles + 10);
  expect(marked.far.bounds.max[1]).toBeGreaterThanOrEqual(70);
  expect(bare.far.bounds.max[1]).toBeLessThan(20);
});

test('landmarks over the far cap are dropped before the ground is refused', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const bare = await projectFarPlaceholder(grid, look);
  const baked = await projectFarPlaceholder(grid, look, { ...CONTENT_CAPS.far, triangles: bare.far.triangles }, [tower]);
  expect(baked.far.triangles).toBe(bare.far.triangles);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('far landmarks dropped'));
  warn.mockRestore();
});

test('the far border leans back from the cell edge', async () => {
  // a 60 m high cell stands a 60 m wall to the road upright; leaned, its border comes down to the seam's face top
  const high: PlaceholderGrid = { ...grid, heights: new Float32Array(res * res).fill(60) };
  const upright = await projectFarPlaceholder(high, look), leaned = await projectFarPlaceholder(high, look, CONTENT_CAPS.far, [], NEAR_EDGE_LEAN);
  expect(leaned.bytes).not.toEqual(upright.bytes);
  expect(leaned.far.bounds.max[1]).toBeCloseTo(upright.far.bounds.max[1], 3);
});

test('a shard with no far look paints its border face in its own ground, not grey rock', () => {
  const ground = [0.7, 0.5, 0.3] as const;
  const shard = { look: { keys: [{ ambient: { ground }, fog: { colour: [0.8, 0.7, 0.6] } }] } } as unknown as Shardfile;
  const { cliff } = shardfileLook(shard);
  for (const tone of [cliff.lip, cliff.foot]) {
    expect(tone[0] / tone[2]).toBeCloseTo(ground[0] / ground[2], 5);
  }
});
