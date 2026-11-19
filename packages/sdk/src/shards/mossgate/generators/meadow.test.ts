// MOSSGATE-ZONE MZ12: Mossling Meadow in the built shard: its two packs' bodies and groups inside the region, its two places
// as region triggers, and its find, the hoard behind the den, paying the den's side quest.
import { expect, test } from 'vitest';
import { builtSceneShardfile } from '@wildshard/sdk/scene/shardfile';
import { compileScript } from '@wildshard/sdk/compileScript';
import { parseShardfile } from '@wildshard/format/shardSchema';
import { gameplay } from './gameplay';
import { inside, REGIONS } from './layout';
import { MEADOW_FLAGS } from './meadow';
import { mossgate } from './shard';

test('Mossling Meadow has its packs, places and find', { timeout: 120_000 }, async () => {
  const { shard } = await builtSceneShardfile(mossgate.describe(), compileScript, { extend: gameplay });
  // oxlint-disable-next-line unicorn/prefer-structured-clone -- JSON wire normalization, as the build writes it
  expect(() => parseShardfile(JSON.parse(JSON.stringify(shard)))).not.toThrow();
  const meadow = REGIONS.find((region) => region.id === 'meadow')?.rect;
  if (meadow === undefined) throw new Error('no meadow');
  const mosslings = shard.creatures.spawns.filter((row) => row.species === 'mossling');
  expect(mosslings).toHaveLength(8);
  for (const row of mosslings) expect(inside(meadow, row.at[0], row.at[2]), row.id).toBe(true);
  for (const id of ['mossgate.mosslings', 'mossgate.mosslings-stones']) {
    const group = shard.creatures.groups.find((row) => row.id === id);
    expect(group?.members, id).toHaveLength(4);
    for (const member of group?.members ?? []) expect(mosslings.find((row) => row.id === member)?.brain, member).toBe(id);
  }
  for (const flag of Object.values(MEADOW_FLAGS)) expect(shard.quests.triggers.find((t) => t.id === flag), flag).toMatchObject({ kind: 'region' });
  const den = shard.quests.quests.find((q) => q.id === 'mossgate.meadow.den');
  expect(den?.steps.map((s) => s.id)).toEqual(['den', 'hoard']);
  expect(den?.onComplete).toMatchObject({ fact: 'mossgate.meadow.den', coins: 10 });
});
