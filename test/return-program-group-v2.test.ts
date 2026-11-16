import { beforeAll, expect, test, vi } from 'vitest';
import { Scope } from '@wildshard/engine/app/scope';
import { Rng } from '@wildshard/engine/core/rng';
import { ScriptModuleV2 } from '@wildshard/engine/script/moduleV2';
import { GroupStepV2 } from '@wildshard/engine/script/groupStepV2';
import { ReturnProgram } from '@wildshard/engine/game/population/returnProgram';
import { namedJsonSchema } from '../src/sharddev/formatJsonSchema';
import { ReturnProgramSchema } from '@wildshard/format/namedJsonContracts';
import { fixtureNativeJson } from './fixtures/productFile';

import {parseReturnProjectionV2} from '@wildshard/format/returnProjectionV2';
import {buildGroupFixture} from './fixtures/return-group';

let fixture: Awaited<ReturnType<typeof buildGroupFixture>>;
beforeAll(async()=>{fixture=await buildGroupFixture();});
test('numeric and distinct group profiles use one entered programme and exactly one Wasm instance', () => {
  const {descriptor}=fixture;
  const owner = new Scope('shared-groups'), Native = WebAssembly.Instance;let instances = 0;
  const spy = vi.spyOn(WebAssembly, 'Instance').mockImplementation(class extends Native {
    constructor(module: WebAssembly.Module, imports?: WebAssembly.Imports) { super(module, imports);instances++; }
  });
  try {
    const programme = ReturnProgram.page(descriptor, owner);expect(instances).toBe(1);
    expect(ReturnProgram.page(structuredClone(descriptor), owner)).toBe(programme);expect(instances).toBe(1);
    const random = new Rng(41), oracle = new Rng(41);
    expect(programme.project('run', { value: 3 }, random)).toStrictEqual({ out: 3 + oracle.next() });
    const prepare = programme.prepareGroup;if (prepare === undefined) throw new Error('Missing group loan');
    const state = Float64Array.of(0), before = random.snapshot();
    const ready = prepare({ group: 'first', handle: 1, signal: 'advance', tick: 0, state, members: [], references: [], random });
    expect(state[0]).toBe(0);expect(random.snapshot()).toStrictEqual(before);ready.accept();
    expect(state[0]).toBe(1 + oracle.next());expect(random.snapshot()).toStrictEqual(oracle.snapshot());
    const other = Float64Array.of(0, 7);
    prepare({ group: 'other', handle: 2, profile: 'second', signal: 'advance', tick: 0, state: other, members: [], references: [] }).accept();
    expect(Array.from(other)).toStrictEqual([1, 8]);
    expect(programme.project('run', { value: -0 }, random)).toStrictEqual({ out: -0 + oracle.next() });
    expect(random.snapshot()).toStrictEqual(oracle.snapshot());expect(instances).toBe(1);
  } finally { spy.mockRestore();owner.dispose(); }
});
test('full group metadata participates in cache identity before any second instance can be constructed', () => {
  const {groups,descriptor}=fixture;
  const owner = new Scope('shared-group-declarations');
  try {
    const programme = ReturnProgram.page(descriptor, owner), changed = structuredClone(descriptor);
    changed.v2.groups = { ...groups, signals: ['different'] };
    expect(() => ReturnProgram.page(changed, owner)).toThrow('Shared return declaration changed');
    expect(ReturnProgram.page(descriptor, owner)).toBe(programme);
    const unowned=ReturnProgram.page(descriptor),random=new Rng(43),oracle=new Rng(43);
    expect(unowned.project('run',{value:3},random)).toStrictEqual({out:3+oracle.next()});
    expect(unowned.prepareGroup).toBeUndefined();
    expect(() => parseReturnProjectionV2({ ...descriptor.v2, groups: { ...groups, pages: 2 } })).toThrow('pages');
  } finally { owner.dispose(); }
});
test('ancestor sliced retirement refuses group capture and acceptance without publishing the bank or RNG', () => {
  const {descriptor}=fixture;
  const parent = new Scope('group-parent'), owner = parent.child('entered'), programme = ReturnProgram.page(descriptor, owner);
  const prepare = programme.prepareGroup;if (prepare === undefined) throw new Error('Missing group loan');
  const state = Float64Array.of(0), random = new Rng(9), before = random.snapshot();
  const input = { group: 'first', handle: 1, signal: 'advance', tick: 0, state, members: [], references: [], random };
  const ready = prepare(input), disposal = parent.disposeSteps();disposal.next();
  try {
    expect(() => ready.accept()).toThrow('disposed');expect(() => prepare(input)).toThrow('disposed');
    expect(state[0]).toBe(0);expect(random.snapshot()).toStrictEqual(before);
  } finally { for (const _step of disposal) { /* Complete original owner retirement. */ } }
});
test('the shared engine loan rejects a different executable or IO reservation', () => {
  const {groups,layout,bytes}=fixture;
  const scope = new Scope('group-module-loan'), module = new ScriptModuleV2(bytes, { seed: [0, 0], initFuel: 400000, ioBytes: layout.bytes, output: [] });
  try {
    const changed = bytes.slice();changed[0] = 1;
    expect(() => new GroupStepV2(changed, groups, scope, { module, layout })).toThrow('Foreign');
    expect(() => new GroupStepV2(bytes, groups, scope, { module, layout: { ...layout, bytes: layout.bytes + 8 } })).toThrow('Foreign');
    expect(module.owns(bytes, layout.io, layout.bytes)).toBe(true);expect(module.owns(bytes, layout.io, layout.bytes + 8)).toBe(false);
  } finally { scope.dispose(); }
});
test('the full admitted named descriptor retains group rows without changing legacy witness bytes', async () => {
  const {groups,descriptor}=fixture;
  const schema = namedJsonSchema(ReturnProgramSchema), encoded = new TextEncoder().encode(JSON.stringify(descriptor));
  expect(await fixtureNativeJson(schema, encoded)).toStrictEqual(descriptor);
  const invalid = { ...descriptor, v2: { ...descriptor.v2, groups: { ...groups, callbacks: {} } } };
  await expect(fixtureNativeJson(schema, new TextEncoder().encode(JSON.stringify(invalid)))).rejects.toThrow();
  expect(ReturnProgram.page({ script: descriptor.script, bytes: descriptor.bytes }).prepareGroup).toBeUndefined();
});

test('shared capacity never broadens the numeric or group publication rights', () => {
  const {descriptor}=fixture;
  const owner = new Scope('shared-rights'), programme = ReturnProgram.page(descriptor, owner), random = new Rng(90), before = random.snapshot();
  try {
    expect(() => programme.project('run', { value: 99 }, random)).toThrow('Unexpected numeric projection state');
    expect(random.snapshot()).toStrictEqual(before);
    const state = Float64Array.of(0), prepare = programme.prepareGroup;
    if (prepare === undefined) throw new Error('Missing group loan');
    expect(() => prepare({ group: 'first', handle: 1, signal: 'badOutputs', tick: 0, state, members: [], references: [], random })).toThrow('Incomplete group candidate');
    expect(state[0]).toBe(0);expect(random.snapshot()).toStrictEqual(before);
  } finally { owner.dispose(); }
});
test('native capture cannot reenter the other side of the shared programme', () => {
  const {descriptor}=fixture;
  const owner = new Scope('shared-reentry'), programme = ReturnProgram.page(descriptor, owner), random = new Rng(91), before = random.snapshot();
  const snapshot = random.snapshot.bind(random), prepare = programme.prepareGroup;
  if (prepare === undefined) throw new Error('Missing group loan');
  const spy = vi.spyOn(random, 'snapshot').mockImplementation(() => {
    expect(() => programme.project('run', { value: 1 })).toThrow('Reentrant');return snapshot();
  });
  try {
    const state = Float64Array.of(0);prepare({ group: 'first', handle: 1, signal: 'advance', tick: 0, state, members: [], references: [], random });
    expect(state[0]).toBe(0);expect(snapshot()).toStrictEqual(before);
  } finally { spy.mockRestore();owner.dispose(); }
});
