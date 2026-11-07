import { expect, test } from 'vitest';
import { PINE_PREPARED_OUTPUT as pine } from './fixtures/pine-program';
import { output as driftwood } from '../src/shards/driftwood-isle/generators/output';
import { forestStory } from '../src/shards/pine-hollow/generators/forestStory';
import { PINE_PANELS } from '../src/shards/pine-hollow/generators/panels';
import { validateNamedJsonSchema } from '../src/shared/game/shardfile/customSchema';
import { PINE_SOURCES } from './fixtures/pine-sources';

const { FOREST_STORY } = forestStory(PINE_SOURCES);

const encode = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));
for (const [name, output] of [['pine', pine], ['driftwood', driftwood]] as const) {
  test(`${name}: named quest services and achievements admit before entered owners run`, () => {
    for (const fileName of ['quests/services.json', 'quests/achievements.json']) {
      const file = output.namedFiles.find(row => row.name === fileName);
      const bytes = file === undefined ? undefined : output.assets.get(file.hash);
      if (file === undefined || bytes === undefined || file.jsonSchema === undefined) throw new Error(`Missing defining quest schema: ${fileName}`);
      expect(validateNamedJsonSchema(file.jsonSchema, bytes)).toEqual(JSON.parse(new TextDecoder().decode(bytes)));
      const bad = fileName === 'quests/services.json'
        ? { version: 1, actions: [{ id: 'foreign', effects: [{ kind: 'call', name: 'unbound' }] }] }
        : { feats: [{ id: 'impossible', count: 0 }], flags: [], prefix: '', floorTotals: true, validateTotals: true, write: 'each' };
      expect(() => validateNamedJsonSchema(file.jsonSchema, encode(bad))).toThrow('refuses its schema');
    }
  });
}

test('Pine admits talk, board, store and panel declarations in their existing documents', () => {
  const documents = [
    { name: 'quests/forest-story.json', bad: { ...FOREST_STORY, talks: { ...FOREST_STORY.talks, models: [{ source: 'callback', id: 'foreign' }] } } },
    { name: 'quests/forest-story.json', bad: { ...FOREST_STORY, talks: { ...FOREST_STORY.talks, calls: { foreign: { kind: 'hook', target: 'unbound' } } } } },
    { name: 'quests/forest-story.json', bad: { ...FOREST_STORY, board: { ...FOREST_STORY.board, radius: 0 } } },
    { name: 'quests/forest-story.json', bad: { ...FOREST_STORY, store: { ...FOREST_STORY.store, slot: '' } } },
    { name: 'quests/panels.json', bad: { ...PINE_PANELS, board: { ...PINE_PANELS.board, lifetime: 'forever' } } },
  ];
  for (const { name, bad } of documents) {
    const file = pine.namedFiles.find(row => row.name === name);
    const bytes = file === undefined ? undefined : pine.assets.get(file.hash);
    if (file === undefined || bytes === undefined || file.jsonSchema === undefined) throw new Error(`Missing board document admission: ${name}`);
    expect(validateNamedJsonSchema(file.jsonSchema, bytes)).toEqual(JSON.parse(new TextDecoder().decode(bytes)));
    expect(() => validateNamedJsonSchema(file.jsonSchema, encode(bad))).toThrow('refuses its schema');
  }
});
