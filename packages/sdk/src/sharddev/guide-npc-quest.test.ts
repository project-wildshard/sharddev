// meta ONE-FORMAT OF-NE25 (NEW-SHARD-E2E F25): GUIDE section 2b's worked NPC with a quest and loot is the checked example
// file, and it builds: Wren's talk and dialogue, the quest, the death trigger, the item and the loot table all connect.
// oxlint-disable-next-line import/no-nodejs-modules -- Read the shipped guide and the example beside it.
import { readFileSync } from 'node:fs';
import { prepareAssetDecoders } from '@wildshard/format/shardfileAssets';
import { shardfileRules } from '@wildshard/format/shardSchema';
import { expect, test } from 'vitest';
import { GUIDE_SOURCE } from './agentFiles';
import wrensHives from './guide/npc-quest.example';
import { hashImmutableBytes } from './immutable';
import type { ProjectGenerationContext } from './projectGeneration';

test("GUIDE's NPC with a quest and loot is the example file, and its rows connect", async () => {
  const guide = readFileSync(GUIDE_SOURCE, 'utf8'), example = readFileSync(new URL('guide/npc-quest.example.ts', import.meta.url), 'utf8');
  expect(guide).toContain(`\`\`\`ts\n${example}\`\`\``);
  await prepareAssetDecoders();
  const ctx = { asset: (bytes: Uint8Array): string => hashImmutableBytes(bytes),
    compileScript: () => { throw new Error('the example has no script'); } } as unknown as ProjectGenerationContext;
  const { shard } = await wrensHives(ctx);
  if (shard === undefined) throw new Error('the example built no shard file');
  expect(shardfileRules(shard)).toEqual([]);
  // the talk opens Wren's tree, whose choices set the flags the quest and its last step wait on
  const talk = shard.targets.talks?.find(row => row.id === 'wren'), tree = shard.quests.dialogue.find(row => row.id === talk?.dialogue);
  const sets = new Set(tree?.nodes.flatMap(node => node.choices.flatMap(choice => choice.sets ?? [])));
  const quest = shard.quests.quests.find(row => row.id === 'honey-badger');
  expect(quest?.startWhen?.all?.every(flag => sets.has(flag))).toBe(true);
  // the badger's death trigger raises the flag the first step waits on
  const trigger = shard.quests.triggers.find(row => row.kind === 'death');
  expect(trigger).toMatchObject({ tag: `creature.${shard.creatures.spawns[0]?.species ?? ''}` });
  expect(quest?.steps[0]?.done.all).toEqual([trigger?.flag]);
  expect(quest?.steps[1]?.done.all?.every(flag => sets.has(flag))).toBe(true);
  expect(quest?.onComplete).toEqual({ fact: 'wren.paid', coins: 10 });
  // the badger's kill rolls a honeycomb, an item the catalogue names, matched by the species' kind
  const badger = shard.rows.species.find(row => row.id === 'badger'), table = shard.rows.loot[0]?.economy?.tables?.[0];
  expect(table?.table.rows.map(row => [row.item, row.match.kind])).toEqual([['honeycomb', badger?.kind]]);
  expect(shard.items.catalogue?.map(row => row.id)).toEqual(['honeycomb']);
});
