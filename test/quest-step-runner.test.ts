import { expect, test } from 'vitest';
import { QuestStepRunner } from '../src/shared/game/quest/steps';
import { QuestHintFeed } from '../src/client/game/quest/hints';
import type { Actor } from '../src/shared/engine/combat/pipeline';
import type { HintTrigger, HintControl } from '../src/client/engine/ui/FirstHints';
import { parseQuestStepRows, parseQuestKillRows, parseQuestServiceActions } from '@wildshard/format/questSteps';
import pine from '../src/shards/pine-hollow/data/questSteps.json' with { type: 'json' };
import driftwood from '../src/shards/driftwood-isle/data/questSteps.json' with { type: 'json' };

// Made-up third shard: every supported step type driven through declared owners, without either shard's names.
const fixture = {
  version: 1, guards: [], steps: [
    { id: 'arrive', kind: 'go-to', at: { x: 2, z: 3 }, radius: 2, once: 'arrived', effects: [{ kind: 'flag', flag: 'at-town' }] },
    { id: 'hello', kind: 'talk', target: 'smith', when: { all: ['at-town'] }, effects: [{ kind: 'flag', flag: 'met' }] },
    { id: 'defeat', kind: 'kill', target: 'bandit', effects: [{ kind: 'flag', flag: 'safe' }] },
    { id: 'pick', kind: 'collect', target: 'ore', once: 'picked', effects: [{ kind: 'item', item: 'ore', count: 2 }] },
    { id: 'give', kind: 'deliver', target: 'smith', item: 'ore', count: 2, once: 'paid', effects: [{ kind: 'command', script: 'town.logic', type: 41, target: 1, value: 1 }] },
    { id: 'lead', kind: 'lead', target: 'mule', effects: [{ kind: 'flag', flag: 'led' }] },
    { id: 'follow', kind: 'follow', target: 'guide', effects: [{ kind: 'flag', flag: 'followed' }] },
    { id: 'rest', kind: 'wait', seconds: 2, when: { all: ['met'] }, once: 'rested', effects: [{ kind: 'notice', text: 'Ready' }] },
    { id: 'gate', kind: 'interact', target: 'gate', when: { all: ['rested'] }, effects: [{ kind: 'flag', flag: 'done' }] },
  ],
};
test('a made-up shard evaluates all step kinds, Script ABI commands and silent waits from plain data', () => {
  const flags = new Set<string>(), order: string[] = [], inventory: Record<string, number> = {};
  const runner = new QuestStepRunner(fixture);
  const frame = () => ({ flags: [...flags], position: { x: 2, z: 3 }, inventory });
  const commit = (effects: ReturnType<QuestStepRunner['signal']>): void => {
    for (const effect of effects) {
      if (effect.kind === 'flag') { if (effect.value === false) flags.delete(effect.flag); else flags.add(effect.flag); }
      else if (effect.kind === 'item') inventory[effect.item] = (inventory[effect.item] ?? 0) + effect.count;
      else if (effect.kind === 'take') inventory[effect.item] = (inventory[effect.item] ?? 0) - effect.count;
      else if (effect.kind === 'notice') order.push(effect.text);
      else { expect(effect).toEqual({ kind: 'command', script: 'town.logic', type: 41, target: 1, value: 1 }); order.push('reward'); }
    }
  };
  const signal = (kind: Parameters<QuestStepRunner['signal']>[0]['kind'], target: string) => { commit(runner.signal({ kind, target }, frame())); };
  signal('talk', 'smith'); expect(flags.has('met')).toBe(false);
  commit(runner.update(0, frame())); signal('talk', 'smith');
  signal('deliver', 'smith'); expect(flags.has('paid')).toBe(false);
  signal('collect', 'ore'); signal('collect', 'ore'); expect(inventory['ore']).toBe(2);
  const delivery = runner.signal({ kind: 'deliver', target: 'smith' }, frame());
  expect(inventory['ore']).toBe(2); expect(flags.has('paid')).toBe(false);
  expect(delivery[0]).toEqual({ kind: 'take', item: 'ore', count: 2 }); commit(delivery);
  signal('deliver', 'smith'); expect(inventory['ore']).toBe(0); expect(order).toEqual(['reward']);
  signal('kill', 'bandit'); signal('lead', 'mule'); signal('follow', 'guide');
  commit(runner.update(1, frame())); const saved = runner.snapshot(); runner.update(0.5, frame()); runner.restore(saved);
  expect(order).toEqual(['reward']); commit(runner.update(1, frame())); commit(runner.update(10, frame()));
  expect(order).toEqual(['reward', 'Ready']); signal('interact', 'gate');
  expect(['arrived', 'met', 'safe', 'paid', 'led', 'followed', 'rested', 'done'].every(flag => flags.has(flag))).toBe(true);
  const before = runner.snapshot(); expect(() => runner.restore({ rest: -1 })).toThrow(); expect(runner.snapshot()).toEqual(before);
  expect(runner.update(Number.NaN, frame())).toEqual([]); expect(runner.snapshot()).toEqual(before);
});

test('Pine payment commands keep their order and live guard facts supersede old death flags', () => {
  const runner = new QuestStepRunner(pine), flags = ['errand:thanked'];
  expect(runner.signal({ kind: 'talk', target: 'miller' }, { flags, inventory: {} })).toEqual([
    { kind: 'flag', flag: 'errand:paid' }, { kind: 'item', item: 'lodge-ribbon', count: 3 }, { kind: 'item', item: 'amber-resin', count: 4 },
  ]);
  expect(flags).toEqual(['errand:thanked']);
  expect(runner.signal({ kind: 'talk', target: 'miller' }, { flags: [...flags, 'errand:paid'], inventory: {} })).toEqual([]);
  expect(runner.signal({ kind: 'follow', target: 'stag' }, { flags: [] })).toEqual([{ kind: 'flag', flag: 'followed:stag' }]);
  const guard = new QuestStepRunner(driftwood), actor = { kind: 'sailor', alive: true };
  expect(guard.guard('iron-sword', { flags: ['dead:sailor'], actors: [actor] })).not.toBeNull();
  actor.alive = false; expect(guard.guard('iron-sword', { flags: [], actors: [actor] })).toBeNull();
  actor.alive = true; expect(guard.guard('iron-sword', { flags: [], actors: [actor] })).not.toBeNull();
  expect(guard.guard('iron-sword', { flags: ['dead:sailor'] })).toBeNull();
  expect(guard.guard('iron-sword', { flags: [] })).not.toBeNull();
});

test('legacy callback effects, duplicate rows, missing facts and malformed Script ABI command ids refuse', () => {
  const runner = new QuestStepRunner(fixture);
  expect(() => runner.signal({ kind: 'collect', target: 'ore' }, { flags: [] })).toThrow('inventory facts');
  expect(() => parseQuestStepRows({ version: 1, guards: [], steps: [fixture.steps[0], fixture.steps[0]] })).toThrow();
  for (const effect of [{ kind: 'call', owner: 'missing' }, { kind: 'command', script: 'town.logic', type: 0, target: 1, value: 0 }])
    expect(() => new QuestStepRunner({ version: 1, guards: [], steps: [{ id: 'bad', kind: 'talk', effects: [effect] }] })).toThrow();
  for (const effect of [{ kind: 'item', item: 'ore', count: 1 }, { kind: 'notice', text: 'Hello' }])
    expect(() => parseQuestKillRows({ step: 'fixture.kills', prefix: 'fixture.', runner: { version: 1, guards: [],
      steps: [{ id: 'kill', kind: 'kill', target: 'bandit', effects: [effect] }] } })).toThrow('only flag effects');
});

test('made-up onboarding rows keep priority, live actor scans and existing learned controls', () => {
  const rows = { hostile: ['bandit'], scanEvery: 0.1, maxScan: 2, windupRadius: 8, hints: [
    { control: 'dodge', when: [{ kind: 'windup', seconds: 1 }] },
    { control: 'attack', when: [{ kind: 'nearest', relation: 'lt', radius: 4 }] },
    { control: 'lock', when: [{ kind: 'done', control: 'attack' }, { kind: 'lockable' }] },
    { control: 'use', when: [{ kind: 'prompt', contains: 'Speak' }], touch: 'Speak', desk: 'Use' },
    { control: 'move', when: [] },
    { control: 'jump', when: [{ kind: 'done', control: 'move' }, { kind: 'walked', metres: 5 }, { kind: 'nearest', relation: 'gt', radius: 8 }] },
  ], system: { id: 'copper-tutorial', after: [], before: [] } };
  const actor: Actor = { id: 'bandit', tags: [], state: [], attributes: { health: 10, maxHealth: 10 }, alive: true, applyDamage: () => false };
  const body = { kind: 'bandit', alive: true, hidden: false, position: { x: 3, z: 0 }, combatActor: () => actor };
  const learned = new Set<HintControl>(); let triggers: HintTrigger[] = [], prompt = '';
  const hints = { distance: 6, done: (control: HintControl) => learned.has(control), feed: (value: HintTrigger[]) => { triggers = value; } };
  const feed = new QuestHintFeed(rows, { hints, animals: () => [body], player: { position: { x: 0, z: 0 } }, prompt: () => prompt }, { state: 'available' });
  const shown = (): string[] => triggers.filter(row => row.when()).map(row => row.control);
  expect(triggers.map(row => row.control)).toEqual(['dodge', 'attack', 'lock', 'use', 'move', 'jump']);
  feed.update(0); expect(shown()).toEqual(['attack', 'move']);
  feed.windup(actor); expect(shown()[0]).toBe('dodge');
  learned.add('attack'); prompt = 'Speak to the smith';
  expect(shown()).toEqual(['dodge', 'attack', 'lock', 'use', 'move']);
  expect(triggers.find(row => row.control === 'use')?.touch).toBe('Speak');
  feed.update(1); expect(shown()).not.toContain('dodge');
  body.hidden = true; learned.add('move'); feed.update(0.1);
  expect(shown()).toContain('jump'); expect(shown()).not.toContain('attack');
  expect([...learned]).toEqual(['attack', 'move']);
});


test('closed quest services refuse reflected calls, unknown stings and duplicate action ids', () => {
  const action = { id: 'notice', effects: [{ kind: 'toast', text: 'Found', counter: { prefix: 'found:', of: 3 } }, { kind: 'sting', name: 'pickup' }] };
  expect(parseQuestServiceActions({ version: 1, actions: [action] }).actions).toEqual([action]);
  expect(() => parseQuestServiceActions({ version: 1, actions: [action, action] })).toThrow('unique');
  for (const effect of [{ kind: 'call', owner: 'music', path: ['sting'] }, { kind: 'sting', name: 'invented' },
    { kind: 'toast', text: 'Found', counter: { prefix: 'found:', of: 0 } }, { kind: 'command', script: 'missing', type: 1, target: 1, value: 0 }]) {
    expect(() => parseQuestServiceActions({ version: 1, actions: [{ id: 'invalid', effects: [effect] }] })).toThrow();
  }
});
