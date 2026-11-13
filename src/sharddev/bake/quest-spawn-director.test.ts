import { expect, test } from 'vitest';
import { parseQuestSpawnPage, parseQuestLeadPage, QuestSpawnPageSchema, QuestLeadPageSchema } from '@wildshard/format/questSteps';
import { formatJsonSchema } from '../formatJsonSchema';

// G565: spawn conditions live in the script (AS); the page rows keep only the effects a raised flag publishes once
const rows = { quest: 'reed-watch', script: 'marsh.watch', channel: 2, limit: { phone: 2, desktop: 5 },
  complete: [{ flag: 'done:watch', effects: [{ kind: 'flag', flag: 'done:watch' }, { kind: 'toast', text: 'The reeds fall quiet' }, { kind: 'sting', name: 'chunk' }] }],
  cues: [{ kind: 'puff', id: 9 }], puffs: { color: [0.3, 0.4, 0.8], count: 2, height: 0.5, burst: [1, 2, 0.4, 0.6] } };

test('spawn bindings admit only bounded effects and structurally export their schema', () => {
  expect(() => formatJsonSchema(QuestSpawnPageSchema)).not.toThrow();
  expect(parseQuestSpawnPage(rows).script).toBe('marsh.watch');
  expect(() => parseQuestSpawnPage({ ...rows, cues: [...rows.cues, ...rows.cues] })).toThrow('Duplicate');
  expect(() => parseQuestSpawnPage({ ...rows, complete: [...rows.complete, ...rows.complete] })).toThrow('Duplicate');
  expect(() => parseQuestSpawnPage({ ...rows, complete: [{ ...rows.complete[0], effects: [{ kind: 'call', owner: 'page' }] }] })).toThrow();
  expect(() => parseQuestSpawnPage({ ...rows, flags: [] })).toThrow();
});

test('guide and spawn publications admit every concrete quest effect kind', () => {
  const effects = [{ kind: 'flag', flag: 'done:watch' }, { kind: 'item', item: 'reed-token', count: 2 },
    { kind: 'toast', text: 'The reeds fall quiet' }, { kind: 'sting', name: 'chunk' },
    { kind: 'reading', title: 'The watch', lines: ['A mark in the reeds'] }];
  expect(parseQuestSpawnPage({ ...rows, complete: [{ ...rows.complete[0], effects }] }).complete[0]?.effects).toEqual(effects);
  // G565: a guide's view rows carry no gate or effects (its AS and chapter rows own them)
  const guide = { quest: rows.quest, signal: 'lead', actor: { kind: 'deer', variant: 'guide' }, path: [[1, 2]],
    motion: { faceTurn: 3, trotSpeed: 4, trotTurn: 4, stopTurn: 1 }, sound: 'deer_call', puffs: { color: [1, 1, 1], count: 2, height: 1, appear: [1, 1, 1, 1], fade: [1, 1, 1, 1] } };
  expect(parseQuestLeadPage(guide).signal).toBe('lead');
  expect(() => parseQuestLeadPage({ ...guide, effects: { appear: effects, complete: effects } })).toThrow();
  expect(() => formatJsonSchema(QuestLeadPageSchema)).not.toThrow();
});
