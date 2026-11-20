// MOSSGATE-ZONE MZ18 and MZ19: the main chain in the built shard. "Relight the Hollow" has eight steps or more, its
// markers stand in four regions or more, three talkers turn it in (the Lamplighter, the Pond Hermit, the Quarrymaster), it
// ends at the Barrow Warden and then the Lamplighter, and every camp has a side quest. The rite's places rise only in order.
import { expect, test } from 'vitest';
import { builtSceneShardfile } from '@wildshard/sdk/scene/shardfile';
import { compileScript } from '@wildshard/sdk/compileScript';
import { gameplay } from './gameplay';
import { regionAt } from './layout';
import { FLAGS } from './quests';
import { mossgate } from './shard';

test('the main chain crosses the Hollow to the Warden, with three turn-ins and a side quest a camp', { timeout: 120_000 }, async () => {
  const { shard } = await builtSceneShardfile(mossgate.describe(), compileScript, { extend: gameplay });
  const chain = shard.quests.quests.find((q) => q.id === 'mossgate.lamplighter');
  if (chain === undefined) throw new Error('no chain');
  expect(chain.steps.length).toBeGreaterThanOrEqual(8);
  const regions = new Set(chain.steps.flatMap((s) => s.markers ?? []).map((m) => regionAt(m.at.x, m.at.z)?.id ?? 'wilds'));
  for (const id of ['yard', 'meadow', 'bog', 'ridge', 'quarry', 'downs']) expect(regions.has(id), id).toBe(true);
  expect(chain.steps.at(-2)?.done.all).toEqual(['dead:barrow-warden']);

  // three turn-ins: each a talk whose choice sets a step's flag
  const talks = new Map((shard.targets.talks ?? []).map((t) => [t.dialogue, t]));
  const setters = new Map(shard.quests.dialogue.flatMap((d) => d.nodes.flatMap((n) => n.choices.flatMap((c) => (c.sets ?? []).map((flag) => [flag, d.id] as const)))));
  const turnIns = new Set(chain.steps.flatMap((s) => s.done.all ?? []).flatMap((flag) => setters.get(flag) ?? []));
  expect([...turnIns].toSorted()).toEqual(['mossgate.hermit', 'mossgate.lamplighter', 'mossgate.quarrymaster']);
  for (const id of turnIns) expect(talks.has(id), id).toBe(true);
  // the Lamplighter's report waits for the Quarrymaster's word and the Warden
  const report = shard.quests.dialogue.find((d) => d.id === 'mossgate.lamplighter')?.nodes.flatMap((n) => n.choices).find((c) => c.id === 'report');
  expect(report?.when?.all).toEqual(expect.arrayContaining([FLAGS.quarryTold, 'dead:barrow-warden']));

  // the rite's places rise in order
  const when = (flag: string) => shard.quests.triggers.find((t) => t.flag === flag)?.when?.all;
  expect(when(FLAGS.riteStones)).toEqual([FLAGS.wardenAsked]);
  expect(when(FLAGS.riteShrine)).toEqual([FLAGS.riteStones]);
  expect(when(FLAGS.riteLookout)).toEqual([FLAGS.riteShrine]);
  expect(when(FLAGS.beaconLit)).toEqual([FLAGS.riteLookout]);

  // a side quest for each camp: the yard's blobs, both mossling packs, the mere's wisps, Greyback, the wallow, Gritmaw and
  // the quarry camp
  const fights = shard.quests.quests.filter((q) => q.id !== chain.id).flatMap((q) => q.steps.flatMap((s) => s.done.all ?? []));
  for (const body of ['mossling-1', 'mossling-stones-1', 'mere-wisp-1', 'greyback', 'wallow-sow-1', 'gritmaw', 'quarry-blob-1']) expect(fights, body).toContain(`dead:${body}`);
  expect(fights).toContain(FLAGS.blob);
});
