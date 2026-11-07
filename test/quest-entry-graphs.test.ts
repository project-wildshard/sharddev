// oxlint-disable-next-line import/no-nodejs-modules -- Exercise the shipped native physics binary.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { createSimHost } from '../src/server/engine/sim';
import { loadRapier } from '../src/shared/engine/physics/rapier';
import { installQuestGraph } from '../src/shared/game/plugin/quests';
import { prepareNativeQuestEntry } from '@wildshard/engine/game/quest/nativeEntry';
import { registerNativeQuestInputs } from '../src/server/game/quest/nativeInputs';
import { nativeInventorySchema } from '../src/shared/game/inventoryLaw';
import * as v from 'valibot';
import { parseQuestHost, questHostBindingRules } from '@wildshard/format/questHost';
import { PINE as pine } from './fixtures/pine-program';
import driftwood from './fixtures/driftwood-product-source';
import { pineQuestNpcs } from '../src/shards/pine-hollow/generators/questNpcs';
import { PINE_QUEST_RUNTIME, PINE_QUEST_PAYLOAD } from '../src/shards/pine-hollow/generators/questRuntime';
import { parsePineQuestRows } from '../src/shards/pine-hollow/generators/sections';
import type { QuestHostPorts } from '../src/server/game/plugin/simulation';
import { SIM_LEVEL } from './fixtures/sim-level/level';
import { PINE_FEAT_COUNTERS } from '../src/shards/pine-hollow/generators/questInventory';
import { DRIFTWOOD_FEAT_COUNTERS } from '../src/shards/driftwood-isle/generators/questInventory';
import { DRIFTWOOD_INTERACT } from '../src/shards/driftwood-isle/generators/interactables';
import { leadPlayer } from '@wildshard/engine/sim/leadPlayer';

// GR8: called, not read from a scheduler job's output
const people = pineQuestNpcs();

/** Isolate command admission with concrete mutable service observations. Full
 * living entry/save replay still runs through each actual native composition. */
function pineCommandOwners(calls: string[] = []): { owners: Omit<QuestHostPorts, 'commands' | 'fact' | 'coins'>; modal: Record<string, boolean> } {
  const row = pine.questHost; if (row === undefined || row === null) throw new Error('Missing Pine host');
  const modal: Record<string, boolean> = { riding: false, trading: false, boarding: false, reading: false, selectable: true, pickup: true };
  const spots = [...new Set(row.commands.routes.flatMap(route => route.spot === null ? [] : [route.spot]))]
    .map(id => ({ id, x: 0, y: 1.68, z: 1, radius: 3 }));
  const actions = new Map<string, (value: number) => void>(row.commands.routes.flatMap(route => {
    if (route.action.kind !== 'owner') return [];
    const id = route.action.id;
    return [[id, (value: number): void => {
      calls.push(`${id}/${String(value)}`);
      if (id === 'talk.ranger') modal['reading'] = true;
      if (id === 'quest.trade.close') modal['trading'] = false;
      if (id === 'quest.board.close') modal['boarding'] = false;
      if (id === 'quest.cancel') { modal['reading'] = false; modal['trading'] = false; modal['boarding'] = false; }
    }]];
  }));
  return { modal, owners: { spots: { interact: spots, crack: [] }, actions,
    mechanics: { cables: { seat: () => undefined, seatState: () => ({ riding: false, atEnd: false }), startSeat: () => undefined, state: () => ({ riding: modal['riding'] === true, atEnd: false }),
      start: () => { modal['riding'] = true; calls.push('cable:start'); } } },
    observations: new Map(row.observations.flatMap(value => value.kind === 'owner' ? [[value.owner, () => modal[value.owner] === true] as const] : [])) } };
}

test('both quest entries use an admitted host without changing Pine decision flag handles', () => {
  for (const source of [pine, driftwood]) {
    expect(source.questHost).toBeDefined();
    expect(questHostBindingRules(source.questHost, source.quests.flags, true)).toEqual([]);
  }
  expect(pine.quests.flags).toEqual(people.quests.flags);
  expect(pine.questHost?.flags).toContain('lever:dam-log-a');
  if (pine.questHost === undefined || pine.questHost === null) throw new Error('Missing Pine quest host');
  expect(questHostBindingRules({ ...pine.questHost, flags: [] }, pine.quests.flags, true)).not.toEqual([]);
  expect(() => parseQuestHost({ ...pine.questHost, flags: ['local', 'local'] })).toThrow('Valid native quest host');
  expect(pine.questHost.graph).toEqual(PINE_QUEST_RUNTIME.graph);
  expect(pine.questHost.interactions).toEqual(PINE_QUEST_RUNTIME.interactions);
  expect(pine.questHost.commands.step).toBeNull();
  expect(parsePineQuestRows(PINE_QUEST_PAYLOAD)).not.toHaveProperty('graph');
  expect(parsePineQuestRows(PINE_QUEST_PAYLOAD)).not.toHaveProperty('interactions');
  expect(() => parsePineQuestRows(PINE_QUEST_RUNTIME)).toThrow();
});

test('Pine declared entry preserves external action results, continuation and quiet restore', async () => {
  const rapier = await loadRapier(Uint8Array.from(readFileSync('public/assets/physics/rapier.wasm')));
  const level = { ...SIM_LEVEL, entities: [], quests: [] }, before = createSimHost(level, { rapier }), after = createSimHost(level, { rapier });
  const beforeFacts: string[] = [], afterFacts: string[] = [];
  const ports = (facts: string[]) => ({ spots: { interact: [], crack: [] }, commands: () => [],
    fact: (fact: string, entity: string) => { facts.push(`${fact}:${entity}`); }, coins: (coins: number) => { facts.push(`coins:${coins}`); } });
  try {
    const original = installQuestGraph(before, { quests: pine.quests, graph: PINE_QUEST_RUNTIME.graph,
      interactions: PINE_QUEST_RUNTIME.interactions, npcs: [] }, { ...ports(beforeFacts), drive: 'external' });
    const nextPorts = ports(afterFacts);
    registerNativeQuestInputs(after, { scripts: nextPorts.commands, walk: () => ({ x: 0, z: 0 }), ledger: nextPorts });
    const entry = prepareNativeQuestEntry(after, pine, { rows: [], external: [] }, []), current = entry.install(pineCommandOwners().owners);
    expect(() => entry.install()).toThrow('already installed');
    const saved = (host: typeof before) => [...host.adapters].map(([id, adapter]) => [id, adapter.snapshot()]);
    expect(saved(after)).toEqual(saved(before));
    for (const row of PINE_QUEST_RUNTIME.interactions.rows) {
      for (const need of row.needs ?? []) {
        for (const flag of need.none ?? []) { before.flags.clear(flag); after.flags.clear(flag); }
        for (const flag of [...need.all ?? [], ...need.any?.slice(0, 1) ?? []]) { before.flags.set(flag); after.flags.set(flag); }
      }
      expect(current.run(row.id)).toEqual(original.run(row.id));
      expect(current.run(row.id)).toEqual(original.run(row.id));
      expect(after.flags.all).toEqual(before.flags.all); expect(afterFacts).toEqual(beforeFacts);
      expect(saved(after)).toEqual(saved(before));
    }
    afterFacts.length = 0;
    for (const [id, adapter] of before.adapters) {
      const target = after.adapters.get(id);
      if (target === undefined) throw new Error(`Missing continuation ${id}`);
      const value = adapter.snapshot(); target.restore(value); expect(target.snapshot()).toEqual(value);
    }
    expect(afterFacts).toEqual([]);
  } finally { before.dispose(); after.dispose(); }
});


test('both native entries retain their declared pack policy and reject table admission before registering it', async () => {
  const rapier = await loadRapier(Uint8Array.from(readFileSync('public/assets/physics/rapier.wasm')));
  for (const source of [pine, driftwood]) {
    const host = createSimHost({ ...SIM_LEVEL, entities: [], quests: [] }, { rapier });
    try {
      registerNativeQuestInputs(host, { scripts: () => [], walk: () => ({ x: 0, z: 0 }), ledger: { fact: () => undefined, coins: () => undefined } });
      const table = { rows: [{ id: 'seat', kind: 'bench' as const, label: 'Sit', at: { poi: 'world' as const, x: 0, z: 0 } }], external: [] };
      expect(() => prepareNativeQuestEntry(host, source, table, [])).toThrow();
      const entry = prepareNativeQuestEntry(host, source, table, [{ id: 'seat', kind: 'bench' }], { ordered: true });
      const item = entry.inventory.kinds[0]; if (item === undefined) throw new Error('Missing inventory kind');
      expect(entry.pack.add(item, 2)).toBe(true);
      const saved = entry.pack.snapshot(); expect(v.parse(nativeInventorySchema(entry.inventory), saved)).toEqual(saved);
      entry.pack.take(item); entry.pack.restore(saved); expect(entry.pack.count(item)).toBe(2);
      host.dispose(); expect(() => entry.install()).toThrow('disposed');
    } finally { host.dispose(); }
  }
});


test('native entry counters preserve stable facts, quiet restore and scoped flag cadence for both stories', async () => {
  const rapier = await loadRapier(Uint8Array.from(readFileSync('public/assets/physics/rapier.wasm')));
  for (const row of [
    { source: pine, counters: PINE_FEAT_COUNTERS, flag: 'dead:king', fact: 'pine.feat.king', feat: 'king' },
    { source: driftwood, counters: DRIFTWOOD_FEAT_COUNTERS, flag: 'used:vista-bench', fact: 'driftwood.vista', feat: 'vista' },
  ]) {
    const host = createSimHost({ ...SIM_LEVEL, entities: [], quests: [] }, { rapier }), facts: string[] = [];
    try {
      registerNativeQuestInputs(host, { scripts: () => [], walk: () => ({ x: 0, z: 0 }), ledger: {
        fact: (fact, entity) => { facts.push(`${fact}/${entity}`); }, coins: () => undefined } });
      const entry = prepareNativeQuestEntry(host, row.source, { rows: [], external: [] }, []), counters = entry.achievements(row.counters);
      counters.observe(); expect(facts).toEqual([]);
      host.flags.set(row.flag); expect(facts).toEqual([`${row.fact}/${row.feat}:1`]);
      const saved = counters.snapshot(); counters.restore({}); counters.flush(); expect(facts).toHaveLength(1);
      host.flags.set('plate:move'); host.flags.set('lever:move'); expect(facts).toHaveLength(1);
      host.flags.set('settled'); expect(facts).toEqual([`${row.fact}/${row.feat}:1`, `${row.fact}/${row.feat}:1`]);
      counters.restore(saved); counters.flush(); expect(counters.snapshot()).toEqual(saved); expect(facts).toHaveLength(2);
      host.dispose(); counters.restore({}); host.flags.set('after-disposal'); expect(facts).toHaveLength(2);
    } finally { host.dispose(); }
  }
});


test('Pine admitted routes preserve same-tick modal priority, actor values, cancel and strict reach', async () => {
  const rapier = await loadRapier(Uint8Array.from(readFileSync('public/assets/physics/rapier.wasm')));
  const host = createSimHost({ ...SIM_LEVEL, entities: [], quests: [] }, { rapier }), calls: string[] = [];
  try {
    registerNativeQuestInputs(host, { scripts: () => [], walk: () => ({ x: 0, z: 0 }), ledger: { fact: () => undefined, coins: () => undefined } });
    const { owners, modal } = pineCommandOwners(calls), entry = prepareNativeQuestEntry(host, pine, { rows: [], external: [] }, []), graph = entry.install(owners);
    const command = (value: number, actorId = 'pine.interact') => graph.accept({ actorId, value });
    // Ordinary table commands use the admitted graph directly, with no custom
    // owner binding. Repeats retain the same one-way flag and fact law.
    host.flags.set('talked:ranger');
    expect(command(1)).toBe(true); expect(command(1)).toBe(true);
    expect(host.flags.has('lever:dam-log-a')).toBe(true); expect(calls).toEqual([]);
    expect(command(2)).toBe(true); expect(host.flags.has('lever:dam-log-b')).toBe(true);
    host.flags.clear('lever:dam-log-a'); host.flags.clear('lever:dam-log-b'); host.flags.clear('talked:ranger');
    expect(command(0)).toBe(true); expect(command(1)).toBe(true);
    expect(calls).toEqual(['talk.ranger/0', 'quest.reading.next/1']);
    expect(command(10, 'pine.trade')).toBe(false); expect(command(-1)).toBe(true);
    modal['boarding'] = true; modal['trading'] = true;
    command(19); command(19); command(19);
    expect(calls.slice(-3)).toEqual(['quest.trade.close/19', 'quest.board.close/19', 'talk.miller/19']);
    modal['reading'] = false;
    expect(command(10, 'pine.trade')).toBe(true);
    expect(command(0, 'pine.ammo')).toBe(true);
    expect(command(0, 'pine.lodge')).toBe(true);
    expect(calls.slice(-3)).toEqual(['quest.trade.use/10', 'quest.ammo.cycle/0', 'quest.board.use/0']);
    modal['riding'] = true; expect(command(-1)).toBe(false); expect(command(10, 'pine.trade')).toBe(false);
    modal['riding'] = false;
    leadPlayer(host).position.set(0, 0, 4); expect(command(0)).toBe(false); // Exactly three metres: still outside.
    leadPlayer(host).position.z = 3.99; expect(command(0)).toBe(true);
    expect(command(0, 'unrelated')).toBe(false);
    leadPlayer(host).position.set(0, 0, 0); modal['reading'] = false; calls.length = 0;
    graph.dispatch([{ actorId: 'pine.interact', value: 0 }, { actorId: 'pine.interact', value: 1 }]);
    expect(calls).toEqual(['talk.ranger/0', 'quest.reading.next/1']);
    modal['reading'] = false; calls.length = 0;
    graph.dispatch(Array.from({ length: 1025 }, () => ({ actorId: 'pine.ammo', value: 0 })));
    expect(calls).toHaveLength(1024);
    expect(calls.every(call => call === 'quest.ammo.cycle/0')).toBe(true);
    calls.length = 0; graph.dispatch([{ actorId: 'pine.interact', value: 8 }, { actorId: 'pine.trade', value: 10 }]);
    expect(calls).toEqual(['cable:start']); expect(modal['riding']).toBe(true);
  } finally { host.dispose(); }
});

test('native entries share direct and graph pickup transitions over their original flags and pack', async () => {
  const rapier = await loadRapier(Uint8Array.from(readFileSync('public/assets/physics/rapier.wasm')));
  for (const sample of [
    { source: pine, table: PINE_QUEST_RUNTIME.table, id: 'resin-1', touch: 'direct', pickup: 'walk-in', flag: 'resin:1', radius: 1.1, granted: 1 },
    { source: driftwood, table: DRIFTWOOD_INTERACT, id: 'glass-1', touch: 'graph', pickup: { radius: 1.2, height: 2.2 }, flag: 'glass:1', radius: 1.2, granted: 0 },
  ] as const) {
    const row = sample.table.rows.find(value => value.id === sample.id), declared = sample.source.questHost;
    if (row === undefined || declared === undefined || declared === null) throw new Error('Missing authored transition fixture');
    const host = createSimHost({ ...SIM_LEVEL, entities: [], quests: [] }, { rapier });
    try {
      registerNativeQuestInputs(host, { scripts: () => [], walk: () => ({ x: 0, z: 0 }), ledger: { fact: () => undefined, coins: () => undefined } });
      const entry = prepareNativeQuestEntry(host, sample.source, { rows: [row], external: [] }, [{ id: sample.id, kind: row.kind, x: 0, y: 0, z: 0, yaw: 0 }]);
      const policy = { ids: [sample.id], rowLimit: 1, flagLimit: 16, touch: sample.touch, pickup: sample.pickup };
      expect(() => entry.transitions({ ...policy, ids: ['absent'] })).toThrow('Unknown native transition');
      expect(() => entry.transitions({ ...policy, ids: [sample.id, sample.id] })).toThrow();
      const transitions = entry.transitions(policy);
      const ids = [...new Set([...declared.commands.routes.flatMap(route => route.spot === null ? [] : [route.spot]),
        ...declared.interactions.rows.map(value => value.at), ...declared.npcs.map(value => value.spot)])];
      entry.install({ spots: { interact: ids.map(id => ({ id, x: 0, y: 0, z: 0, radius: 3 })), crack: [] },
        mechanics: { cables: { seat: () => undefined, seatState: () => ({ riding: false, atEnd: false }), startSeat: () => undefined, state: () => ({ riding: false, atEnd: false }), start: () => undefined } },
        observations: new Map(declared.observations.flatMap(value => value.kind === 'owner' ? [[value.owner, () => true] as const] : [])),
        actions: new Map(declared.commands.routes.flatMap(route => route.action.kind === 'owner' ? [[route.action.id, () => undefined] as const] : [])) });
      leadPlayer(host).position.set(sample.radius, 0, 0); transitions.step(); expect(host.flags.has(sample.flag)).toBe(false);
      leadPlayer(host).position.x -= 0.001; transitions.step(); expect(host.flags.has(sample.flag)).toBe(true);
      expect(entry.pack.count('amber-resin')).toBe(sample.granted);
      transitions.step(); expect(entry.pack.count('amber-resin')).toBe(sample.granted);
    } finally { host.dispose(); }
  }
});
