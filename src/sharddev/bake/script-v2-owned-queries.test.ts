import { expect,test,vi } from 'vitest';
import * as v from 'valibot';
import { DecisionHost,type DecisionScript,type DecisionHostOptions,type DecisionSnapshot } from '@wildshard/engine/script/decision';
import { OwnedSimBatchV2,type OwnedV2Frame,type OwnedV2Input } from '@wildshard/engine/script/ownedSimBatchV2';
import { answerV2QueryBatch } from '@wildshard/engine/script/queriesV2';
import { layoutV2 } from '@wildshard/format/scriptWireV2';
import type { V2QueryOperation,V2QueryAnswer } from '@wildshard/format/scriptQueriesV2';
import { compileScript } from './compileScript';
import { compileSimV2 } from '../test/compileSimV2';

const layout = layoutV2(2048,1,new Map([[1,1],[2,2],[3,2],[5,1],[6,1],[7,1],[9,32],[10,32],[11,2],[12,2],[13,4],[21,1],[22,1]]));
let modules: Promise<readonly [Uint8Array,Uint8Array]> | undefined;
function bytes(): Promise<readonly [Uint8Array,Uint8Array]> {
  modules ??= Promise.all([compileScript(`export function ws_abi():i32{return 1;}export function ws_io():i32{return 16384;}
export function ws_init(lo:i32,hi:i32):void{}export function ws_handle():i32{unreachable();return 0;}`,{ abi: 1 }),
    compileSimV2(`import * as ws from './sdk/as/wsV2';export function onBinding():void{
      const next=ws.state(0)+1;ws.setState(0,next);
      for(let i=0;i<ws.count(12);i++)if(ws.replyBinding(i)==ws.handle()&&ws.replyStatus(i)==1){
        ws.setState(1,ws.replyValue(i,4));ws.actorCommand(13,0,1,ws.replyValue(i,0),0);
      }
      ws.query(ws.field(0)==2?8:10,u32(next),0,0,0,0,10,7,0,0);
      if(ws.field(0)==1)ws.actorCommand(13,0,99,1,0);
    }`,{ io: 2048,ioBytes: layout.bytes })]);return modules;
}
const observed = new Map([[4,'actor-A'],[9,'actor-B']]);
const answer: V2QueryAnswer = { status: 1,kind: 'nearest',actor: { id: 'actor-B',point: [2,0,0],distance: 2 } };
async function fixture(queries = true) {
  const [old,modern] = await bytes(), effects: number[] = [];
  const script: DecisionScript = { id: 'original',module: 'oracle',side: 'sim',on: ['tick'],tick: 10,onFail: 'hold',stateVersion: 1,
    state: [{ name: 'calls',type: 'i32',default: 0,scope: 'binding',min: 0,max: 100 },{ name: 'distance',type: 'f64',default: -1,scope: 'binding',min: -1,max: 100 }],params: {},ids: { channels: { nearest: 1 },actors: { self: 4 } },reads: [],lists: [],commands: ['channel'] };
  const binding = { id: 1,script: script.id,self: 4,actors: [4],instance: 0 };
  const options: DecisionHostOptions = { scripts: [script],bindings: [binding],modules: new Map([['oracle',old]]),seed: [1,2],externalDivisor: 6,
    world: { read: () => 0,list: () => 0,failed: () => { throw new Error('Unexpected legacy guest'); },prepare: commands => {
      for (const command of commands) if (command[0] !== 13 || command[2] !== 1) throw new Error('Invalid original channel');
      return { commit: () => { for (const command of commands) effects.push(command[3]); } };
    } } };
  const host = new DecisionHost(options),runner = new OwnedSimBatchV2(modern,{ host,bindings: [{ binding,script }],layout,divisor: 6,fuel: 100000,initFuel: 10000,seed: [1,2],eventKinds: new Set([2]),
    ...(queries ? { queries: { pending: 1,operations: new Map<V2QueryOperation,number>([[10,0]]) } } : {}) });
  const step = (tick: number,mode = 0) => {
    host.stepExternal(tick);
    return runner.advance(tick,(): OwnedV2Frame => ({ bindings: [{ id: 1,observed,fields: [{ name: 'mode',id: 1,value: mode }],sample: { atTick: tick,target: 0 } }],players: [] }),observed);
  };
  const ring = () => { const result = runner.queryRing;if (result === undefined) throw new Error('No query fixture');return result; };
  return { host,runner,step,ring,effects };
}
function saved(host: DecisionHost,runner: OwnedSimBatchV2): string { return JSON.stringify({ native: host.snapshot(),input: runner.snapshot() }); }
const envelope = v.strictObject({ native: v.custom<DecisionSnapshot>(value => typeof value === 'object' && value !== null),input: v.custom<OwnedV2Input>(value => typeof value === 'object' && value !== null) });

test('the original native owner accepts queries with state, resolves after bodies and consumes replies only at the next due call', async () => {
  const f = await fixture();let calls = 0;
  for (let tick = 1; tick <= 13; tick++) {
    const result = f.step(tick);
    if (tick === 6) {
      expect(result.status).toBe('staged');expect(f.host.state(1)).toEqual({ calls: 0,distance: -1 });expect(calls).toBe(0);
      expect(f.ring().snapshot().entries[0]?.request).toMatchObject({ binding: '1',id: 1,op: 10,atTick: 6,target: null });
    }
    if (tick === 12) {
      expect(f.host.state(1)).toEqual({ calls: 1,distance: -1 });expect(f.effects).toEqual([]);
      expect(f.ring().snapshot().entries.map(row => row.request.id)).toEqual([2]);
    }
    f.ring().afterBodies(tick,requests => { calls++;expect(requests).toHaveLength(1);expect(requests[0]?.atTick).toBe(tick);return [answer]; });
  }
  expect(calls).toBe(2);expect(f.host.state(1)).toEqual({ calls: 2,distance: 2 });expect(f.effects).toEqual([9]);
});

test('bad command or query suffix keeps ready replies, input, state and RNG unconsumed', async () => {
  for (const mode of [1,2]) {
    const f = await fixture();
    for (let tick = 1; tick <= 11; tick++) { f.step(tick);f.ring().afterBodies(tick,() => [answer]); }
    const before = f.ring().snapshot(),state = f.host.state(1),rng = f.host.snapshot().bindings[0]?.rng;
    expect(f.step(12,mode)).toMatchObject({ status: 'staged',attempts: 2,excluded: 1 });expect(f.runner.snapshot().failures).toBe(1);
    expect(f.ring().snapshot()).toEqual(before);expect(f.host.state(1)).toEqual(state);expect(f.effects).toEqual([]);
    expect(f.runner.snapshot().input.events).toMatchObject([{ kind: 2,atTick: 12 }]);expect(f.host.snapshot().bindings[0]?.rng).toBe(rng);expect(f.host.snapshot().staged).toEqual([]);
  }
});

test('pending and ready query states round-trip inside the same native envelope without running a guest or replaying a query', async () => {
  const f = await fixture();for (let tick = 1; tick <= 6; tick++) f.step(tick);
  const pending = saved(f.host,f.runner),g = await fixture(),decode = v.parse(envelope,JSON.parse(pending));
  const instantiate = vi.spyOn(WebAssembly,'Instance');
  try { g.runner.prepareRestore(decode.native,decode.input,observed)();expect(instantiate).not.toHaveBeenCalled(); } finally { instantiate.mockRestore(); }
  expect(saved(g.host,g.runner)).toBe(pending);
  f.ring().afterBodies(6,() => [answer]);g.ring().afterBodies(6,() => [answer]);
  const ready = saved(g.host,g.runner),h = await fixture(),resumed = v.parse(envelope,JSON.parse(ready));
  h.runner.prepareRestore(resumed.native,resumed.input,observed)();expect(saved(h.host,h.runner)).toBe(ready);
  for (let tick = 7; tick <= 13; tick++) for (const current of [f,g,h]) { current.step(tick);current.ring().afterBodies(tick,() => [answer]); }
  expect(saved(h.host,h.runner)).toBe(saved(f.host,f.runner));expect(h.effects).toEqual([9]);
  const noQueries = await fixture(false);expect(() => noQueries.runner.prepareRestore(resumed.native,resumed.input,observed)).toThrow('query authority');
});

test('old input saves migrate to an empty ring and default modules still reject query output without changing their wire', async () => {
  const f = await fixture(),old = { input: f.runner.snapshot().input,failures: 0 };
  f.runner.prepareRestore(f.host.snapshot(),old,observed)();expect(f.ring().snapshot().entries).toEqual([]);
  const original = await fixture(false);expect(original.runner.snapshot()).not.toHaveProperty('queries');
  for (let tick = 1; tick <= 5; tick++) original.step(tick);
  expect(original.step(6)).toMatchObject({ status: 'staged',attempts: 2,excluded: 1 });expect(original.runner.snapshot().failures).toBe(1);expect(original.host.state(1)).toEqual({ calls: 0,distance: -1 });
  expect(original.runner.snapshot()).not.toHaveProperty('queries');
});

test('shared afterBodies batches modules and stale prepared query work refuses before a native publication', async () => {
  const a = await fixture(),b = await fixture();for (let tick = 1; tick <= 6; tick++) { a.step(tick);b.step(tick); }
  const beforeA = a.ring().snapshot(),beforeB = b.ring().snapshot();
  expect(() => answerV2QueryBatch([{ identity: 'a',ring: a.ring() },{ identity: 'b',ring: b.ring() }],6,() => [answer,{ status: 1,kind: 'sight',visible: true }])).toThrow();
  expect(a.ring().snapshot()).toEqual(beforeA);expect(b.ring().snapshot()).toEqual(beforeB);
  answerV2QueryBatch([{ identity: 'b',ring: b.ring() },{ identity: 'a',ring: a.ring() }],6,rows => { expect(rows.map(row => row.module)).toEqual(['a','b']);return [answer,answer]; });
  const current = a.ring().snapshot(),restore = a.ring().prepareRestore(current,new Map([['1',new Set(observed.values())]]));
  restore.validate();a.ring().afterBodies(7,() => []);
  expect(() => restore.validate()).toThrow('Stale');expect(() => restore()).toThrow('Stale');
});


test('interrupt clears pure work without inventing an afterBodies phase or resetting live request ids', async () => {
  const f = await fixture();for (let tick = 1; tick <= 6; tick++) { f.step(tick);if (tick < 6) f.ring().afterBodies(tick,() => []); }
  expect(f.ring().snapshot().entries).toHaveLength(1);f.runner.clearInput();
  expect(f.ring().snapshot().entries).toEqual([]);expect(f.ring().snapshot().highWater[0]?.id).toBe(1);
  expect(() => f.ring().afterBodies(6,() => { throw new Error('Cleared query replayed'); })).not.toThrow();
  f.runner.clearInput(true);expect(f.ring().snapshot().highWater[0]?.id).toBe(0);
});
