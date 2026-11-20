// MOSSGATE-ZONE MZ17: the Barrow Downs in the built shard: the barrow ring out of the yard on the Downs' crown, its wall a
// ring of colliders with the arch's gap on the west (toward the approach), the Warden spawning and fighting at its heart,
// and the ring's and the cairn's region triggers.
import { expect, test } from 'vitest';
import { builtSceneShardfile } from '@wildshard/sdk/scene/shardfile';
import { compileScript } from '@wildshard/sdk/compileScript';
import { parseShardfile } from '@wildshard/format/shardSchema';
import { DOWNS, DOWNS_FLAGS } from './downs';
import { ENCOUNTERS } from './fights';
import { gameplay } from './gameplay';
import { inside, REGIONS } from './layout';
import { mossgate } from './shard';
import { arenaBase, LAYOUT } from './world';

test('the barrow ring stands on the Downs with its wall, its arch and the Warden', { timeout: 120_000 }, async () => {
  const scene = mossgate.describe();
  const { shard } = await builtSceneShardfile(scene, compileScript, { extend: gameplay });
  // oxlint-disable-next-line unicorn/prefer-structured-clone -- JSON wire normalization, as the build writes it
  expect(() => parseShardfile(JSON.parse(JSON.stringify(shard)))).not.toThrow();
  const downs = REGIONS.find((r) => r.id === 'downs')?.rect, yard = REGIONS.find((r) => r.id === 'yard')?.rect;
  if (downs === undefined || yard === undefined) throw new Error('no downs');
  const { x: ax, z: az, r } = LAYOUT.ARENA;
  expect(inside(downs, ax, az)).toBe(true);
  expect(inside(yard, ax, az)).toBe(false);
  expect(arenaBase()).toBeGreaterThan(3);

  // the wall: colliders all round the ring at its radius, standing on the crown, with one gap on the west for the arch
  const arena = scene.parts.find((p) => p.name === 'arena');
  const wall = arena?.colliders?.filter((c) => Math.abs(Math.hypot(c.centre[0] - ax, c.centre[2] - az) - r) < 0.6) ?? [];
  expect(wall.length).toBeGreaterThan(28);
  for (const c of wall) expect(c.centre[1] - c.half[1], 'a wall block reaches the crown').toBeLessThanOrEqual(arenaBase() + 0.01);
  const bearings = wall.map((c) => Math.atan2(c.centre[2] - az, c.centre[0] - ax));
  expect(bearings.some((a) => Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < 0.15), 'the west gap is open').toBe(false);
  // the arch's two pillars flank the gap
  const pillars = arena?.colliders?.filter((c) => Math.abs(c.centre[0] - LAYOUT.ARCH.x) < 0.1 && Math.abs(Math.abs(c.centre[2] - az) - 1.9) < 0.1) ?? [];
  expect(pillars).toHaveLength(2);

  // the Warden spawns inside the ring and its boss fight is held there
  const warden = shard.creatures.spawns.find((s) => s.id === 'barrow-warden');
  expect(Math.hypot((warden?.at[0] ?? 0) - ax, (warden?.at[2] ?? 0) - az)).toBeLessThan(r - 2);
  expect((warden?.at[1] ?? 0)).toBeGreaterThan(3);
  const fight = shard.encounters.find((e) => e.id === ENCOUNTERS.warden);
  expect(Math.hypot((fight?.arena.at[0] ?? 0) - ax, (fight?.arena.at[2] ?? 0) - az)).toBeLessThan(2);

  for (const flag of Object.values(DOWNS_FLAGS)) expect(shard.quests.triggers.find((t) => t.id === flag), flag).toMatchObject({ kind: 'region' });
  expect(inside(downs, DOWNS.CAIRN.x, DOWNS.CAIRN.z)).toBe(true);
});
