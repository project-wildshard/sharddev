import { expect, test } from 'vitest';
import { sceneSummary } from '@wildshard/sdk/scene/lower';
import { mossgate } from './shard';

/** SHARD-SOURCE AP15: the whole cleanroom (mossgate-cleanroom 9cb4dc6 src/world.js) lowers with no refusal, one part per
 *  section, with the colliders, lights, water and sky the cleanroom has. */
test('Mossgate whole lowers with every section', () => {
  const t0 = performance.now();
  const shard = mossgate.describe();
  console.info(`lowered in ${(performance.now() - t0).toFixed(0)} ms`, sceneSummary(shard));
  const names = shard.parts.map((p) => p.name);
  for (const name of ['light', 'walls', 'district', 'paths', 'braziers', 'hut', 'sign', 'gate', 'lamplighter', 'pond', 'arena', 'trees', 'boulders', 'flora', 'fireflies']) expect(names).toContain(name);
  const part = (name: string) => shard.parts.find((p) => p.name === name);
  // the walls' runs, the gate's pillars and bars, the arena's ring: colliders said at the cleanroom's numbers
  expect(part('walls')?.colliders.length).toBeGreaterThan(8);
  expect(part('arena')?.colliders.length).toBeGreaterThan(30);
  expect(part('gate')?.colliders).toHaveLength(3);
  // brazier A lit (one fire: three flame cards, its halo), the others cold
  expect(part('braziers')?.lights.filter((l) => l.kind === 'point')).toHaveLength(1);
  expect(part('pond')?.water).toHaveLength(1);
  // AP32d: the grass and the ferns are detail layers (counts per cell, the engine grows them round the camera)
  const layer = (id: string) => shard.details?.find((d) => d.id === id);
  expect(shard.details?.map((d) => d.id)).toEqual(['ferns', 'grass']);
  expect(layer('grass')?.clumps).toBeGreaterThan(5);
  expect(layer('grass')?.sway).toEqual({ amount: 0.06, rate: 0.5 });
  expect(layer('ferns')?.shadow).toBe(true);
  expect(shard.look.sky?.graph.kind).toBe('material');
  expect(shard.ground).not.toBeNull();
  // SS8e: the gallows-post and bracket lanterns hang (5 posts, 6 brackets), each lamp with its lantern's swing
  const swings = shard.parts.flatMap((p) => p.swings ?? []);
  expect(swings).toHaveLength(11);
  expect(shard.parts.flatMap((p) => p.lights).filter((l) => l.swing !== undefined)).toHaveLength(11);
  // SS9e: the crate inside the yard gate is a touchable panel, its body fitted round it
  expect(part('crate')?.touch).toMatchObject({ material: 'wood', density: 250, shape: { cuboid: { x: expect.closeTo(0.41, 2), y: expect.closeTo(0.4, 2), z: expect.closeTo(0.41, 2) } } });
});
