import { expect, it } from 'vitest';
import { ScenarioWorld, scenarioCommand } from '../test/scriptScenario';
import { SCRIPT_V1_COMMANDS as commands, SCRIPT_V1_LISTS as lists, SCRIPT_V1_READS as reads } from '@wildshard/format/scriptAbiV1';
import type { DecisionContext, DecisionScript } from '@wildshard/engine/script/decision';

const script: DecisionScript = {
  id: 'sample', module: 'a'.repeat(64), side: 'sim', on: ['start', 'timer', 'move.done'], tick: null,
  stateVersion: 1, state: [], params: {}, onFail: 'hold', reads: ['nearestPlayer'], lists: ['playersWithin'], commands: ['move', 'cue', 'timer'],
  ids: { actors: { flyer: 7 }, moves: { takeoff: 2, stalk: 3 }, timers: { rest: 1 }, cues: { cry: 4 } },
};
const context: DecisionContext = { tick: 6, binding: { id: 1, script: 'sample', self: 7, actors: [7], instance: 0 }, script, observed: new Set([101, 102]) };

it('answers positions and horizontal distance with stable distance/id list ordering', () => {
  const world = new ScenarioWorld({ actors: [{ id: 7, at: [0, 20, 0] }], players: [
    { id: 102, at: [-3, 100, 4] }, { id: 101, at: [3, -10, 4] }, { id: 103, at: [0, 0, 20], alive: false },
  ] });
  expect(world.read(reads.nearestPlayer, 7, 0, context)).toBe(101);
  expect(world.read(reads.distance, 7, 101, context)).toBe(5);
  expect(world.read(reads.y, 7, 0, context)).toBe(20);
  const result = new Float64Array(4);
  expect(world.list(lists.playersWithin, 7, 5, result, context)).toBe(2);
  expect([...result]).toEqual([101, 102, 0, 0]);
  expect(world.list(lists.playersWithin, 7, 5, new Float64Array(1), context)).toBe(1);
});

it('uses declared zone/flag observations and explicit navigation answers', () => {
  const world = new ScenarioWorld({ actors: [{ id: 7, at: [0, 0, 0], fields: { 1: 2 }, spawn: 9 }], players: [{ id: 101, at: [1, 0, 0] }],
    zones: [{ id: 2, min: [-2, -2, -2], max: [2, 2, 2] }], flags: { 4: true }, playerFlags: { 101: { 5: true } },
    lists: [{ op: lists.groundHeight, a: 8, b: 9, result: [12] }],
  });
  expect(world.read(reads.playersInZone, 2, 0, context)).toBe(1);
  expect(world.read(reads.actorInZone, 7, 2, context)).toBe(1);
  expect(world.read(reads.flag, 4, 0, context)).toBe(1);
  expect(world.read(reads.playerFlag, 101, 5, context)).toBe(1);
  expect(world.read(reads.field, 7, 1, context)).toBe(2);
  expect(world.read(reads.spawnGroupAlive, 9, 0, context)).toBe(1);
  const out = new Float64Array(1); expect(world.list(lists.groundHeight, 8, 9, out, context)).toBe(1); expect(out[0]).toBe(12);
  expect(() => world.list(lists.path, 8, 9, out, context)).toThrow('Missing scenario list');
  expect(() => world.read(reads.random, 0, 0, context)).toThrow('DecisionHost');
  expect(() => world.read(reads.timerLeft, 1, 0, context)).toThrow('DecisionHost');
});

it('validates fixture transactions before commit and leaves refusal observations untouched', () => {
  const world = new ScenarioWorld({ actors: [{ id: 7, at: [0, 0, 0], fields: { 1: 0 } }] });
  expect(() => world.prepare([[commands.flag, 0, 3, 1, 0], [commands.move, 999, 2, 0, 0]], context)).toThrow('actor');
  expect(world.read(reads.flag, 3, 0, context)).toBe(0);
  const transaction = world.prepare([[commands.flag, 0, 3, 1, 0], [commands.field, 7, 1, 2, 0]], context);
  expect(world.read(reads.field, 7, 1, context)).toBe(0);
  transaction.commit();
  expect(world.read(reads.field, 7, 1, context)).toBe(2);
  expect(world.read(reads.flag, 3, 0, context)).toBe(1);
});

it('copies logical observations and refuses invalid fixture restores without mutation', () => {
  const world = new ScenarioWorld({ actors: [{ id: 7, at: [1, 2, 3] }] });
  const saved = world.snapshot();
  world.setActor({ id: 7, at: [4, 5, 6] });
  expect(saved.actors?.[0]?.at).toEqual([1, 2, 3]);
  expect(() => world.restore({ actors: [{ id: 7, at: [0, 0, 0] }], players: [{ id: 7, at: [0, 0, 0] }] })).toThrow('duplicate');
  expect(world.read(reads.x, 7, 0, context)).toBe(4);
  world.restore(saved); expect(world.read(reads.x, 7, 0, context)).toBe(1);
  expect(() => world.setActor({ id: 7, at: [Number.NaN, 0, 0] })).toThrow('Non-finite');
});

it('labels real host commands without simulating their behaviour', () => {
  expect(scenarioCommand(script, [commands.move, 7, 2, 0, 0])).toEqual(['move', 'flyer', 'takeoff']);
  expect(scenarioCommand(script, [commands.move, 7, 3, 101, 0])).toEqual(['move', 'flyer', 'stalk', 101]);
  expect(scenarioCommand(script, [commands.cue, 0, 4, 0, 0])).toEqual(['cue', 'cry']);
  expect(scenarioCommand(script, [commands.timer, 0, 1, 2, 0])).toEqual(['timer', 'rest', 2]);
  expect(() => scenarioCommand(script, [commands.move, 7, 999, 0, 0])).toThrow('Unknown scenario moves');
});

it('world transactions verify actual player kind, observation and ownership before applying any command', () => {
  const world = new ScenarioWorld({ actors: [{ id: 7, at: [0, 0, 0] }, { id: 102, at: [0, 0, 0] }], players: [{ id: 101, at: [0, 0, 0], fields: { 1: 0 } }] });
  expect(() => world.prepare([[commands.flag, 0, 3, 1, 0], [commands.grant, 102, 4, 0, 0]], context)).toThrow('observed player');
  expect(world.read(reads.flag, 3, 0, context)).toBe(0);
  expect(() => world.prepare([[commands.move, 102, 1, 0, 0]], context)).toThrow('ownership');
  expect(() => world.prepare([[commands.field, 101, 1, 1, 0]], { ...context, binding: { ...context.binding, actors: [7, 101] } })).toThrow('ownership');
  expect(() => world.prepare([[commands.grant, 101, 4, 0, 0]], { ...context, observed: new Set() })).toThrow('observed player');
  world.prepare([[commands.flag, 101, 3, 1, 0]], context).commit();
  expect(world.read(reads.playerFlag, 101, 3, context)).toBe(1); expect(world.read(reads.flag, 3, 0, context)).toBe(0);
});

it('field declarations and bounds survive snapshots and still refuse replayed invalid transactions', () => {
  const world = new ScenarioWorld({ actors: [{ id: 7, at: [0, 0, 0], fields: { 1: 0 }, fieldBounds: { 1: { min: 0, max: 2, integer: true } } }] });
  const saved = world.snapshot(); world.restore(saved);
  for (const [field, value] of [[1, 3], [1, 0.5], [2, 1]]) {
    expect(() => world.prepare([[commands.flag, 0, 3, 1, 0], [commands.field, 7, field ?? 0, value ?? 0, 0]], context)).toThrow('bounds');
  }
  expect(world.read(reads.field, 7, 1, context)).toBe(0); expect(world.read(reads.flag, 3, 0, context)).toBe(0);
  expect(() => world.restore({ actors: [{ id: 7, at: [0, 0, 0], fields: { 1: 0 }, fieldBounds: { 1: { min: Number.NaN, max: 2 } } }] })).toThrow('Non-finite');
});
