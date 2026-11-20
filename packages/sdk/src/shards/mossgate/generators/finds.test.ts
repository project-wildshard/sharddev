// MOSSGATE-ZONE MZ22: the Hollow's finds in the built shard: twelve pieces of lamp-glass, two in each of six regions and
// off every road, each a region trigger the set's quest counts; three chests, each paying a quest whose fact is in the
// ledger; four lore signs whose reading the old-words quest counts; and one achievement for the set.
import { expect, test } from 'vitest';
import { builtSceneShardfile } from '@wildshard/sdk/scene/shardfile';
import { compileScript } from '@wildshard/sdk/compileScript';
import { parseShardfile } from '@wildshard/format/shardSchema';
import { BOG } from './bog';
import { CAIRN_CHEST, FIND_FLAGS, GLASS, GLASS_FLAGS, LORE_FLAGS } from './finds';
import { gameplay } from './gameplay';
import { roadDistance } from './ground';
import { inside, REGIONS } from './layout';
import { mossgate } from './shard';

test('the Hollow has its glass, chests and lore signs', { timeout: 120_000 }, async () => {
  const { shard } = await builtSceneShardfile(mossgate.describe(), compileScript, { extend: gameplay });
  // oxlint-disable-next-line unicorn/prefer-structured-clone -- JSON wire normalization, as the build writes it
  expect(() => parseShardfile(JSON.parse(JSON.stringify(shard)))).not.toThrow();
  // twelve pieces, two to a region in six regions, each inside its region, 3 m off any road and dry of the mere
  expect(GLASS).toHaveLength(12);
  const perRegion = new Map<string, number>();
  for (const piece of GLASS) {
    const rect = REGIONS.find((r) => r.id === piece.region)?.rect;
    if (rect === undefined) throw new Error(`no region ${piece.region}`);
    expect(inside(rect, piece.x, piece.z), `${piece.x},${piece.z}`).toBe(true);
    expect(roadDistance(piece.x, piece.z), `${piece.x},${piece.z}`).toBeGreaterThanOrEqual(3);
    expect(Math.hypot(piece.x - BOG.MERE.x, piece.z - BOG.MERE.z)).toBeGreaterThan(BOG.MERE.r + 4);
    perRegion.set(piece.region, (perRegion.get(piece.region) ?? 0) + 1);
  }
  expect([...perRegion.values()]).toEqual([2, 2, 2, 2, 2, 2]);
  // each piece is a region trigger; the set's quest counts all twelve and pays the one achievement
  const triggers = new Set(shard.quests.triggers.filter((t) => t.kind === 'region').map((t) => t.flag));
  for (const flag of GLASS_FLAGS) expect(triggers.has(flag), flag).toBe(true);
  const quest = (id: string) => shard.quests.quests.find((q) => q.id === id);
  expect(quest('mossgate.glass')?.steps[0]?.done.all).toEqual([...GLASS_FLAGS]);
  const ledger = new Set(shard.ledger.map((row) => row.fact));
  // three chests (the yard's, the Bog's, the cairn's), each paying a quest with its fact in the ledger
  const uses = new Set(shard.targets.interactions.map((row) => row.id));
  for (const [use, id] of [['mossgate.chest.use', 'mossgate.chest'], ['mossgate.bog-chest.use', 'mossgate.bog.shrine'], [CAIRN_CHEST.use, 'mossgate.cairn']] as const) {
    expect(uses.has(use), use).toBe(true);
    expect(ledger.has(quest(id)?.onComplete?.fact ?? ''), id).toBe(true);
  }
  expect(quest('mossgate.cairn')?.steps.at(-1)?.done.all).toEqual([FIND_FLAGS.atCairnChest, FIND_FLAGS.cairnChestOpened]);
  // four lore signs: each talk's last choice files its reading, and the old-words quest counts the four
  const lore = Object.values(LORE_FLAGS);
  const talks = new Set(shard.targets.talks?.map((t) => t.dialogue));
  const filed = shard.quests.dialogue.filter((d) => talks.has(d.id)).flatMap((d) => d.nodes.flatMap((n) => n.choices.flatMap((c) => c.sets ?? [])));
  for (const flag of lore) expect(filed, flag).toContain(flag);
  expect(quest('mossgate.lore')?.steps[0]?.done.all).toEqual(lore);
  for (const fact of ['mossgate.glass', 'mossgate.lore']) expect(ledger.has(fact), fact).toBe(true);
});
