// MOSSGATE-ZONE MZ13: Greyback's Thicket in the built shard: Greyback's elite camp and its sows inside the region, the
// wallow's sows, the encounter's arena on the clearing, both places as region triggers, and the lore sign's talk.
import { expect, test } from 'vitest';
import { builtSceneShardfile } from '@wildshard/sdk/scene/shardfile';
import { compileScript } from '@wildshard/sdk/compileScript';
import { parseShardfile } from '@wildshard/format/shardSchema';
import { gameplay } from './gameplay';
import { inside, REGIONS } from './layout';
import { THICKET, THICKET_FLAGS } from './thicket';
import { mossgate } from './shard';

test("Greyback's Thicket has its camp, places and lore sign", { timeout: 120_000 }, async () => {
  const { shard } = await builtSceneShardfile(mossgate.describe(), compileScript, { extend: gameplay });
  // oxlint-disable-next-line unicorn/prefer-structured-clone -- JSON wire normalization, as the build writes it
  expect(() => parseShardfile(JSON.parse(JSON.stringify(shard)))).not.toThrow();
  const thicket = REGIONS.find((region) => region.id === 'thicket')?.rect;
  if (thicket === undefined) throw new Error('no thicket');
  const camp = shard.creatures.spawns.filter((row) => row.id === 'greyback' || row.id.startsWith('camp-sow-') || row.id.startsWith('wallow-sow-'));
  expect(camp.map((row) => row.id).sort()).toEqual(['camp-sow-1', 'camp-sow-2', 'camp-sow-3', 'greyback', 'wallow-sow-1', 'wallow-sow-2']);
  for (const row of camp) expect(inside(thicket, row.at[0], row.at[2]), row.id).toBe(true);
  const elite = shard.encounters.find((row) => row.id === 'mossgate.greyback');
  expect(elite).toMatchObject({ kind: 'elite', entity: 'greyback' });
  expect(Math.hypot((elite?.arena.at[0] ?? 0) - THICKET.CLEARING.x, (elite?.arena.at[2] ?? 0) - THICKET.CLEARING.z)).toBeLessThan(1);
  for (const flag of Object.values(THICKET_FLAGS)) expect(shard.quests.triggers.find((t) => t.id === flag), flag).toMatchObject({ kind: 'region' });
  expect(shard.targets.talks?.find((t) => t.id === 'mossgate.thicket.sign.read')?.dialogue).toBe('mossgate.thicket.sign');
});
