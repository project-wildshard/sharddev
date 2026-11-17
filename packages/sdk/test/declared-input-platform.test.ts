import { parseItems } from '@wildshard/format/items';
import { migrateEquipmentSlots, parseMigrations } from '@wildshard/format/migrations';
import { CosmeticsLocker, type CosmeticState } from '../src/client/game/cosmetics/locker';
import { declaredItemContext } from '../src/shared/game/shardfile/items';
import { expect, test } from 'vitest';
import { Scope } from '../src/shared/engine/app/scope';
import { InputService } from '../src/client/engine/input/InputService';
import { parsePlumbing } from '@wildshard/format/plumbing';
import { InputExtraSchema, inputWhenMatches } from '@wildshard/format/inputDeclarations';
import { installDeclaredPlumbing, plumbingKnob } from '../src/client/game/shard/declaredPlumbing';
import * as v from 'valibot';

// A fictional shard declares its own controls, conditional context and tier policy.
const rows = {
  namespace: 'harbour', debug: [],
  knobs: [{ id: 'harbour.sprayScale', phone: 0.5, desktop: 1 }, { id: 'harbour.sprayShadows', phone: false, desktop: true }],
  input: [{ id: 'harbour.sail', priority: 20, keysFrom: 'weapon.melee',
    actions: [{ id: 'attack' }, { id: 'harbour.horn', keys: ['KeyG'], scene: 'harbour.soundHorn' }], blocks: ['aim'],
    when: { mode: 'board', item: 'weapon.harbour.sail', flag: 'harbour.castOff' },
    relabel: { r0: { label: 'Furl', tone: 'ready' } }, verbs: { 'verb.1': { action: 'harbour.horn', label: 'Horn', icon: 'bell' } },
    describe: [{ group: 'combat', id: 'harbour.horn', label: 'Sound horn', actions: ['harbour.horn'] }],
  }],
} as const;

test('declared conditional input inherits keys and leaves no context after disposal', () => {
  const scope = new Scope('declared-input'), input = new InputService(() => 0), scenes: string[] = [];
  input.register({ id: 'weapon.melee', actions: ['attack'], keys: { attack: ['KeyF'] } }, scope);
  const state = { mode: 'foot', item: 'weapon.harbour.sail', flags: [] as string[] };
  const handles = installDeclaredPlumbing(parsePlumbing(rows), { instance: 'harbour', tier: 'phone', scope, input,
    active: () => true, scene: id => { scenes.push(id); }, knobs: schema => { expect(schema.defaults['harbour.sprayScale']).toBe(0.5); }, debugRow: () => { throw new Error('Unexpected fixture Debug row'); }, observation: state });
  const context = handles.contexts.get('harbour.sail');
  if (context === undefined) throw new Error('Missing declared context');
  expect(input.active(context)).toBe(false);
  expect(input.bindings.defaultKeys(context)['attack']).toEqual(['KeyF']);
  state.mode = 'board'; state.flags.push('harbour.castOff'); handles.update();
  expect(input.active(context)).toBe(true); expect(input.allowed('aim')).toBe(false);
  input.executeCommand({ kind: 'press', action: 'harbour.horn', at: 1 });
  expect(scenes).toEqual(['harbour.soundHorn']);
  state.item = 'weapon.harbour.oar'; handles.update();
  expect(input.active(context)).toBe(false);
  input.executeCommand({ kind: 'press', action: 'harbour.horn', at: 2 }); expect(scenes).toHaveLength(1);
  expect(handles.knob('harbour.sprayScale')).toBe(0.5); expect(handles.knob('harbour.sprayShadows')).toBe(false);
  expect(() => handles.knob('harbour.missing')).toThrow('Unknown declared knob');
  expect(() => handles.knob('constructor')).toThrow('Unknown declared knob');
  scope.dispose(); expect(input.has(context)).toBe(false);
  expect(input.bindings.table.rows).toHaveLength(0);
});

test('mode, item and flag conditions form a closed conjunction', () => {
  const state = { mode: 'board', item: 'weapon.harbour.sail', flags: ['harbour.castOff'] };
  expect(inputWhenMatches(rows.input[0].when, state)).toBe(true);
  expect(inputWhenMatches({ notMode: 'board' }, state)).toBe(false);
  expect(inputWhenMatches({ flag: 'harbour.docked' }, state)).toBe(false);
  expect(inputWhenMatches({ mode: 'board', notMode: 'swim', item: 'weapon.harbour.sail' }, state)).toBe(true);
});

test('plumbing refuses foreign actions, mixed knob kinds and executable conditions', () => {
  expect(() => parsePlumbing({ ...rows, knobs: [{ id: 'harbour.scale', phone: false, desktop: 1 }] })).toThrow();
  expect(() => parsePlumbing({ ...rows, input: [{ ...rows.input[0], actions: [{ id: 'another.horn' }] }] })).toThrow();
  expect(() => parsePlumbing({ ...rows, input: [{ ...rows.input[0], when: { predicate: () => true } }] })).toThrow();
  expect(() => parsePlumbing({ ...rows, input: [{ ...rows.input[0], verbs: { 'verb.1': { action: 'harbour.missing', label: 'Bad', icon: 'bad' } } }] })).toThrow();
  let called = false; const executable = { ...rows };
  Object.defineProperty(executable, 'namespace', { enumerable: true, get: () => { called = true; return 'harbour'; } });
  expect(() => parsePlumbing(executable)).toThrow(); expect(called).toBe(false);
});

test('extra item contexts accept rows and reject callback hooks', () => {
  expect(v.parse(InputExtraSchema, { actions: [{ id: 'harbour.horn', keys: ['KeyG'] }], hiddenWhen: { mode: 'board' } }).actions).toHaveLength(1);
  expect(() => v.parse(InputExtraSchema, { show: () => true })).toThrow();
});


test('a weapon-bound extra context retains bindings, relabels and closed visibility', () => {
  const data = parseItems({ version: 1, rows: [], contexts: [{ id: 'harbour.sail', keysFrom: 'weapon.melee',
    actions: ['attack', 'heavy', 'lock'], touch: 'melee', lockable: true,
    extra: { actions: [{ id: 'harbour.horn', keys: ['KeyG'] }], hiddenWhen: { mode: 'board' },
      relabel: { r0: { label: 'Furl' } }, verbs: { 'verb.1': { action: 'harbour.horn', label: 'Horn', icon: 'bell' } } } }],
    loadout: { primary: null, secondary: null, tools: [] } });
  const row = data.contexts[0]; if (row === undefined) throw new Error('Missing fixture');
  const state = { mode: 'foot', item: null, flags: [] }, definition = declaredItemContext(row, state);
  expect(definition.actions).toEqual(['attack', 'heavy', 'lock', 'harbour.horn']);
  expect(definition.keys?.['harbour.horn']).toEqual(['KeyG']); expect(definition.touch?.relabel.r0?.label).toBe('Furl');
  const verb = definition.touch?.verbs?.['verb.1']; if (typeof verb !== 'object') throw new Error('Missing fixture verb');
  expect(verb.show?.()).toBe(true); state.mode = 'board'; expect(verb.show?.()).toBe(false);
  expect(() => declaredItemContext(row)).toThrow('host observations');
});

test('old fan and whip cosmetic saves migrate before filtering and remain idempotent', () => {
  for (const [from, to] of [['far-fan', 'declared.weapon.far-reach.fan'], ['sunscar-whip', 'declared.weapon.sunscar-whip']] as const) {
    const migrations = parseMigrations([{ from: 1, to: 2, fields: [], equipmentSlots: [{ from, to }] }]);
    let saved: CosmeticState = { owned: ['old-skin', 'new-skin'], worn: { [from]: 'old-skin' } }, writes = 0;
    const skinRows = [{ id: 'old-skin', slot: to }, { id: 'new-skin', slot: to }];
    const profile = { migrations, slot: (row: typeof skinRows[number]) => row.slot,
      save: { read: () => saved, write: (state: CosmeticState) => { saved = state; writes++; return true; } } };
    const restored = new CosmeticsLocker('harbour', skinRows, profile);
    expect(restored.wearing(to)?.id).toBe('old-skin'); expect(saved.worn).toEqual({ [to]: 'old-skin' }); expect(writes).toBe(1);
    const again = new CosmeticsLocker('harbour', skinRows, profile);
    expect(again.wearing(to)?.id).toBe('old-skin'); expect(writes).toBe(1);
    const collision = { [from]: 'old-skin', [to]: 'new-skin' };
    expect(migrateEquipmentSlots(collision, migrations)).toEqual({ [to]: 'new-skin' }); expect(collision[from]).toBe('old-skin');
  }
});


test('declared quality defaults and namespaced policy overrides retain kind and identity', () => {
  expect(plumbingKnob(rows, 'phone', 'harbour.sprayScale', 'number')).toBe(0.5);
  expect(plumbingKnob(rows, 'desktop', 'harbour.sprayShadows', 'boolean')).toBe(true);
  expect(plumbingKnob(rows, 'phone', 'harbour.sprayScale', 'number', { 'harbour.sprayScale': 0.375 })).toBe(0.375);
  expect(() => plumbingKnob(rows, 'phone', 'harbour.missing', 'number', { 'harbour.missing': 1 })).toThrow();
  expect(() => plumbingKnob(rows, 'phone', 'harbour.sprayScale', 'boolean')).toThrow();
  expect(() => plumbingKnob(rows, 'phone', 'harbour.sprayScale', 'number', { 'harbour.sprayScale': Infinity })).toThrow();
});


test('slot migration rows and saves reject executable properties before reading them', () => {
  const step = { from: 1, to: 2, fields: [] }; let called = false;
  Object.defineProperty(step, 'equipmentSlots', { enumerable: true, get: () => { called = true; return []; } });
  expect(() => parseMigrations([step])).toThrow(); expect(called).toBe(false);
  const worn = {}; Object.defineProperty(worn, 'old', { enumerable: true, get: () => { called = true; return 'skin'; } });
  expect(() => migrateEquipmentSlots(worn, [])).toThrow(); expect(called).toBe(false);
  expect(migrateEquipmentSlots({}, parseMigrations([{ from: 1, to: 2, fields: [], equipmentSlots: [{ from: 'constructor', to: 'declared.weapon.harbour.sail' }] }]))).toEqual({});
});


test('Pine declared cabin policy survives GRID trim and alternate-tier construction', async () => {
  const { TIER, TIER_CONFIG, initializeTier, applyLevelTier, buildTier } = await import('../src/client/engine/core/tier');
  const { withTier } = await import('../src/client/engine/explore/tiers');
  const { default: plumbing } = await import('../src/shards/pine-hollow/data/plumbing.json');
  const { default: nine } = await import('../src/shards/nine-dragon-stack/data/plumbing.json');
  const saved = { ...TIER_CONFIG }, savedTier = TIER;
  try {
    expect(plumbingKnob(nine, 'phone', 'nine.paintSize', 'number')).toBe(512);
    expect(plumbingKnob(nine, 'desktop', 'nine.paintSize', 'number')).toBe(1024);
    expect(plumbingKnob(nine, 'phone', 'nine.decalScale', 'number')).toBe(0.5);
    expect(plumbingKnob(nine, 'desktop', 'nine.decalScale', 'number')).toBe(1);
    initializeTier('phone');
    // 70 m and its 75 % trim, 52.5 m, are the retired Pine tier's cabin reach with the G187 view trim off and on.
    expect(plumbingKnob(plumbing, buildTier(), 'pine.cabinDetailDist', 'number', TIER_CONFIG)).toBe(70);
    applyLevelTier({ 'pine.cabinDetailDist': 52.5 });
    expect(plumbingKnob(plumbing, buildTier(), 'pine.cabinDetailDist', 'number', TIER_CONFIG)).toBe(52.5);
    expect(withTier('desktop', () => plumbingKnob(plumbing, buildTier(), 'pine.cabinDetailDist', 'number', TIER_CONFIG))).toBe(160);
    expect(plumbingKnob(plumbing, buildTier(), 'pine.cabinDetailDist', 'number', TIER_CONFIG)).toBe(52.5);
    applyLevelTier(undefined);
    expect(plumbingKnob(plumbing, buildTier(), 'pine.cabinDetailDist', 'number', TIER_CONFIG)).toBe(70);
    initializeTier('desktop');
    expect(plumbingKnob(plumbing, buildTier(), 'pine.cabinDetailShadows', 'boolean', TIER_CONFIG)).toBe(true);
  } finally { initializeTier(savedTier); Object.assign(TIER_CONFIG, saved); }
});
