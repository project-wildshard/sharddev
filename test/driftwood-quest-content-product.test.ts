import { expect, test } from 'vitest';
import { Flags } from '../src/shared/engine/world/interact/flags';
import { QuestState, lineFor } from '../src/shared/engine/quest/core';
import { parseQuestStory } from '@wildshard/format/questStory';
import { output } from '../src/shards/driftwood-isle/generators/output';
import { DRIFTWOOD_QUESTS, DRIFTWOOD_MARKERS } from '../src/shards/driftwood-isle/generators/quests';
import { DRIFTWOOD as source } from './fixtures/driftwood-program';
import { QUEST_NPCS } from '../src/shards/driftwood-isle/generators/questNpcs';
import { DRIFTWOOD_FEATS } from '../src/shards/driftwood-isle/generators/questInventory';

const QUEST_HOST = source.questHost;
const DRIFTWOOD_QUEST = DRIFTWOOD_QUESTS.quests[0];
if (DRIFTWOOD_QUEST === undefined) throw new Error('Missing declared chapter');

test('the retained DW producer preserves story, POI anchors, NPC policy and ordered command routes', () => {
  // The declaration Driftwood's real source program admits (the fixture builds it once) and the story bytes its producer
  // emits (a static named file of every product), without rebuilding the whole product's assets.
  const loaded = { shard: source, output, assets: output.assets };
  const { achievements } = loaded.shard.quests;
  expect(achievements).toEqual(DRIFTWOOD_FEATS);
  const storyFile = loaded.output.namedFiles?.find(file => file.name === 'quests/story.json');
  const storyBytes = storyFile === undefined ? undefined : loaded.assets.get(storyFile.hash);
  if (storyBytes === undefined) throw new Error('The product must contain named story rows');
  const story = parseQuestStory(JSON.parse(new TextDecoder().decode(storyBytes)));
  expect(story.quest.id).toBe('sealed-ring');
  expect(loaded.shard.questHost).toEqual(QUEST_HOST);
  expect(QUEST_HOST?.commands.routes.map(route => [route.value, route.spot])).toEqual([
    [1, 'iron-sword'], [100, 'castaway-chest'], [101, 'beacon'], [102, 'shard-lookout'],
    [103, 'hold-key'], [104, 'hold-pump'], [105, 'hold-winch'], [106, 'strongbox'],
    [110, 'sluice'], [111, 'shard-cave'], [112, 'altar'], [113, 'reef-treasure'],
    [114, 'vista-bench'], [0, 'castaway.talk'], [2, 'zipline'],
  ]);
  expect(QUEST_HOST?.commands.inputs).toMatchObject({ riding: 'event:quest.zipline-riding' });
  expect(QUEST_HOST?.observations).toContainEqual({
    binding: 'event:quest.zipline-riding', kind: 'cable', cable: 'driftwood.zipline', state: 'riding',
  });
  expect(QUEST_HOST?.commands.routes.find(route => route.spot === 'zipline')).toMatchObject({
    value: 2, when: '!riding', action: { kind: 'cable', cable: 'driftwood.zipline', command: 'start' },
  });
  expect(DRIFTWOOD_MARKERS['shrine']).toEqual({ poi: 'shrine', anchor: 'shrine.altar', x: 0, z: 2.4 });
  expect(DRIFTWOOD_MARKERS['captain']).toEqual({ poi: 'shrine', anchor: 'shrine.pool', x: 0, z: 9 });
  expect(DRIFTWOOD_MARKERS['ring']).toEqual({ poi: 'shrine', anchor: 'shrine.reward', x: 0, z: 6 });
}, 30_000);

test('Wendell and the complete quest retain flag progression and old-save restoration at every beat', () => {
  const npc = QUEST_NPCS[0].npc;
  const flags = new Flags('compiled-driftwood-story', false);
  const quest = new QuestState(DRIFTWOOD_QUEST, flags);
  try {
    const opening = lineFor(npc, flags);
    expect(opening?.sets).toEqual(['talked:castaway']);
    expect(quest.isStarted).toBe(false);
    for (const flag of opening?.sets ?? []) flags.set(flag);
    expect(quest.current?.id).toBe('shards');
    for (const step of DRIFTWOOD_QUEST.steps) {
      expect(quest.current?.id).toBe(step.id);
      const restoredFlags = new Flags('restored-driftwood-story', false);
      restoredFlags.restore(flags.all);
      const restored = new QuestState(DRIFTWOOD_QUEST, restoredFlags);
      try {
        restored.restore({ version: 1, id: 'sealed-ring', started: true, currentId: step.id });
        expect(restored.current?.id).toBe(step.id);
        expect(lineFor(npc, restoredFlags)).toEqual(lineFor(npc, flags));
      } finally { restored.dispose(); }
      for (const flag of step.done.all ?? []) flags.set(flag);
    }
    expect(quest.isComplete).toBe(true);
    const saved = flags.all;
    flags.reset(); flags.restore(saved);
    expect(quest.isComplete).toBe(true);
    expect(lineFor(npc, flags)?.lines[0]).toContain('The planet, right in the ring!');
  } finally { quest.dispose(); }
});
