import nativeStoryFixture from './fixtures/pine-native-story.json' with { type: 'json' };
// @vitest-environment happy-dom
import { PINE_BAG_ITEMS } from '../src/shards/pine-hollow/generators/questInventory';
import { DRIFTWOOD_ITEMS } from '../src/shards/driftwood-isle/generators/questInventory';
import { registerItemRow } from '../src/shared/game/bag/itemCatalog';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import * as v from 'valibot';
import { Vector3 } from 'three';
import { App } from '../src/client/engine/app/app';
import { Scope } from '../src/shared/engine/app/scope';
import { prepareScriptMemoryLease } from '../src/shared/engine/script/host';
import { readDirectorProduct } from '../src/shared/game/plugin/director';
import { Flags } from '../src/shared/engine/world/interact/flags';
import { QuestState } from '../src/shared/engine/quest/core';
import { loadHeadlessProduct } from '../src/sdk/headlessProduct';
import { builtProduct } from './fixtures/builtProduct';
import type { ShardProduct } from '../src/shared/game/shardfile/shardProduct';
import { publishBoundQuest } from '../src/shared/game/quest/boundState';
import { buildQuestChapter } from '../src/client/game/quest/chapter';
import { readChapterDirector } from '../src/client/game/quest/chapterDirector';
import { ChapterDirectorSchema, parseChapterDirector, parseChapterWake, chapterObservations } from '@wildshard/format/chapterDirector';
import type { ShardContext } from '../src/client/game/plugin/context';
import { PAGE_STORY as pineStory } from '../src/shards/pine-hollow/generators/pageStory';
import { PAGE_STORY as driftwoodStory } from '../src/shards/driftwood-isle/generators/pageStory';
import { beatFlags } from '../src/shards/pine-hollow/generators/questBeats';
import { CHAPTER_DIRECTOR as pineRows } from '../src/shards/pine-hollow/generators/chapterDirector';
import { CHAPTER_DIRECTOR as driftRows } from '../src/shards/driftwood-isle/generators/chapterDirector';

import { PINE_LIFE_ORIGINAL as pineLife } from './fixtures/pine-life';
import { driftwoodNativeInputs } from '../src/shards/driftwood-isle/generators/nativeServer';

const releaseItems = [...PINE_BAG_ITEMS, ...DRIFTWOOD_ITEMS].map(registerItemRow);
afterAll(() => { for (const release of releaseItems.reverse()) release(); });

const products = new Map<string, ShardProduct>();

test('both real chapter declarations read live values through the same renderer-free projection', () => {
  const frame = { flags: ['used:altar', 'dead:captain'], day: { night: 0.6 }, player: { x: -10, z: 20 }, reward: { x: 25, z: 30 } };
  expect(chapterObservations(driftRows.observations, frame)).toEqual({ altar: 1, dead: 1, seen: 0,
    'player-x': -10, 'player-z': 20, 'reward-x': 25, 'reward-z': 30 });
  expect(chapterObservations(pineRows.observations, frame)).toEqual({ 'night-request': 0, 'dawn-request': 0, seen: 0, 'has-clock': 1, night: 0.6 });
  frame.flags.push('seen:dawn'); frame.day.night = 0.9;
  expect(chapterObservations(pineRows.observations, frame)).toMatchObject({ seen: 1, night: 0.9 });
  expect(chapterObservations(pineRows.observations, { ...frame, day: null })).toMatchObject({ 'has-clock': 0, night: 0 });
  expect(() => chapterObservations(driftRows.observations, { ...frame, reward: null })).toThrow('pose');
});
beforeAll(async () => {
  for (const slug of ['pine-hollow', 'driftwood-isle']) products.set(slug, await loadHeadlessProduct(builtProduct(slug)));
}, 30_000);

test('Pine native product uses the shared request rows and retires executable binding data', async () => {
  const product = products.get('pine-hollow'); if (product === undefined) throw new Error('Missing real Pine product');
  expect(product.hasFile('quests/native-story.json')).toBe(false);
  const native: unknown = structuredClone(nativeStoryFixture);
  const clock = v.parse(v.object({ chapter: ChapterDirectorSchema }), native).chapter;
  expect(clock.requests).toEqual(pineRows.requests);
  const director: unknown = JSON.parse(new TextDecoder().decode(await product.file('directors/main.json')));
  expect(v.parse(v.object({ bindings: v.null() }), director).bindings).toBeNull();
});

test('Driftwood native product shares its page chapter and retires reflected bindings', async () => {
  const product = products.get('driftwood-isle'); if (product === undefined) throw new Error('Missing real Driftwood product');
  const native = { constants: driftwoodNativeInputs() };
  expect(product.hasFile('sim/headless-assembly.json')).toBe(false);
  const cues = parseChapterWake(await product.json('quests/wake-boss.json')).cues.map(({ id, operation }) => ({ id, operation }));
  expect(native).not.toHaveProperty('constants.chapterDirector');
  expect(native).not.toHaveProperty('constants.nativeChapterCues');
  expect(parseChapterDirector(await product.json('quests/chapter-director.json'))).toEqual(driftRows);
  expect(cues).toEqual([{ id: 'captain.restore', operation: 'restore' }, { id: 'captain.wake', operation: 'wake' }, { id: 'captain.dead', operation: 'effects' }]);
  const director: unknown = JSON.parse(new TextDecoder().decode(await product.file('directors/main.json')));
  expect(v.parse(v.object({ bindings: v.null() }), director).bindings).toBeNull();
});

async function fixture(slug: string, saved: readonly string[], beforeDirector?: (scope: Scope) => void) {
  const product = products.get(slug); if (product === undefined) throw new Error('Missing real product');
  const scope = new Scope('chapter-director-test'), flags = new Flags('chapter-director-test', false), events: string[] = [];
  flags.restore([...saved]);
  const definition = product.shardfile.quests.quests[0]; if (definition === undefined) throw new Error('Missing real quest');
  const quest = new QuestState(definition, flags), player = { position: new Vector3(999, 0, 999), velocity: new Vector3(), yaw: 0, pitch: 0, carried: false };
  publishBoundQuest(scope, quest);
  const day = { phase: 0.5, night: 0, set: (to: number) => { day.phase = to; events.push(`phase:${String(to)}`); return Promise.resolve(); } };
  const weapons = { visible: true }, inventory = { add: (item: string, count: number) => { events.push(`${item}:${String(count)}`); }, take: () => false };
  const context = { scope, product, app: new App() } as ShardContext;
  Object.defineProperty(context, 'game', { value: { runtime: { world: { player, sky: { dayNight: day } }, play: {
    inventory, weapons, hud: { toast: (text: string) => { events.push(text); } }, music: { sting: (name: string) => { events.push(name); } }, fullMap: { setQuest: () => undefined },
  } } } });
  const chapter = scope.run(() => buildQuestChapter(context, slug === 'pine-hollow' ? pineStory : driftwoodStory, slug === 'pine-hollow' ? { program: pineLife } : {}));
  beforeDirector?.(scope);
  try {
    const clock = await scope.run(() => readChapterDirector(context, 'quests/chapter-director.json'));
    return { scope, quest, flags, events, player, day, weapons, chapter, clock, context };
  } catch (error) { scope.dispose(); quest.dispose(); throw error; }
}

test('Pine watch and dawn retain phase duration, ordered payout and quiet completed-save reload', async () => {
  const f = await fixture('pine-hollow', ['talked:ranger']);
  try {
    expect(f.events).toEqual([]);
    f.flags.set('wait:night'); expect(f.flags.has('wait:night')).toBe(false);
    expect(f.events).toEqual(['You sit with Hale on the porch while the light goes out of the Hollow…']);
    for (let i = 0; i < 5; i++) f.clock.update(1);
    expect(f.day.phase).toBeCloseTo(0.5 + 0.42 * (25 / 36 * (3 - 10 / 6)));
    f.clock.update(1); expect(f.day.phase).toBe(0.92); expect(f.events.at(-1)).toBe('phase:0.92');
    f.events.length = 0; const flags: string[] = [];
    f.scope.onDispose(f.flags.onChange((id, on) => { if (on) flags.push(id); }));
    f.clock.run('dawn.lanterns'); expect(flags).toEqual(['lit:pond', 'lit:ridge', 'lit:den']);
    f.clock.run('dawn.caption'); expect(f.chapter.objective.root.classList.contains('ws-quest-hide')).toBe(true);
    f.events.length = 0; f.clock.run('dawn.finish');
    expect(f.events).toEqual(['amber-resin:4', "Hale's thanks · 4 amber resin — and the Warden's bow is yours to keep"]);
    expect(f.flags.has('seen:dawn')).toBe(true); expect(f.chapter.objective.root.classList.contains('ws-quest-hide')).toBe(false);
    const restored = await fixture('pine-hollow', f.flags.all);
    try { expect(restored.events).toEqual([]); restored.clock.update(1); expect(restored.events).toEqual([]); }
    finally { restored.scope.dispose(); restored.quest.dispose(); }
  } finally { f.scope.dispose(); f.quest.dispose(); }
});

test('leaving Pine during its watch stops the borrowed phase advance without granting dawn', async () => {
  const f = await fixture('pine-hollow', ['talked:ranger']);
  try {
    f.flags.set('wait:night'); f.clock.update(1); f.clock.update(1);
    const phase = f.day.phase, before = [...f.events];
    expect(phase).toBeGreaterThan(0.5); expect(phase).toBeLessThan(0.92);
    f.scope.dispose(); f.clock.update(30); f.clock.run('dawn.finish');
    expect(f.day.phase).toBe(phase); expect(f.events).toEqual(before);
    expect(f.flags.has('seen:dawn')).toBe(false); expect(f.clock.takeCues()).toEqual([]);
  } finally { f.scope.dispose(); f.quest.dispose(); }
});

test('Pine saved dawn resumes its AS stage schedule and grants once before completing', async () => {
  const f = await fixture('pine-hollow', beatFlags('dawn'));
  try {
    expect(f.quest.current?.id).toBe('dawn');
    expect(f.events).toEqual(['The Antler King falls. In the east, the sky is going grey']);
    for (let i = 0; i < 5; i++) f.clock.update(1);
    expect(f.clock.caption.root.classList.contains('show')).toBe(true);
    expect(f.chapter.objective.root.classList.contains('ws-quest-hide')).toBe(true);
    expect(f.flags.has('seen:dawn')).toBe(false);
    for (let i = 0; i < 7; i++) f.clock.update(1);
    expect(f.quest.isComplete).toBe(true); expect(f.clock.caption.root.classList.contains('show')).toBe(false);
    const credit = f.events.indexOf('amber-resin:4'), complete = f.events.indexOf("Quest complete · The Warden's Hollow");
    expect(credit).toBeGreaterThan(-1); expect(complete).toBeGreaterThan(credit);
    expect(f.events.filter(event => event === 'amber-resin:4')).toHaveLength(1);
    const before = [...f.events]; f.clock.request('dawn.request'); f.clock.update(1); expect(f.events).toEqual(before);
    const restored = await fixture('pine-hollow', f.flags.all);
    try { restored.clock.update(1); expect(restored.quest.isComplete).toBe(true); expect(restored.events).toEqual([]); }
    finally { restored.scope.dispose(); restored.quest.dispose(); }
  } finally { f.scope.dispose(); f.quest.dispose(); }
});

test('DW saved captain fight restores its body cue once; reward uses the entered player and viewmodel', async () => {
  const f = await fixture('driftwood-isle', ['talked:castaway', 'used:altar']);
  try {
    expect(f.clock.takeCues()).toEqual(['captain.restore']); expect(f.clock.takeCues()).toEqual([]);
    expect(f.events).toEqual([]); f.flags.set('dead:captain'); expect(f.clock.takeCues()).toEqual(['captain.dead']);
    f.clock.update(1); expect(f.player.carried).toBe(false);
    if (f.clock.rewardAt === null) throw new Error('Missing real baked reward pose');
    f.player.position.copy(f.clock.rewardAt); f.clock.update(1);
    expect(f.player.carried).toBe(true); expect(f.weapons.visible).toBe(false); expect(f.events).toEqual(['chunk']);
    for (let i = 0; i < 8; i++) f.clock.update(1);
    expect(f.flags.has('seen:reward')).toBe(true); expect(f.player.carried).toBe(false); expect(f.weapons.visible).toBe(true);
    const saved = f.flags.all, events = [...f.events]; f.scope.dispose(); f.clock.update(1); expect(f.events).toEqual(events);
    const restored = await fixture('driftwood-isle', saved);
    try { expect(restored.clock.takeCues()).toEqual([]); restored.clock.update(1); expect(restored.events).toEqual([]); expect(restored.player.carried).toBe(false); }
    finally { restored.scope.dispose(); restored.quest.dispose(); }
  } finally { f.scope.dispose(); f.quest.dispose(); }
});

test('leaving an active DW reward releases its borrowed player and presentation once', async () => {
  const f = await fixture('driftwood-isle', ['talked:castaway', 'used:altar']);
  try {
    f.flags.set('dead:captain');
    if (f.clock.rewardAt === null) throw new Error('Missing real baked reward pose');
    f.player.position.copy(f.clock.rewardAt); f.clock.update(1);
    expect(f.player.carried).toBe(true); expect(f.weapons.visible).toBe(false);
    expect(f.clock.caption.root.classList.contains('show')).toBe(true);
    expect(f.flags.has('seen:reward')).toBe(false);
    f.scope.dispose();
    expect(f.player.carried).toBe(false); expect(f.weapons.visible).toBe(true);
    expect(f.clock.caption.root.isConnected).toBe(false); expect(f.clock.takeCues()).toEqual([]);
    const before = [...f.events]; f.clock.update(20); f.clock.run('reward.finish');
    expect(f.events).toEqual(before); expect(f.flags.has('seen:reward')).toBe(false);
  } finally { f.scope.dispose(); f.quest.dispose(); }
});

test('chapter admission rejects shard callbacks, reflection and reward observations without a target', () => {
  expect(() => parseChapterDirector({ ...pineRows, hooks: {} })).toThrow();
  expect(() => parseChapterDirector({ ...pineRows, actions: { bad: [{ kind: 'call', owner: 'shard', path: ['run'] }] } })).toThrow();
  expect(() => parseChapterDirector({ ...pineRows, observations: { x: { read: 'reward-x' } } })).toThrow('target');
});


test('Pine chapter uses the same entered numeric decision owner as its client stag', async () => {
  // G565: the client frame carries night; the chapter's rows add leadStep (the quest on its stag step) and commit leadAppear
  const saved = ['talked:ranger', 'lit:pond', 'lit:ridge', 'used:ph-zip', 'lit:den'], f = await fixture('pine-hollow', saved);
  try {
    const frame = { i: 0, mode: 0, elapsed: 0, begin: 0, dt: .1, night: 0, playerX: 30, playerZ: -30, atX: 30, atZ: -30 };
    expect(f.chapter.project('lead', frame)['event']).toBe(0); expect(f.events).toEqual([]);
    const result = f.chapter.project('lead', { ...frame, night: 1 });
    expect(result['event']).toBe(1); expect(result['mode']).toBe(1); expect(result['leadAppear']).toBe(1);
    expect(f.events).toEqual(['On the west road, something pale is standing very still']);
    expect(f.quest.flags.all).toEqual(saved);
  } finally { f.scope.dispose(); f.quest.dispose(); }
});

test.each(['pine-hollow', 'driftwood-isle'])('chapter admission owns and consumes one prepared memory: %s', async slug => {
  const NativeMemory = WebAssembly.Memory, allocated: WebAssembly.Memory[] = [];
  const memory = vi.spyOn(WebAssembly, 'Memory').mockImplementation(class extends NativeMemory {
    constructor(descriptor: WebAssembly.MemoryDescriptor) { super(descriptor); allocated.push(this); }
  });
  let before = 0, waits = 0;
  try {
    const f = await fixture(slug, [], scope => {
      before = allocated.length;
      const timeout = scope.timeout.bind(scope);
      vi.spyOn(scope, 'timeout').mockImplementation((ms, run) => { waits++; return timeout(ms, run); });
    });
    try {
      expect(allocated.length - before).toBe(1);
      expect(waits).toBeGreaterThanOrEqual(2);
      const director = await readDirectorProduct(products.get(slug) ?? f.context.product, f.scope);
      const release = await prepareScriptMemoryLease([director.bytes], f.scope, 'task');
      release();
    } finally { f.scope.dispose(); f.quest.dispose(); }
  } finally { memory.mockRestore(); }
});

test.each(['pine-hollow', 'driftwood-isle'])('leaving during chapter memory admission refuses installation: %s', async slug => {
  let disposed: Scope | undefined;
  await expect(fixture(slug, [], scope => {
    disposed = scope;
    const timeout = scope.timeout.bind(scope);
    vi.spyOn(scope, 'timeout').mockImplementation((ms, run) => {
      const handle = timeout(ms, run); scope.dispose(); return handle;
    });
  })).rejects.toThrow('disposed');
  expect(disposed?.disposed).toBe(true);
});
