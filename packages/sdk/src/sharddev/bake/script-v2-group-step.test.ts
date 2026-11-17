import { expect, test, vi } from 'vitest';
import { AnimalSim } from '@wildshard/engine/entities/AnimalSim';
import { Scope } from '@wildshard/engine/app/scope';
import { Rng } from '@wildshard/engine/core/rng';
import { GroupBankV2 } from '@wildshard/engine/script/groupBankV2';
import { GroupStepV2 } from '@wildshard/engine/script/groupStepV2';
import { ScriptModuleV2 } from '@wildshard/engine/script/moduleV2';
import { ObservationColumnsV2 } from '@wildshard/engine/script/observationColumnsV2';
import { QueryRingV2 } from '@wildshard/engine/script/queriesV2';
import { parseGroupStepV2, groupStepColumnV2, groupStepLayoutV2 } from '@wildshard/format/scriptGroupStepV2';
import { compileScriptV2 } from './compileScriptV2';
import { v2CoreSource } from '../as/wsV2';
import { groupStepSourceV2 } from '../as/groupStepV2';
import { groupBankSourceV2 } from '../as/groupBankV2';

const rows = parseGroupStepV2({ bank: [
  { name: 'held', kind: 'number', integer: true, min: 0, max: 65535 },
  { name: 'sum', kind: 'number' }, { name: 'target', kind: 'reference' },
  { name: 'random', kind: 'number' }, { name: 'reply', kind: 'number' },
], columns: [{ name: 'z.position', id: 7, source: { kind: 'actor', field: 'x' } },
  { name: 'a.alive', id: 900, source: { kind: 'actor', field: 'alive' } }],
  members: 16, signals: ['step', 'query', 'badAction', 'badState', 'random', 'badRef', 'badMember', 'rawActor', 'badReserved', 'unusedZero', 'unusedFinite', 'unusedNaN', 'unusedInfinity'],
  actions: [{ id: 1, words: 3, member: 0 }, { id: 2, words: 1, reference: { word: 0 } }],
  outputs: 4, pages: 1, fuel: 400000, queries: { pending: 4, scalars: 0 } });
// Compile this immutable real guest before collecting its runtime contracts.
// The two cold AS passes are fixture preparation, not a 10 s lifecycle hook.
const bytes = await compileScriptV2(`import * as core from './sdk/as/wsV2';import * as group from './sdk/as/groupBankV2';import * as slots from './sdk/as/groupStepV2';
    export function ws_abi():i32{return 2;}export function ws_io():i32{return 0;}
    export function ws_init(lo:i32,hi:i32,fuel:i32):i32{return fuel;}
    export function ws_project(fuel:i32):i32{core.beginState();assert(core.beginBinding(0));
      const signal=i32(core.parameter(0)),members=i32(core.parameter(1));let sum:f64=0;
      for(let slot=0;slot<members;slot++){assert(core.fieldId(slot*2)==slot*2+1);sum+=slots.member(slot,1);}
      group.write(1,sum);assert(group.claim(0,15,1));assert(!group.claim(0,0,1));
      if(signal==2){if(core.count(12)>0)group.write(4,core.replyValue(0,4));
        if(core.currentTick()==0)core.query(10,1,0,0,0,0,30,5);}
      else if(signal==5)group.write(3,core.random(1));
      else if(signal==4)group.write(0,70000);
      else if(signal==6)core.pageOutput(2,98);
      else if(signal==7)core.pageOutput(1,16,2,0);
      else if(signal==8)core.actorCommand(1,0,1,2,3);
      else {core.pageOutput(1,15,core.field(31),-0.0);core.pageOutput(signal==3?3:2,99);
        if(signal==9)store<u32>(core.row(10,1)+12,1);
        if(signal==10)store<u64>(core.row(10,1)+56,0x8000000000000000);
        if(signal==11)store<f64>(core.row(10,1)+56,1);
        if(signal==12)store<u64>(core.row(10,1)+56,0x7ff8000000000000);
        if(signal==13)store<u64>(core.row(10,1)+56,0x7ff0000000000000);}
      core.endBinding();return fuel;}`, { lane: 'project', ioBytes: groupStepLayoutV2(rows).bytes,
    sources: { 'sdk/as/wsV2.ts': v2CoreSource(0), 'sdk/as/groupBankV2.ts': groupBankSourceV2(0, 5), 'sdk/as/groupStepV2.ts': groupStepSourceV2(2,16) } });
function actor(id: string): AnimalSim {
  return new AnimalSim({ kind: 'test', label: 'Test', variant: 'plain', rarity: 'common', hp: 20, aggressive: false,
    dims: { bodyY: .6, bodyHalfLen: .5, bodyRadius: .3, headRadius: .2, legLen: .5, feet: [], halfWidth: .3 },
    mods: { speed: 1, chargeDist: 1, damageTaken: 1, chargeDamage: 5, relentless: false } },
  1, 1, id, { heightAt: () => 0, random: () => .5 });
}
function fixture(declarations = rows) {
  const root = new Scope('group-root'), scope = root.child('original-group');
  const bodies = Array.from({ length: 16 }, (_, slot) => { const body = actor(`body:${slot}`);body.position.x = slot;body.alive = slot !== 3;return body; });
  const other = actor('other-body');
  const references = [...bodies.map((body, slot) => ({ group: 'original', slot, identity: body.entityId,
    wire: body.entityId, handle: slot + 1, body })), { group: 'other', slot: 0, identity: other.entityId,
    wire: 'other/member', handle: 99, body: other }];
  const members = bodies.map((body, slot) => ({ scope, self: { group: 'original', slot, identity: body.entityId, actor: body },
    observed: new Map(), player: { position: { x: 0, z: 0 } }, t: 0, dt: .1 }));
  const state = new GroupBankV2(rows.bank).encode({ held: 0, sum: 0, target: 'other/member', random: 0, reply: 0 }, 'original', references);
  const runner = new GroupStepV2(bytes, declarations, scope), random = new Rng(20);
  const input = { group: 'original', handle: 100, signal: 'step', tick: 0, state, members, references, random };
  return { root, scope, bodies, other, references, members, state, runner, random, input };
}
test('real AS sees sixteen stable ordered slots and detached original native operation loans', () => {
  const f = fixture();
  try {
    expect(groupStepColumnV2(rows, 15, 'z.position')).toBe(31);
    const before = f.state.slice(), saved = JSON.stringify(f.bodies.map(body => body.snapshot()));
    const ready = f.runner.prepare(f.input);
    expect(f.state).toStrictEqual(before);
    expect(ready.values).toStrictEqual({ held: 32768, sum: 120, target: 'other/member', random: 0, reply: 0 });
    expect(Object.isFrozen(ready.values)).toBe(true);expect(Reflect.set(ready.values, 'sum', 999)).toBe(false);
    expect(f.state).toStrictEqual(before);
    expect(ready.operations.map(op => op.id)).toStrictEqual([1, 2]);
    expect(ready.operations[0]?.member?.actor).toBe(f.bodies[15]);
    expect(ready.operations[1]?.reference?.body).toBe(f.other);
    expect(Object.is(ready.operations[0]?.values[2], -0)).toBe(true);
    ready.validate();ready.accept();
    expect(Array.from(f.state)).toStrictEqual([32768, 120, 99, 0, 0]);
    expect(JSON.stringify(f.bodies.map(body => body.snapshot()))).toBe(saved);
    expect(f.bodies[3]?.alive).toBe(false);
    expect(() => ready.accept()).toThrow('accepted');
  } finally { f.root.dispose(); }
});
test('malformed state, action suffix, actor authority and reference operands publish nothing', () => {
  const f = fixture();
  try {
    const before = f.state.slice(), rng = f.random.snapshot();
    for (const signal of ['badAction', 'badState', 'badRef', 'badMember', 'rawActor', 'badReserved']) {
      expect(() => f.runner.prepare({ ...f.input, signal })).toThrow();
      expect(f.state).toStrictEqual(before);expect(f.random.snapshot()).toStrictEqual(rng);
    }
    f.runner.prepare(f.input).accept();expect(f.state[1]).toBe(120);
  } finally { f.root.dispose(); }
});
test('group binding bytes clear dirty reserved words at the input boundary', () => {
  const f = fixture(), project = vi.spyOn(ScriptModuleV2.prototype, 'project');
  try {
    const binding = f.runner.layout.regions[0];
    if (binding === undefined) throw new Error('Missing binding region');
    for (const tick of [0, 2 ** 30 - 1]) {
      f.runner.prepare({ ...f.input, handle: 0x7fffffff, tick });
      const write = project.mock.calls.at(-1)?.[1];
      if (write === undefined) throw new Error('Missing group input writer');
      const view = new DataView(new ArrayBuffer(f.runner.layout.pages * 65536));
      new Uint8Array(view.buffer).fill(0xff);
      write(view);
      const at = f.runner.layout.io + binding.offset;
      const words = Array.from({ length: 16 }, (_, index) => view.getUint32(at + index * 4, true));
      expect(words).toStrictEqual([0x7fffffff, 0, 0, 3, 0, 5, 0, 2, 0, 0, 32, 6, tick, tick, rows.fuel, 0]);
    }
  } finally { project.mockRestore(); f.root.dispose(); }
});

test('the same ai RNG advances only on accepted calls and stale preparations refuse', () => {
  const f = fixture();
  try {
    const original = f.random.snapshot(), oracle = new Rng(0);oracle.restore(original);
    const expected = oracle.next(), ready = f.runner.prepare({ ...f.input, signal: 'random' });
    expect(f.random.snapshot()).toStrictEqual(original);expect(f.state[3]).toBe(0);
    ready.accept();expect(f.state[3]).toBe(expected);expect(f.random.snapshot()).toStrictEqual(oracle.snapshot());
    const stale = f.runner.prepare({ ...f.input, signal: 'random' });f.random.next();
    expect(() => stale.accept()).toThrow('RNG');expect(f.state[3]).toBe(expected);
  } finally { f.root.dispose(); }
});
test('actor replacement, a changed bank and ancestor retirement refuse before publication', () => {
  const f = fixture();
  try {
    const member = f.members[0];if (member === undefined) throw new Error('Missing member');
    const ready = f.runner.prepare(f.input), original = member.self.actor;member.self.actor = actor('replacement');
    expect(() => ready.accept()).toThrow('body loan');member.self.actor = original;
    f.state[1] = 20;expect(() => ready.accept()).toThrow('bank');f.state[1] = 0;
    const retired = f.runner.prepare(f.input), steps = f.root.disposeSteps();steps.next();
    expect(() => retired.accept()).toThrow('disposed');
    for (const _step of steps) { /* Original scope completes retirement. */ }
    expect(f.state[1]).toBe(0);
  } finally { f.root.dispose(); }
});
test('the existing query ring keeps afterBodies and next-tick delivery atomic with the same bank', () => {
  const f = fixture(), ring = new QueryRingV2(f.runner.layout, new Map([['original', { pending: 4, operations: new Map([[10, 0]]) }]]));
  const binding = { identity: 'original', handle: 100, observed: new Map(f.references.map(row => [row.handle, row.identity])), operations: new Set([10] as const) };
  try {
    const input = { ...f.input, signal: 'query', queries: { ring, binding } };
    const ready = f.runner.prepare(input);expect(ring.snapshot().entries).toHaveLength(0);ready.accept();
    expect(ring.snapshot().entries).toHaveLength(1);
    ring.afterBodies(0, requests => { expect(requests[0]?.values).toStrictEqual([0, 0, 0, 30, 5, 0, 0]);
      return [{ status: 1, kind: 'nearest', actor: { id: f.other.entityId, point: [3, 0, 4], distance: 5 } }]; });
    const next = f.runner.prepare({ ...input, tick: 1 });
    expect(f.state[4]).toBe(0);expect(ring.snapshot().entries).toHaveLength(1);
    next.accept();expect(f.state[4]).toBe(5);expect(ring.snapshot().entries).toHaveLength(0);
  } finally { f.root.dispose(); }
});
test('strict metadata rejects duplicate columns, bank fields and overlapping operand selectors', () => {
  expect(() => parseGroupStepV2({ ...rows, bank: [...rows.bank, rows.bank[0]] })).toThrow();
  expect(() => parseGroupStepV2({ ...rows, columns: [...rows.columns, rows.columns[0]] })).toThrow();
  expect(() => parseGroupStepV2({ ...rows, actions: [{ id: 1, words: 1, member: 0, reference: { word: 0 } }] })).toThrow('operands');
});

test('reentrant native column capture refuses while a valid call still uses the original sampler', () => {
  const declarations = parseGroupStepV2({ ...rows, columns: [rows.columns[1], { name: 'z.position', id: 7, source: { kind: 'grass', at: 'self' } }] });
  const f = fixture(declarations);
  try {
    let captures = 0;
    const members = f.members.map(member => ({ ...member, environment: { playerCrouched: false, playerFwdX: 0, playerFwdZ: 1,
      playerMounted: false, playerHealth01: 1, light: 1, storm: false, wind: { x: 0, z: 1, strength: 1 },
      grassHeightAt: (x: number) => { captures++;expect(() => f.runner.prepare(f.input)).toThrow('Reentrant');return x; } } }));
    f.runner.prepare({ ...f.input, members }).accept();expect(captures).toBe(16);expect(f.state[1]).toBe(120);
  } finally { f.root.dispose(); }
});
test('changed native query capabilities refuse the entire prepared transaction', () => {
  const f = fixture(), ring = new QueryRingV2(f.runner.layout, new Map([['original', { pending: 4, operations: new Map([[10, 0]]) }]]));
  const observed = new Map(f.references.map(row => [row.handle, row.identity]));
  const binding = { identity: 'original', handle: 100, observed, operations: new Set([10] as const) };
  try {
    const ready = f.runner.prepare({ ...f.input, signal: 'query', queries: { ring, binding } });
    observed.delete(99);expect(() => ready.accept()).toThrow('continuation owner');
    expect(ring.snapshot().entries).toHaveLength(0);expect(f.state[1]).toBe(0);
  } finally { f.root.dispose(); }
});

test('one executable serves different finite group profiles with exact original banks and no scratch leakage', async () => {
  const declarations = parseGroupStepV2({ ...rows, profiles: [{ id: 'second',
    bank: [{ name: 'awake', kind: 'boolean' }], columns: [], members: 16, signals: ['pulse'], actions: [] }] });
  const executable = await compileScriptV2(`import * as core from './sdk/as/wsV2';let scratch:i32=0;
    export function ws_abi():i32{return 2;}export function ws_io():i32{return 0;}
    export function ws_init(lo:i32,hi:i32,fuel:i32):i32{return fuel;}
    export function ws_project(fuel:i32):i32{core.beginState();assert(core.beginBinding(0));scratch++;
      if(core.parameter(2)==0){assert(core.count(2)==5);core.setState(1,core.state(1)+f64(scratch));}
      else {assert(core.parameter(2)==1&&core.count(2)==1&&core.parameter(1)==0);core.setState(0,1);}
      core.endBinding();return fuel;}`, { lane: 'project', ioBytes: groupStepLayoutV2(declarations).bytes,
    sources: { 'sdk/as/wsV2.ts': v2CoreSource(0) } });
  const scope = new Scope('profile-module'), runner = new GroupStepV2(executable, declarations, scope);
  const first = Float64Array.of(0, 0, 0, 0, 0), second = Float64Array.of(0);
  try {
    expect(runner.layout.regions[1]?.capacity).toBe(5);expect(runner.layout.regions[5]?.capacity).toBe(32);
    const input = { group: 'first', handle: 1, signal: 'step', tick: 0, state: first, members: [], references: [] };
    runner.prepare(input).accept();expect(first[1]).toBe(1);
    runner.prepare({ ...input, profile: 'second', group: 'other', signal: 'pulse', state: second }).accept();expect(second[0]).toBe(1);
    runner.prepare(input).accept();expect(first[1]).toBe(2); // Module globals rewind across profiles.
    expect(() => runner.prepare({ ...input, profile: 'absent' })).toThrow('profile');
    expect(() => runner.prepare({ ...input, profile: 'second', signal: 'pulse' })).toThrow('width');
    expect(() => runner.prepare({ ...input, profile: 'second', state: second })).toThrow('input');
    expect(() => parseGroupStepV2({ ...declarations, profiles: [{ ...declarations.profiles?.[0], id: 'main' }] })).toThrow('profile');
  } finally { scope.dispose(); }
});

test('an omitted numeric column is absent rather than a previous segment value',()=>{
 const f=fixture();
 try{
  f.runner.prepare(f.input).accept();const before=f.state.slice(),rng=f.random.snapshot();
  expect(()=>f.runner.prepare({...f.input,capture:{common:['a.alive'],slots:[]}})).toThrow();
  expect(f.state).toStrictEqual(before);expect(f.random.snapshot()).toStrictEqual(rng);
  const capture={common:['a.alive','z.position'],slots:[]},ready=f.runner.prepare({...f.input,capture});
  capture.common.pop();expect(()=>ready.accept()).toThrow('capture selection');expect(f.state).toStrictEqual(before);
 }finally{f.root.dispose();}
});


test('a real group step decodes only its published candidate and rejects bad input before capture',()=>{
 const f=fixture(),decode=vi.spyOn(GroupBankV2.prototype,'decode'),capture=vi.spyOn(ObservationColumnsV2.prototype,'captureNumeric');
 try{
  const ready=f.runner.prepare(f.input);
  expect(decode).toHaveBeenCalledTimes(1);expect(ready.values['sum']).toBe(120);
  decode.mockClear();capture.mockClear();f.state[0]=70000;
  expect(()=>f.runner.prepare(f.input)).toThrow('outside bound');
  expect(decode).not.toHaveBeenCalled();expect(capture).not.toHaveBeenCalled();
 }finally{decode.mockRestore();capture.mockRestore();f.root.dispose();}
});

test('unused operand suffixes refuse the whole bank while declared state keeps signed zero',()=>{
 const f=fixture();
 try{
  f.state[3]=-0;const state=f.state.slice(),random=f.random.snapshot(),bodies=JSON.stringify(f.bodies.map(body=>body.snapshot()));
  for(const signal of ['unusedZero','unusedFinite','unusedNaN','unusedInfinity']){
   expect(()=>f.runner.prepare({...f.input,signal})).toThrow('Invalid group operation operands');
   expect(f.state).toStrictEqual(state);expect(f.random.snapshot()).toEqual(random);
   expect(JSON.stringify(f.bodies.map(body=>body.snapshot()))).toBe(bodies);
  }
  const ready=f.runner.prepare(f.input);
  expect(Object.is(ready.values['random'],-0)).toBe(true);expect(Object.is(ready.operations[0]?.values[2],-0)).toBe(true);
  ready.accept();expect(Object.is(f.state[3],-0)).toBe(true);
 }finally{f.root.dispose();}
});


test('reused numeric staging keeps outstanding candidates and their publications detached', () => {
  const f = fixture();
  try {
    const before = f.state.slice(), first = f.runner.prepare(f.input);
    expect(first.values['sum']).toBe(120);
    const body = f.bodies[0];if (body === undefined) throw new Error('Missing body');
    body.position.x = 25;
    const second = f.runner.prepare(f.input);
    expect(second.values['sum']).toBe(145);
    expect(second.values).not.toBe(first.values);
    expect(first.values['sum']).toBe(120);
    expect(Object.isFrozen(first.values)).toBe(true);
    expect(f.state).toStrictEqual(before);
    first.validate();second.validate();
    expect(() => f.runner.prepare({ ...f.input, signal: 'badState' })).toThrow();
    expect(first.values['sum']).toBe(120);expect(second.values['sum']).toBe(145);
    first.validate();second.validate();first.accept();
    expect(f.state[1]).toBe(120);
    expect(() => second.accept()).toThrow('superseded');
    f.runner.prepare(f.input).accept();expect(f.state[1]).toBe(145);
  } finally { f.root.dispose(); }
});


test('input staging refuses shorter and longer banks without stale tails and preserves custom slice', () => {
  const f = fixture();
  try {
    f.runner.prepare(f.input).accept();
    for (const length of [0, f.state.length - 1, f.state.length + 1]) {
      expect(() => f.runner.prepare({ ...f.input, state: new Float64Array(length) })).toThrow('width');
    }
    const state = new Float64Array(f.state);let calls = 0;
    Object.defineProperty(state, 'slice', { value(this: Float64Array) {
      calls++;return Float64Array.prototype.slice.call(this);
    } });
    const ready = f.runner.prepare({ ...f.input, state });
    expect(calls).toBe(2);expect(ready.values['sum']).toBe(120);
    ready.accept();expect(state[1]).toBe(120);
    f.runner.prepare(f.input).accept();expect(f.state[1]).toBe(120);
  } finally { f.root.dispose(); }
});


test('discard retires one group candidate without mutating another candidate or its original bank', () => {
  const f = fixture();
  try {
    const before = f.state.slice(), first = f.runner.prepare(f.input), second = f.runner.prepare(f.input);
    first.discard();first.discard();
    expect(() => first.validate()).toThrow('accepted');expect(() => first.accept()).toThrow('accepted');
    expect(first.values['sum']).toBe(120);expect(f.state).toStrictEqual(before);
    const third = f.runner.prepare(f.input);expect(second.values).not.toBe(third.values);
    second.validate();third.validate();second.accept();third.discard();
    expect(f.state[1]).toBe(120);expect(third.values['sum']).toBe(120);
  } finally { f.root.dispose(); }
});


test('member capture destinations stay private per slot while outstanding results remain detached',()=>{
 const f=fixture(),capture=vi.spyOn(ObservationColumnsV2.prototype,'captureNumeric');
 try{
  const first=f.runner.prepare(f.input),destinations=capture.mock.calls.map(args=>args[2]);
  expect(destinations).toHaveLength(16);expect(new Set(destinations).size).toBe(16);
  expect(destinations.every(value=>value instanceof Float64Array&&value.length===rows.columns.length)).toBe(true);
  capture.mockClear();const body=f.bodies[0];if(body===undefined)throw new Error('Missing member');body.position.x=25;
  const second=f.runner.prepare(f.input);
  for(let slot=0;slot<16;slot++)expect(capture.mock.calls[slot]?.[2]).toBe(destinations[slot]);
  expect(first.values['sum']).toBe(120);expect(second.values['sum']).toBe(145);
  first.validate();second.validate();first.accept();expect(f.state[1]).toBe(120);
  expect(()=>second.accept()).toThrow('superseded');
  capture.mockClear();expect(()=>f.runner.prepare({...f.input,signal:'badState'})).toThrow();
  f.runner.prepare(f.input).accept();expect(f.state[1]).toBe(145);
  for(let slot=0;slot<16;slot++)expect(capture.mock.calls[slot]?.[2]).toBe(destinations[slot]);
 }finally{capture.mockRestore();f.root.dispose();}
});


test('member reference pins snapshot the whole entry list before loan getters run', () => {
  const f=fixture();
  try {
    const first=f.members[0];if(first===undefined)throw new Error('Missing member');
    const references=new Map<string,{readonly body:AnimalSim;readonly identity:string;readonly handle:number}|null>();
    let reads=0;
    references.set('target',{get body(){reads++;references.delete('empty');return f.other;},identity:f.other.entityId,handle:99});
    references.set('empty',null);
    const members=[{...first,references},...f.members.slice(1)],before=f.state.slice(),random=f.random.snapshot();
    const ready=f.runner.prepare({...f.input,members});
    expect(reads).toBeGreaterThan(0);expect(references.size).toBe(1);
    expect(()=>ready.validate()).toThrow('body loan');
    expect(()=>ready.accept()).toThrow('body loan');ready.discard();
    expect(f.state).toEqual(before);expect(f.random.snapshot()).toEqual(random);
    const next=f.runner.prepare({...f.input,members});next.validate();next.accept();
  } finally {f.root.dispose();}
});
