import { expect, expectTypeOf, test } from 'vitest';
import { questStoryRows, questHostRows, panelDefinitionRows, type AuthorPanelTemplate, type AuthorPanelValue } from '../src/sharddev/quests';
import { worldEntryRows } from '../src/sharddev/worldScenes';
import { parseQuestStory } from '@wildshard/format/questStory';
import { parseQuestHost } from '@wildshard/format/questHost';
import { parsePanelDefinition, type PanelTemplate, type PanelValue } from '@wildshard/format/panelTemplate';
import { parseWorldEntry } from '@wildshard/format/worldEntry';
import { PAGE_STORY } from '../src/shards/pine-hollow/generators/pageStory';
import { PINE_QUEST_HOST } from '../src/shards/pine-hollow/generators/questHost';
import { PINE_PANELS } from '../src/shards/pine-hollow/generators/panels';
import type { nineMoversView } from '../src/shards/nine-dragon-stack/generators/moversView';
import type { ViewProgramRows } from '@wildshard/format/viewProgram';

test('mover author rows derive the entire native view grammar from the admitted client feature', () => {
  expectTypeOf<ReturnType<typeof nineMoversView>>().toEqualTypeOf<ViewProgramRows>();
});

test('author quest admissions preserve complete native story, routing and markup rows', () => {
  expectTypeOf<ReturnType<typeof questStoryRows>>().toEqualTypeOf<ReturnType<typeof parseQuestStory>>();
  expectTypeOf<ReturnType<typeof questHostRows>>().toEqualTypeOf<ReturnType<typeof parseQuestHost>>();
  expectTypeOf<ReturnType<typeof panelDefinitionRows>>().toEqualTypeOf<ReturnType<typeof parsePanelDefinition>>();
  expectTypeOf<AuthorPanelTemplate>().toEqualTypeOf<PanelTemplate>();
  expectTypeOf<AuthorPanelValue>().toEqualTypeOf<PanelValue>();
  for (const [owned, native, input] of [
    [questStoryRows, parseQuestStory, PAGE_STORY],
    [questHostRows, parseQuestHost, PINE_QUEST_HOST],
    [panelDefinitionRows, parsePanelDefinition, PINE_PANELS.board],
    [panelDefinitionRows, parsePanelDefinition, PINE_PANELS.count],
  ] as const) {
    expect(owned(input)).toEqual(native(input));
    expect(JSON.stringify(owned(input))).toBe(JSON.stringify(native(input)));
    for (const invalid of [null, {}, { version: 1, executable: () => 1 }]) {
      expect(() => owned(invalid)).toThrow();
      expect(() => native(invalid)).toThrow();
    }
  }
});

test('author world entry retains ordered pieces, variant policy and original refusals', () => {
  expectTypeOf<ReturnType<typeof worldEntryRows>>().toEqualTypeOf<ReturnType<typeof parseWorldEntry>>();
  const piece = { kind: 'piece', id: 'gate', name: 'Gate', file: 'gate.json', category: 'buildings', surface: 'stone',
    colliders: [], floors: [], floorPolicy: 'first', solidFloor: false, object: null };
  const input = { blocks: { pieces: [{ ...piece, id: 'first' }, { ...piece, active: 'tool-closed' }] } };
  expect(worldEntryRows(input)).toEqual(parseWorldEntry(input));
  expect(JSON.stringify(worldEntryRows(input))).toBe(JSON.stringify(parseWorldEntry(input)));
  for (const active of ['callback', 'grapple-closed']) {
    const bad = { blocks: { pieces: [{ ...piece, active }] } };
    expect(() => worldEntryRows(bad)).toThrow();
    expect(() => parseWorldEntry(bad)).toThrow();
  }
});
