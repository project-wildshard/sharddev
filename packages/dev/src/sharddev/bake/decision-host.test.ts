import { expect, test, vi } from 'vitest';
import { DecisionHost, type DecisionHostOptions, type DecisionScript, type DecisionTrace, type DecisionWorld } from '@wildshard/engine/script/decision';
import { DecisionModule, prepareDecisionMemories } from '@wildshard/engine/script/decisionModule';
import { Scope } from '@wildshard/engine/app/scope';
import { pageScope } from '@wildshard/engine/app/resources';
import { compileScript } from '@wildshard/sdk/compileScript';
import { scriptV1Layout } from '@wildshard/format/scriptAbiV1';
import { createScriptScenario } from '../test/scriptScenario';

const layout = scriptV1Layout(1, 0), slot = 16384 + layout.state * 8, out = 16384 + layout.outbox * 8;
const valid = `scratch++; let next=load<f64>(${slot})+f64(scratch); store<f64>(${slot},next);
store<f64>(${out},4);store<f64>(${out + 8},1);store<f64>(${out + 16},1);store<f64>(${out + 24},next);return 1;`;
const modules = new Map<string, Promise<Uint8Array>>();
function compiled(body: string): Promise<Uint8Array> {
  let value = modules.get(body);
  if (!value) {
    value = compileScript(`
@external("env","ws_read") declare function read(op:i32,a:f64,b:f64):f64;
@external("env","ws_list") declare function list(op:i32,a:f64,b:f64,out:i32,cap:i32):i32;
let scratch:i32=0;
export function ws_abi():i32{return 1;}
export function ws_init(lo:i32,hi:i32):void{scratch=7;}
export function ws_io():i32{return 16384;}
export function ws_handle():i32{${body}}`, { abi: 1 }); modules.set(body, value);
  }
  return value;
}
async function setup(body = valid, limits?: DecisionHostOptions['limits'], bindings = 1) {
  const bytes = await compiled(body), trace: DecisionTrace[] = [], fields = new Map<number, number>();
  let rejected = false, failures = 0, reads = 0;
  const script: DecisionScript = { id: 'test', module: 'module', side: 'sim', on: ['start', 'timer'], tick: null, onFail: 'hold',
    stateVersion: 1, state: [{ name: 'phase', type: 'i32', default: 0, min: 0, max: 1000, scope: 'binding' }],
    params: {}, ids: { actors: { self: 1 }, fields: { phase: 1 }, timers: { rest: 1 }, zones: { area: 1 } },
    reads: ['random', 'x'], lists: ['actorsInZone'], commands: ['field', 'timer'] };
  const world: DecisionWorld = {
    read: () => { reads++; return 42; },
    list: (_op, _a, _b, output) => { output[0] = 1; return 1; },
    prepare: (commands, context) => {
      if (rejected) throw new Error('World row refused');
      for (const command of commands) if (command[0] === 4 && (!context.binding.actors.includes(command[1]) || command[3] > 1000)) throw new Error('World ownership or field range');
      const copy = structuredClone(commands);
      return { commit: () => { for (const command of copy) if (command[0] === 4) fields.set(context.binding.id, command[3]); } };
    },
    failed: () => { failures++; },
  };
  const options: DecisionHostOptions = { scripts: [script], modules: new Map([['module', bytes]]), seed: [123, 456], world,
    bindings: Array.from({ length: bindings }, (_, id) => ({ id: id + 1, script: 'test', self: 1, actors: [1], instance: 0 })),
    trace: entry => { trace.push(entry); }, ...(limits ? { limits } : {}) };
  const host = new DecisionHost(options);
  return { host, options, fields, trace, run: (end: number) => { for (let tick = host.snapshot().tick + 1; tick <= end; tick++) host.step(tick); },
    reject: () => { rejected = true; }, failures: () => failures, reads: () => reads };
}

test('real Wasm stages world and slots together, then commits at the next fixed step', async () => {
  const f = await setup(); f.host.enqueue(1, [1, 0, 0, 0, 0, 0]); f.run(6);
  expect(f.host.state(1)).toEqual({ phase: 0 }); expect(f.fields.size).toBe(0);
  expect(f.host.snapshot().staged).toHaveLength(1);
  f.run(7); expect(f.host.state(1)).toEqual({ phase: 8 }); expect(f.fields.get(1)).toBe(8);
});

test('an invalid final command rolls back all proposed slots, RNG and world commands', async () => {
  const f = await setup(`read(12,0,0);${valid.replace('return 1;', `store<f64>(${out + 40},999);return 2;`)}`);
  f.host.enqueue(1, [1, 0, 0, 0, 0, 0]); f.run(7);
  expect(f.host.state(1)).toEqual({ phase: 0 }); expect(f.fields.size).toBe(0);
  expect(f.host.snapshot().bindings[0]).toMatchObject({ rng: 0, failures: 1 });
  expect(f.host.metrics()[0]?.refusals).toBe(1);
});

test('world refusal does not commit slots; three refusals disable until restart', async () => {
  const f = await setup(); f.reject();
  for (let i = 1; i <= 3; i++) { f.host.enqueue(1, [1, 0, 0, 0, 0, 0]); f.run(i * 6 + 1); }
  expect(f.host.state(1)).toEqual({ phase: 0 }); expect(f.fields.size).toBe(0);
  expect(f.host.metrics()[0]?.disabled).toBe(true); expect(f.failures()).toBe(1);
  f.host.enqueue(1, [1, 0, 0, 0, 0, 0]); expect(f.host.metrics()[0]?.disabled).toBe(false);
});

test('module scratch globals rewind between bindings and between calls', async () => {
  const invoke = vi.spyOn(DecisionModule.prototype, 'invoke');
  try {
    const body = valid.replace('scratch++;', 'scratch++;let old=load<i32>(32768);store<i32>(32768,old+1);').replace('+f64(scratch)', '+f64(scratch)+f64(old+1)');
    const f = await setup(body, undefined, 2);
    expect(invoke.mock.calls.filter(call => call[0] === 'ws_init')).toHaveLength(1);
    f.host.enqueue(2, [1, 0, 0, 0, 0, 0]); f.host.enqueue(1, [1, 0, 0, 0, 0, 0]); f.run(7);
    expect(f.host.state(1)).toEqual({ phase: 9 }); expect(f.host.state(2)).toEqual({ phase: 9 });
    expect(f.trace.filter(entry => entry.kind === 'call').map(entry => entry.binding)).toEqual([1, 2]);
    f.host.enqueue(1, [1, 0, 0, 0, 0, 0]); f.run(13); expect(f.host.state(1)).toEqual({ phase: 18 });
  } finally { invoke.mockRestore(); }
});

test('save/restore preserves staged effects without invoking any module or borrowing save arrays', async () => {
  const f = await setup(); f.host.enqueue(1, [1, 0, 0, 0, 0, 0]); f.run(6);
  const saved = f.host.snapshot(), invoke = vi.spyOn(DecisionModule.prototype, 'invoke');
  try {
    f.host.restore(saved); expect(invoke).not.toHaveBeenCalled();
    const command = saved.staged[0]?.commands[0]; if (command) Reflect.set(command, 3, 999);
    f.run(7); expect(invoke).not.toHaveBeenCalled();
    expect(f.fields.get(1)).toBe(8); expect(f.host.state(1)).toEqual({ phase: 8 });
  } finally { invoke.mockRestore(); }
});

test('bad restore refuses atomically, including capabilities on staged commands', async () => {
  const f = await setup(); f.host.enqueue(1, [1, 0, 0, 0, 0, 0]); f.run(6);
  const saved = f.host.snapshot(), bad = structuredClone(saved), command = bad.staged[0]?.commands[0];
  if (command) Reflect.set(command, 0, 999);
  expect(() => f.host.restore(bad)).toThrow('capability'); expect(f.host.snapshot()).toEqual(saved);
  f.run(7); expect(f.fields.get(1)).toBe(8);
});

test('per-call and whole-tick fuel limits refuse without world or slot mutation', async () => {
  for (const limits of [{ fuelPerCall: 1 }, { fuelPerTick: 1 }]) {
    const f = await setup(valid, limits, 2);
    f.host.enqueue(1, [1, 0, 0, 0, 0, 0]); f.host.enqueue(2, [1, 0, 0, 0, 0, 0]); f.run(7);
    expect(f.fields.size).toBe(0); expect(f.host.state(1)).toEqual({ phase: 0 });
    expect(f.trace.some(entry => entry.kind === 'call' && entry.reason?.includes('fuel'))).toBe(true);
    if (limits.fuelPerTick) expect(f.host.metrics()[1]?.calls).toBe(0);
  }
  const f = await setup();
  for (const limits of [{ fuelPerCall: 2_000_001 }, { fuelPerTick: 8_000_001 }, { fuelPerCall: 0 }]) expect(() => new DecisionHost({ ...f.options, limits })).toThrow('ceilings');
});

test('inbox overflow carries in order and strict stepping cannot skip a decision tick', async () => {
  const f = await setup(); for (let i = 0; i < 20; i++) f.host.enqueue(1, [1, 0, i, 0, 0, 0]);
  f.run(7); expect(f.host.snapshot().bindings[0]?.pending.map(event => event[2])).toEqual([16, 17, 18, 19]);
  expect(() => f.host.step(9)).toThrow('nonconsecutive'); f.run(13);
  expect(f.host.state(1)).toEqual({ phase: 16 }); expect(f.host.snapshot().bindings[0]?.pending).toEqual([]);
});

test('unobserved read handles and list writes outside linear memory refuse', async () => {
  for (const body of ['read(1,999,0);return 0;', 'list(1,1,0,65528,2);return 0;']) {
    const f = await setup(body); f.host.enqueue(1, [1, 0, 0, 0, 0, 0]); f.run(7);
    expect(f.host.metrics()[0]?.refusals).toBe(1); expect(f.reads()).toBe(0); expect(f.fields.size).toBe(0);
  }
});

test('timer expiry and the counter RNG continue identically after a logical restore', async () => {
  const body = `let next=Math.floor(read(12,0,0)*1000);store<f64>(${slot},next);
store<f64>(${out},4);store<f64>(${out + 8},1);store<f64>(${out + 16},1);store<f64>(${out + 24},next);
store<f64>(${out + 40},8);store<f64>(${out + 56},1);store<f64>(${out + 64},0.1);return 2;`;
  const f = await setup(body); f.host.enqueue(1, [1, 0, 0, 0, 0, 0]); f.run(7);
  const saved = f.host.snapshot(); expect(saved.bindings[0]?.rng).toBe(1);
  f.run(13); const continued = f.host.snapshot(), field = f.fields.get(1);
  expect(continued.bindings[0]?.rng).toBe(2);
  f.host.restore(saved); f.run(13);
  expect(f.host.snapshot()).toEqual(continued); expect(f.fields.get(1)).toBe(field);
});

test('whole-tick command and call quotas retain sleeping work in stable binding order', async () => {
  const body = `store<f64>(${slot},1);for(let i=0;i<32;i++){
let p=${out}+i*40;store<f64>(p,4);store<f64>(p+8,1);store<f64>(p+16,1);store<f64>(p+24,1);}return 32;`;
  const f = await setup(body, undefined, 5);
  for (let i = 1; i <= 5; i++) f.host.enqueue(i, [1, 0, 0, 0, 0, 0]); f.run(7);
  expect(f.fields.size).toBe(4); expect(f.host.state(5)).toEqual({ phase: 0 });
  expect(f.host.metrics()[4]?.refusals).toBe(1);
  const many = await setup('return 0;', undefined, 65);
  for (let i = 1; i <= 65; i++) many.host.enqueue(i, [1, 0, 0, 0, 0, 0]); many.run(7);
  expect(many.host.metrics().filter(row => row.calls === 1)).toHaveLength(64);
  expect(many.host.metrics()[64]).toMatchObject({ calls: 0, carried: 1 });
  many.run(13); expect(many.host.metrics()[64]).toMatchObject({ calls: 1, carried: 0 });
});

test('the SDK scenario drives this host, including real Wasm saves and commands', async () => {
  const f = await setup(), script = f.options.scripts[0], binding = f.options.bindings[0];
  if (script === undefined || binding === undefined) throw new Error('Missing scenario fixture');
  const scenario = createScriptScenario(DecisionHost, { script, binding, seed: 123, bytes: await compiled(valid),
    actors: [{ id: 1, at: [0, 0, 0], fields: { 1: 0 } }] });
  scenario.send('start'); expect(scenario.state()).toEqual({ phase: 8 });
  const saved = scenario.save(); scenario.send('start'); const next = scenario.commands();
  expect(scenario.state()).toEqual({ phase: 16 }); expect(scenario.maxFuel()).toBeGreaterThan(0);
  scenario.restore(saved); scenario.send('start'); expect(scenario.commands()).toEqual(next);
});

test('committed engine commands may queue events without reentering Wasm in the same step', async () => {
  const f = await setup(), prepare = f.options.world.prepare;
  let emitted = false;
  f.options.world.prepare = (commands, context) => {
    const transaction = prepare(commands, context);
    return { commit: () => { transaction.commit(); if (!emitted) { emitted = true; f.host.enqueue(1, [1, 0, 0, 0, 0, 0]); } } };
  };
  f.host.enqueue(1, [1, 0, 0, 0, 0, 0]); f.run(7);
  expect(f.host.metrics()[0]?.calls).toBe(1); expect(f.host.snapshot().bindings[0]?.pending).toHaveLength(1);
  f.run(13); expect(f.host.state(1)).toEqual({ phase: 16 });
});

test('inactive bindings suppress periodic work and timers but deliver explicit stop, with logical restore', async () => {
  const f = await setup(valid.replace('return 1;', `store<f64>(${out + 40},8);store<f64>(${out + 56},1);store<f64>(${out + 64},2);return 2;`));
  const host = new DecisionHost({ ...f.options, scripts: f.options.scripts.map(script => { const row = structuredClone(script); row.tick = 10; row.on = ['start', 'tick', 'timer', 'stop']; return row; }) });
  const run = (end: number): void => { for (let tick = host.snapshot().tick + 1; tick <= end; tick++) host.step(tick); };
  host.setEnabled(1, false); run(60); expect(host.metrics()[0]?.calls).toBe(0);
  const saved = host.snapshot(); expect(saved.bindings[0]?.enabled).toBe(false);
  host.restore(saved); host.setEnabled(1, true); host.enqueue(1, [1, 0, 0, 0, 0, 0]); run(67);
  expect(host.state(1)).toEqual({ phase: 8 }); expect(host.snapshot().bindings[0]?.timers['rest']).toBeGreaterThan(0);
  host.setEnabled(1, false); run(120); expect(host.state(1)).toEqual({ phase: 8 });
  expect(host.snapshot().bindings[0]?.timers).toEqual({});
  host.enqueue(1, [18, 0, 0, 0, 0, 0]); run(127); expect(host.state(1)).toEqual({ phase: 16 });
});

test('paces fresh decision memories and consumes each once without changing guest initialization', async () => {
  const bytes = await compiled(valid), owner = new Scope('decision-preparation'), child = owner.child('child');
  const NativeMemory = WebAssembly.Memory, allocated: WebAssembly.Memory[] = [];
  const memory = vi.spyOn(WebAssembly, 'Memory').mockImplementation(class extends NativeMemory {
    constructor(descriptor: WebAssembly.MemoryDescriptor) { super(descriptor); allocated.push(this); }
  });
  const pause = vi.spyOn(pageScope, 'timeout');
  try {
    const pending = prepareDecisionMemories([1, 1], owner);
    expect(prepareDecisionMemories([1, 1], owner)).toBe(pending);
    await pending;
    expect(allocated).toHaveLength(2); expect(pause.mock.calls.length).toBeGreaterThanOrEqual(3);
    for (const fresh of allocated) expect(new Uint8Array(fresh.buffer).every(value => value === 0)).toBe(true);
    const ports = { read: () => 0, list: () => 0 };
    const first = child.run(() => new DecisionModule(bytes, [123, 456], ports));
    const second = owner.run(() => new DecisionModule(bytes, [123, 456], ports));
    expect(first.memory).toBe(allocated[0]); expect(second.memory).toBe(allocated[1]);
    expect(first.memory).not.toBe(second.memory); expect(allocated).toHaveLength(2);
    const oracle = new DecisionModule(bytes, [123, 456], ports);
    expect(new Uint8Array(first.memory.buffer)).toEqual(new Uint8Array(oracle.memory.buffer));
    expect(new Uint8Array(second.memory.buffer)).toEqual(new Uint8Array(oracle.memory.buffer));
    first.view.setFloat64(first.io, 99, true); first.rewind();
    expect(new Uint8Array(first.memory.buffer)).toEqual(new Uint8Array(oracle.memory.buffer));
    const later = owner.run(() => new DecisionModule(bytes, [123, 456], ports));
    expect(allocated).toHaveLength(4); expect(later.memory).not.toBe(first.memory);
  } finally { owner.dispose(); memory.mockRestore(); pause.mockRestore(); }
});

test('decision preparation rejects invalid plans and cancellation cannot strand a pending frame', async () => {
  const owner = new Scope('decision-cancel');
  const pause = vi.spyOn(pageScope, 'timeout').mockImplementation(() => { owner.dispose(); return 0; });
  try {
    await prepareDecisionMemories([], owner);
    await expect(prepareDecisionMemories([0], owner)).rejects.toThrow('allowance');
    await expect(prepareDecisionMemories([5], owner)).rejects.toThrow('allowance');
    await expect(prepareDecisionMemories(Array.from({ length: 400 }, () => 1), owner)).rejects.toThrow('allowance');
    await expect(prepareDecisionMemories([1], owner)).rejects.toThrow('owner disposed');
    await expect(prepareDecisionMemories([1], owner)).rejects.toThrow('owner disposed');
  } finally { owner.dispose(); pause.mockRestore(); }
});

test('another owner and a different fixed size cannot consume prepared decision memory', async () => {
  const bytes = await compiled(valid), owner = new Scope('decision-owner'), sibling = new Scope('decision-sibling');
  const NativeMemory = WebAssembly.Memory, allocated: WebAssembly.Memory[] = [];
  const memory = vi.spyOn(WebAssembly, 'Memory').mockImplementation(class extends NativeMemory {
    constructor(descriptor: WebAssembly.MemoryDescriptor) { super(descriptor); allocated.push(this); }
  });
  try {
    await prepareDecisionMemories([2, 1], owner);
    await expect(prepareDecisionMemories([1], owner)).rejects.toThrow('changed');
    const ports = { read: () => 0, list: () => 0 };
    const foreign = sibling.run(() => new DecisionModule(bytes, [1, 2], ports));
    const actual = owner.run(() => new DecisionModule(bytes, [1, 2], ports));
    expect(foreign.memory).toBe(allocated[2]); expect(actual.memory).toBe(allocated[1]);
    owner.dispose();
    const retired = owner.run(() => new DecisionModule(bytes, [1, 2], ports));
    expect(retired.memory).toBe(allocated[3]);
  } finally { owner.dispose(); sibling.dispose(); memory.mockRestore(); }
});
