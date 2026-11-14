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
  for (const name of ['light', 'walls', 'district', 'paths', 'braziers', 'hut', 'sign', 'gate', 'lamplighter', 'pond', 'arena', 'trees', 'boulders', 'flora', 'grass', 'fireflies']) expect(names).toContain(name);
  const part = (name: string) => shard.parts.find((p) => p.name === name);
  // the walls' runs, the gate's pillars and bars, the arena's ring: colliders said at the cleanroom's numbers
  expect(part('walls')?.colliders.length).toBeGreaterThan(8);
  expect(part('arena')?.colliders.length).toBeGreaterThan(30);
  expect(part('gate')?.colliders).toHaveLength(3);
  // brazier A lit (one fire: three flame cards, its halo), the others cold
  expect(part('braziers')?.lights.filter((l) => l.kind === 'point')).toHaveLength(1);
  expect(part('pond')?.water).toHaveLength(1);
  const grassDraw = part('grass')?.draws[0];
  expect(grassDraw?.instances?.count).toBeGreaterThan(5000);
  expect(grassDraw?.motion?.kind).toBe('sway');
  expect(shard.look.sky?.graph.kind).toBe('material');
  expect(shard.ground).not.toBeNull();
});
