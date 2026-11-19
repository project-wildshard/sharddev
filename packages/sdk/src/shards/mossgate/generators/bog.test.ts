// MOSSGATE-ZONE MZ14: the Bog in the built shard: three wisps over Wisp Mere's water inside the region, their own brain
// circling the mere, both places as region triggers, and the shrine's chest: its prompt, its lid panels and the quest it pays.
import { expect, test } from 'vitest';
import { builtSceneShardfile } from '@wildshard/sdk/scene/shardfile';
import { compileScript } from '@wildshard/sdk/compileScript';
import { parseShardfile } from '@wildshard/format/shardSchema';
import { BOG, BOG_FLAGS, BOG_USE } from './bog';
import { gameplay } from './gameplay';
import { inside, REGIONS } from './layout';
import { mossgate } from './shard';

test('the Bog has its wisps, water, places and a chest that pays', { timeout: 120_000 }, async () => {
  const scene = mossgate.describe();
  expect(scene.parts.find((p) => p.name === 'bog')?.water).toHaveLength(1);
  const { shard } = await builtSceneShardfile(scene, compileScript, { extend: gameplay });
  // oxlint-disable-next-line unicorn/prefer-structured-clone -- JSON wire normalization, as the build writes it
  expect(() => parseShardfile(JSON.parse(JSON.stringify(shard)))).not.toThrow();
  const bog = REGIONS.find((region) => region.id === 'bog')?.rect;
  if (bog === undefined) throw new Error('no bog');
  const wisps = shard.creatures.spawns.filter((row) => row.id.startsWith('mere-wisp-'));
  expect(wisps).toHaveLength(3);
  for (const row of wisps) {
    expect(inside(bog, row.at[0], row.at[2]), row.id).toBe(true);
    expect(row.at[1], row.id).toBeGreaterThan(BOG.MERE.waterY + 2);
    expect([row.species, row.brain]).toEqual(['mere.wisp', 'mossgate.mere-wisp-dive']);
  }
  const brain = shard.creatures.brains.find((row) => row.id === 'mossgate.mere-wisp-dive') as { home?: { x: number; z: number } } | undefined;
  expect(brain?.home).toMatchObject({ x: BOG.MERE.x, z: BOG.MERE.z });
  for (const flag of [BOG_FLAGS.shrine, BOG_FLAGS.mere, BOG_FLAGS.atChest]) expect(shard.quests.triggers.find((t) => t.id === flag), flag).toMatchObject({ kind: 'region' });
  expect(shard.targets.interactions.find((row) => row.id === BOG_USE)?.unless).toBe(`${BOG_USE}.spent`);
  expect(shard.targets.panels.map((p) => p.panel)).toEqual(expect.arrayContaining(['mossgate.bog-chest.lid', 'mossgate.bog-chest.lid-open']));
  const quest = shard.quests.quests.find((q) => q.id === 'mossgate.bog.shrine');
  expect(quest?.steps.map((s) => s.id)).toEqual(['shrine', 'chest']);
  expect(quest?.onComplete).toMatchObject({ fact: 'mossgate.bog.shrine', coins: 20 });
});
