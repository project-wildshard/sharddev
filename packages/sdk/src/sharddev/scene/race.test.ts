// SHARD-SOURCE SS-MS1b: world.race times a run between two quest flags (format `quests.races`, shard-format 0.18.0); the engine
// clock (SS-MS1a2) files its fact with the time and the page shows it (SS-MS1a3).
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { parseQuestData } from '@wildshard/format/quests';
import { lowerShard } from './lower';
import { withAnchored } from './shardfile';

const gates = (world: Parameters<Parameters<typeof lowerShard>[1]>[0]): void => {
  const start = new THREE.Object3D(), finish = new THREE.Object3D();
  start.position.set(-40, 0, 0); finish.position.set(40, 0, 0); world.scene.add(start, finish);
  world.trigger('arch.start', start, { radius: 3 }); world.trigger('arch.finish', finish, { radius: 3 });
};

test('world.race lowers to a quests.races row over its flags, declared beside the triggers', () => {
  const scene = lowerShard({ slug: 's', name: 's' }, (world) => {
    gates(world);
    world.race('arch', { start: 'arch.start', stop: 'arch.finish', cap: 120 });
  });
  expect(scene.anchored.races).toEqual([{ id: 'arch', start: 'arch.start', stop: 'arch.finish', fact: 'arch', cap: 120 }]);
  const quests = withAnchored({}, scene.anchored).quests as unknown;
  const data = parseQuestData(quests);
  expect(data.races).toEqual([{ id: 'arch', start: 'arch.start', stop: 'arch.finish', fact: 'arch', cap: 120 }]);
  expect(data.flags).toEqual(['arch.start', 'arch.finish']);
});

test('a race names its fact, and its default cap is ten minutes', () => {
  const scene = lowerShard({ slug: 's', name: 's' }, (world) => { gates(world); world.race('arch', { start: 'arch.start', stop: 'arch.finish', fact: 'arch.time' }); });
  expect(scene.anchored.races).toEqual([{ id: 'arch', start: 'arch.start', stop: 'arch.finish', fact: 'arch.time', cap: 600 }]);
});

test('a race is refused at its line: one flag for both ends, a cap outside 1 to 3600 s, or an id twice', () => {
  const race = (options: { start: string; stop: string; cap?: number }, twice = false) => () => lowerShard({ slug: 's', name: 's' }, (world) => {
    gates(world); world.race('arch', options); if (twice) world.race('arch', options);
  });
  expect(race({ start: 'arch.start', stop: 'arch.start' })).toThrow(/starts and stops on one flag/u);
  expect(race({ start: 'arch.start', stop: 'arch.finish', cap: 0 })).toThrow(/cap 0 is outside 1 to 3600/u);
  expect(race({ start: 'arch.start', stop: 'arch.finish', cap: 1.5 })).toThrow(/outside 1 to 3600/u);
  expect(race({ start: 'arch.start', stop: 'arch.finish' }, true)).toThrow(/two races share this id/u);
});

test('a race names its resets: the middle gates its finish and a lapse lower, so a second run counts them again (SS-MS1c)', () => {
  const scene = lowerShard({ slug: 's', name: 's' }, (world) => {
    gates(world);
    world.race('arch', { start: 'arch.start', stop: 'arch.finish', resets: ['arch.1', 'arch.2'] });
  });
  expect(scene.anchored.races).toEqual([{ id: 'arch', start: 'arch.start', stop: 'arch.finish', fact: 'arch', cap: 600, resets: ['arch.1', 'arch.2'] }]);
  const data = parseQuestData(withAnchored({}, scene.anchored).quests as unknown);
  expect(data.races?.[0]?.resets).toEqual(['arch.1', 'arch.2']);
  expect(data.flags).toEqual(['arch.start', 'arch.finish', 'arch.1', 'arch.2']);
  const refused = (resets: string[]) => () => lowerShard({ slug: 's', name: 's' }, (world) => {
    gates(world); world.race('arch', { start: 'arch.start', stop: 'arch.finish', resets });
  });
  expect(refused(['arch.start'])).toThrow(/resets its own start or stop/u);
  expect(refused([])).toThrow(/1 to 64 flags/u);
  expect(refused(['arch.1', 'arch.1'])).toThrow(/twice/u);
});
