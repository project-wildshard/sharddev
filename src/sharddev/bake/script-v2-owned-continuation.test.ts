import { expect,test } from 'vitest';
import { DecisionHost,type DecisionScript,type DecisionSnapshot,type DecisionHostOptions } from '@wildshard/engine/script/decision';
import { compileScript } from './compileScript';

let compiled: Promise<Uint8Array> | undefined;
function bytes(): Promise<Uint8Array> {
  compiled ??= compileScript(`export function ws_abi():i32{return 1;}export function ws_io():i32{return 16384;}
export function ws_init(lo:i32,hi:i32):void{}export function ws_handle():i32{unreachable();return 0;}`,{ abi: 1 });
  return compiled;
}
async function fixture(external = true) {
  const script: DecisionScript = { id: 'actor',module: 'old',side: 'sim',on: ['start','tick'],tick: 10,onFail: 'hold',stateVersion: 1,
    state: [{ name: 'n',type: 'i32',default: 0,scope: 'binding',min: 0,max: 100 }],params: {},
    ids: { channels: { out: 1 } },reads: [],lists: [],commands: ['channel'] };
  const externalOptions: Pick<DecisionHostOptions,'externalDivisor'> = external ? { externalDivisor: 6 } : {};
  const commits: number[] = [], host = new DecisionHost({ scripts: [script],bindings: [{ id: 1,script: 'actor',self: 0,actors: [],instance: 0 }],
    modules: new Map([['old',await bytes()]]),seed: [4,5],...externalOptions,
    world: { read: () => 0,list: () => 0,prepare: commands => {
      const values = commands.map(row => row[3]);return { commit: () => { commits.push(...values); } };
    },failed: () => { throw new Error('The legacy guest must not execute'); } } });
  return { host,commits };
}
function candidate(before: DecisionSnapshot): DecisionSnapshot {
  return { ...before,bindings: before.bindings.map(row => ({ ...row,pending: [] })),staged: [{ binding: 1,tick: before.tick,observed: [],
    slots: { n: 7 },timers: {},rng: before.bindings[0]?.rng ?? 0,lastCall: before.tick,commands: [[13,0,1,42,0]] }] };
}
test('an external runner keeps native staged state and commands in the SAME logical continuation', async () => {
  const f = await fixture();f.host.enqueue(1,[1,0,0,0,0,0]);
  for (let tick = 1; tick <= 6; tick++) f.host.stepExternal(tick);
  const before = f.host.snapshot(), accept = f.host.prepareRestore(candidate(before));
  expect(before.bindings[0]?.pending.map(row => row[0])).toEqual([1,2]);
  expect(f.host.snapshot()).toEqual(before);expect(f.commits).toEqual([]);
  accept();expect(f.host.state(1)).toEqual({ n: 0 });expect(f.commits).toEqual([]);
  const continuation = f.host.snapshot(), saved = JSON.stringify(continuation), restored = await fixture();restored.host.restore(structuredClone(continuation));
  expect(JSON.stringify(restored.host.snapshot())).toBe(saved);
  f.host.stepExternal(7);restored.host.stepExternal(7);
  expect(f.host.state(1)).toEqual({ n: 7 });expect(f.commits).toEqual([42]);
  expect(restored.host.snapshot()).toEqual(f.host.snapshot());expect(restored.commits).toEqual([42]);
  f.host.stepExternal(8);expect(f.commits).toEqual([42]);
});
test('a malformed command/state suffix refuses without native effects or partial continuation publication', async () => {
  const f = await fixture();for (let tick = 1; tick <= 6; tick++) f.host.stepExternal(tick);
  const before = f.host.snapshot(), good = candidate(before), first = good.staged[0];
  if (first === undefined) throw new Error('Missing original staged row');
  const suffixes: readonly DecisionSnapshot['staged'][] = [[{ ...first,slots: { n: 101 } }],[{ ...first,commands: [[13,0,99,42,0]] }],
    [first,{ ...first }]];
  for (const staged of suffixes) {
    // Input is the original snapshot wire; quiet restore validates the whole suffix.
    const invalid = { ...good,staged };expect(() => f.host.prepareRestore(invalid)).toThrow();
    expect(f.host.snapshot()).toEqual(before);expect(f.commits).toEqual([]);
  }
});
test('prepared publication refuses a later input mutation instead of discarding its original queue', async () => {
  const f = await fixture();for (let tick = 1; tick <= 6; tick++) f.host.stepExternal(tick);
  const accept = f.host.prepareRestore(candidate(f.host.snapshot()));f.host.enqueue(1,[1,0,0,0,0,0]);
  const before = f.host.snapshot();expect(accept).toThrow('stale');expect(f.host.snapshot()).toEqual(before);expect(f.commits).toEqual([]);
});
test('v1 quiet restore retains byte-identical keys and refuses mixed execution authorities', async () => {
  const legacy = await fixture(false), original = legacy.host.snapshot(), saved = JSON.stringify(original);
  legacy.host.restore(structuredClone(original));expect(JSON.stringify(legacy.host.snapshot())).toBe(saved);
  expect(() => legacy.host.stepExternal(1)).toThrow('external');
  const next = await fixture();expect(() => next.host.step(1)).toThrow('external');
});
