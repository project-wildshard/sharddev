import { expect, test } from 'vitest';
import { engineMusicSlots, engineSlotsKnown } from '@wildshard/format/engineMusic';
import { lowerShard } from './lower';
import { SceneRefusalError } from './refusal';
import { sceneShardfile } from './shardfile';

// Meta MOSSGATE-ZONE MZ23: a scene shard's music and ambience lower to the format's `audio` rows the engine reads (a score
// of the engine's piano slots, a synth wind bed), with no recordings of the shard's own, and end the default silence.
const WINDS = [{ frequency: 240, q: 0.6, pan: -0.5, rate: 0.06, gain: 0.08 }, { frequency: 900, q: 1.2, pan: 0.4, rate: 0.11, gain: 0.04 }];

test('world.music and world.ambience lower to an engine-slot score and a wind bed, and end the silent score', () => {
  const scene = lowerShard({ slug: 'mz23', name: 'MZ23' }, (world) => {
    world.music({ day: 'pine', night: 'island', boss: 'title' });
    world.ambience({ winds: WINDS });
  });
  const { shard } = sceneShardfile(scene), audio = shard.audio, music = audio.music;
  if (music === undefined) throw new Error('no score');
  expect(audio.score).toBe('default');
  expect(music).toMatchObject({ id: 'score.mz23', base: 'pine', slots: ['pine', 'island', 'title'], source: null, bootSlots: ['pine'],
    catalogue: { mode: 'slots' }, lifecycle: { persistent: false, dispose: true, bossScene: 'boss' } });
  // the boss scene picks first, then night, then day (the engine's data cell sets the scene: engine 30c22f00)
  expect(music.selection.map((row) => [row.slots[0], row.when[0]?.value])).toEqual([['title', 'boss'], ['island', 'night'], ['pine', 'day']]);
  expect(engineSlotsKnown(music)).toBe(true); // J304: only the engine's piano, no shard bytes
  expect(audio.samples).toBeUndefined();
  expect(audio.ambience).toEqual({ bed: 'mz23.bed', winds: WINDS });
  expect(shard.files.some((file) => file.kind === 'audio')).toBe(false);
});

test('a scene with no sound keeps the format\'s silent default; one with music alone has no bed', () => {
  expect(sceneShardfile(lowerShard({ slug: 'quiet', name: 'Quiet' }, () => undefined)).shard.audio).toMatchObject({ score: 'silent', ambience: null });
  const day = sceneShardfile(lowerShard({ slug: 'day', name: 'Day' }, (world) => { world.music({ day: 'island' }); })).shard.audio;
  expect(day).toMatchObject({ score: 'default', ambience: null });
  expect(day.music?.slots).toEqual(['island']);
  expect(day.music?.lifecycle?.bossScene).toBeUndefined();
});

test('music and ambience refuse what the engine cannot play', () => {
  const lower = (build: Parameters<typeof lowerShard>[1]): unknown => lowerShard({ slug: 'bad', name: 'Bad' }, build);
  expect(() => lower((world) => { world.music({ day: 'harp' as 'pine' }); })).toThrow(SceneRefusalError);
  expect(() => lower((world) => { world.music({ day: 'pine' }); world.music({ day: 'island' }); })).toThrow(/twice/u);
  expect(() => lower((world) => { world.ambience({ winds: [] }); })).toThrow(/1 to 8/u);
  expect(() => lower((world) => { world.ambience({ winds: [{ frequency: 240, q: 0.6, pan: 0, rate: 0.06, gain: 0.5 }] }); })).toThrow(/ranges/u);
});

test("SF23: an own score plays the shard's copy of its pine and island slots, the engine's title alone", () => {
  const scene = lowerShard({ slug: 'mossgate', name: 'Mossgate' }, (world) => { world.music({ day: 'pine', night: 'island', boss: 'title', own: true }); });
  const music = sceneShardfile(scene).shard.audio.music;
  if (music === undefined) throw new Error('no score');
  expect(music.sets).toEqual({ pine: 'mossgate', island: 'mossgate' });
  expect(engineMusicSlots(music)).toEqual(['title']); // the boss's title theme alone is the engine's
  expect(engineSlotsKnown(music)).toBe(true);
});
