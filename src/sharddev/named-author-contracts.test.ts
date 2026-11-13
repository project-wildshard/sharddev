import { expect, test } from 'vitest';
import { CoverCompositionSchema } from '@wildshard/format/streamedCover';
import { CreatureInstallSchema, PackedCreatureLooksSchema } from '@wildshard/format/speciesLooks';
import { QuestPageCompositionSchema } from '@wildshard/format/questPageComposition';
import { ChapterWakeSchema } from '@wildshard/format/chapterDirector';
import { namedFormatJsonSchema, namedJsonSchema } from './formatJsonSchema';

const contracts = [
  ['streamedCover.CoverComposition', CoverCompositionSchema],
  ['speciesLooks.CreatureInstall', CreatureInstallSchema],
  ['speciesLooks.PackedCreatureLooks', PackedCreatureLooksSchema],
  ['questPageComposition.QuestPageComposition', QuestPageCompositionSchema],
  ['chapterDirector.ChapterWake', ChapterWakeSchema],
] as const;

test.each(contracts)('%s preserves every byte of the defining named producer schema', (name, defining) => {
  const original = namedJsonSchema(defining), actual = namedFormatJsonSchema(name);
  expect(JSON.stringify(actual)).toBe(JSON.stringify(original));
  expect(actual).toBe(original);
  expect(actual['$comment']).toBeUndefined();
});

test('similar foreign or misspelled consumer roots still refuse', () => {
  for (const name of ['speciesLooks.CreatureInstal', 'foreign.CoverComposition', 'chapterDirector.ChapterWakeSchema']) {
    expect(() => namedFormatJsonSchema(name)).toThrow('Unknown named format contract');
  }
});
