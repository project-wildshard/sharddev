import { expect,test } from 'vitest';
import { QueryRingV2,answerV2QueryBatch } from '@wildshard/engine/script/queriesV2';
import { SimBatchV2 } from '@wildshard/engine/script/simBatchV2';
import { compileSimV2 } from '../test/compileSimV2';
import { prepareV2Observations } from '@wildshard/engine/script/observationsV2';
import { layoutV2,writeV2Frame,validateV2Frame,type V2FrameAuthority } from '@wildshard/format/scriptWireV2';
import type { V2QueryBinding,V2QueryOperation,V2QueryAnswer } from '@wildshard/format/scriptQueriesV2';

const layout = layoutV2(1024,1,new Map([[1,1],[2,2],[3,2],[5,1],[11,2],[12,2],[13,8]]));
const binding: V2QueryBinding = { identity: 'quest',handle: 1,observed: new Map([[4,'body-A'],[9,'body-B']]),operations: new Set<V2QueryOperation>([8]) }, byHandle = new Map([[1,binding]]), byName = new Map([['quest',binding]]), due = new Set(['quest']);
const program = `import * as ws from './sdk/as/wsV2';export function onBinding():void{
for(let i=0;i<ws.count(12);i++){if(ws.replyBinding(i)==ws.handle()&&ws.replyStatus(i)==1)ws.setState(1,ws.replyValue(i,4));}
ws.setState(0,ws.state(0)+1);ws.query(8,u32(ws.state(0))+1,ws.self(),0,2,0,0,-1,0,10);}`;
let compiled: Promise<Uint8Array> | undefined;
function bytes(): Promise<Uint8Array> { compiled ??= compileSimV2(program,{ io: 1024,ioBytes: layout.bytes });return compiled; }
function ring(pending = 1,reservation = 4): QueryRingV2 { return new QueryRingV2(layout,new Map([['quest',{ pending,operations: new Map<V2QueryOperation,number>([[8,reservation]]) }]])); }
function at(kind: number): number { const region = layout.regions[kind-1];if (region === undefined) throw new Error('Missing fixture region');return 1024+region.offset; }
function observations(tick: number,state: readonly number[]) {
  return { bindings: [{ identity: 'quest',handle: 1,self: 4,player: 0,observed: new Set([4,9]),enabled: true,due: true,divisor: 6 as const,fuel: 10000,previousTick: Math.max(0,tick-6),currentTick: tick,state,parameters: [],fields: [],sample: { atTick: tick,target: 0 } }],players: [],edges: [],events: [],actions: new Set<number>(),eventKinds: new Set<number>() };
}
function answer(distance = 2): V2QueryAnswer { return { status: 1,kind: 'ray',hit: { point: [0,0,0],normal: [0,1,0],distance,body: 'body-B' } }; }
function requestFrame(tick = 0,id = 1): DataView {
  const view = new DataView(new ArrayBuffer(65536)), prepared = prepareV2Observations(layout,tick,observations(tick,[0,-1]));
  const authority: V2FrameAuthority = writeV2Frame(view,layout,{ lane: 1,module: 1,sequence: 1,tick,due: 1 },prepared.counts);prepared.write(view);
  [1,id,8,0,tick,4].forEach((value,i) => view.setUint32(at(11)+i*4,value,true));[0,2,0,0,-1,0,10].forEach((value,i) => view.setFloat64(at(11)+24+i*8,value,true));
  view.setUint32(1024+60,1,true);view.setUint32(1024+128+10*24+16,1,true);validateV2Frame(view,layout,authority);return view;
}
test('query work runs once after bodies, replies arrive at the next eligible entry and accepted state commits next step', async () => {
  const queries = ring(), committed = [0,-1], lane = new SimBatchV2(await bytes(),{ layout,ordinal: 0,handle: 1,divisor: 6,bindings: [{ identity: 'quest',handle: 1 }],fuel: 100000,initFuel: 10000,seed: [1,2],output: [{ offset: at(3),count: 2,width: 8 }] });
  let calls = 0, bodyPhase = 0;
  for (let tick = 0; tick <= 7; tick++) {
    let delivery: ReturnType<QueryRingV2['delivery']> | undefined;
    lane.advance(tick,() => {
      delivery = queries.delivery(tick,byName,due);return { observations: observations(tick,committed),extra: delivery.banks };
    },candidate => {
      if (delivery === undefined || candidate.counts[2] !== 2) throw new Error('Missing candidate');
      const columns = [candidate.view.getFloat64(at(3),true),candidate.view.getFloat64(at(3)+8,true)];
      return { accept: queries.prepareFrame(candidate.view,candidate.counts[10] ?? 0,tick,byHandle,delivery.consumed,candidate.excluded),commit: () => { committed.splice(0,2,...columns); } };
    });
    if (tick === 0) { expect(calls).toBe(0);expect(committed).toEqual([0,-1]); }
    if (tick === 6) { expect(committed).toEqual([1,-1]);expect(queries.snapshot().entries[0]?.request.id).toBe(2); }
    bodyPhase = tick+1;queries.afterBodies(tick,requests => { calls++;expect(requests).toHaveLength(1);expect(bodyPhase).toBe(tick+1);return [answer(tick === 0 ? 2 : 3)]; });
    if (tick === 0) expect(queries.delivery(0,byName,due).consumed).toEqual([]);
  }
  expect(calls).toBe(2);expect(committed).toEqual([2,2]);
});
test('pending and ready continuations round-trip stable identities without re-querying or local-handle storage', () => {
  const original = ring();original.prepareFrame(requestFrame(),1,0,byHandle)();const pending = original.snapshot();
  expect(pending.entries[0]?.request.target).toBe('body-A');const restored = ring(), observed = new Map([['quest',new Set(['body-A','body-B'])]]);restored.restore(pending,observed);expect(restored.snapshot()).toEqual(pending);
  let calls = 0;restored.afterBodies(0,requests => { calls++;expect(requests[0]?.target).toBe('body-A');expect(Object.isFrozen(requests[0])).toBe(true);expect(Object.isFrozen(requests[0]?.values)).toBe(true);return [answer()]; });
  const ready = restored.snapshot(), resumed = ring();resumed.restore(ready,observed);expect(resumed.snapshot()).toEqual(ready);resumed.afterBodies(1,() => { calls++;return []; });expect(calls).toBe(1);
  const remapped = { ...binding,handle: 7,observed: new Map([[17,'body-A'],[43,'body-B']]) }, delivered = resumed.delivery(6,new Map([['quest',remapped]]),due);
  const bank = delivered.banks[1];if (bank === undefined) throw new Error('Missing scalar bank');expect(new DataView(bank.bytes.buffer).getFloat64(24,true)).toBe(43);
});
test('a later state/command refusal cannot enqueue queries prepared earlier in the same module candidate', async () => {
  const queries = ring(), lane = new SimBatchV2(await bytes(),{ layout,ordinal: 0,handle: 1,divisor: 6,bindings: [{ identity: 'quest',handle: 1 }],fuel: 100000,initFuel: 10000,seed: [1,2],output: [{ offset: at(3),count: 2,width: 8 }] });
  expect(lane.advance(0,() => ({ observations: observations(0,[0,-1]) }),candidate => {
    queries.prepareFrame(candidate.view,candidate.counts[10] ?? 0,0,byHandle,[],candidate.excluded);throw new Error('Other candidate domain refused');
  }).status).toBe('refused');expect(queries.snapshot().entries).toEqual([]);expect(queries.snapshot().highWater[0]?.id).toBe(0);
  let calls = 0;queries.afterBodies(0,() => { calls++;return []; });expect(calls).toBe(0);
});
test('full requests/reservations, stale preparations and duplicate or reused ids never mutate the committed queue', () => {
  const queries = ring(), view = requestFrame(), accept = queries.prepareFrame(view,1,0,byHandle);expect(queries.snapshot().entries).toEqual([]);accept();const pending = queries.snapshot();
  expect(() => accept()).toThrow('Stale');expect(() => queries.prepareFrame(requestFrame(1,2),1,1,byHandle)).toThrow('full');expect(queries.snapshot()).toEqual(pending);
  queries.afterBodies(0,() => [answer()]);const delivered = queries.delivery(6,byName,due), ready = queries.snapshot();
  expect(() => queries.prepareFrame(requestFrame(6,1),1,6,byHandle,delivered.consumed)).toThrow('Reused');expect(queries.snapshot()).toEqual(ready);
  const doubled = requestFrame();new Uint8Array(doubled.buffer,at(11)+80,80).set(new Uint8Array(doubled.buffer,at(11),80));doubled.setUint32(at(11)+84,2,true);
  const reserved = ring(2,5);expect(() => reserved.prepareFrame(doubled,2,0,byHandle)).toThrow('reservation full');expect(reserved.snapshot().entries).toEqual([]);
});
test('bad or partial resolver batches publish nothing and cannot reenter the query owner', () => {
  const queries = ring();queries.prepareFrame(requestFrame(),1,0,byHandle)();const before = queries.snapshot();
  expect(() => queries.afterBodies(0,() => [])).toThrow('Incomplete');expect(queries.snapshot()).toEqual(before);
  expect(() => queries.afterBodies(0,() => { queries.afterBodies(0,() => []);return [answer()]; })).toThrow('re-entry');expect(queries.snapshot()).toEqual(before);
  expect(() => queries.afterBodies(0,() => [answer(11)])).toThrow('ray answer');expect(queries.snapshot()).toEqual(before);
  queries.afterBodies(0,() => [answer()]);expect(() => queries.afterBodies(0,() => [])).toThrow('Repeated');
  expect(queries.delivery(6,byName,new Set()).consumed).toEqual([]);expect(queries.snapshot().entries).toHaveLength(1);
});
test('strict restore rejects malformed/foreign requests and phases while preserving the existing continuation', () => {
  const queries = ring();queries.prepareFrame(requestFrame(),1,0,byHandle)();const saved = queries.snapshot(), observed = new Map([['quest',new Set(['body-A','body-B'])]]), entry = saved.entries[0];if (entry === undefined) throw new Error('Missing saved query');
  for (const invalid of [
    { ...saved,entries: [{ ...entry,request: { ...entry.request,values: [0,2,0,0,0,0,10] } }] },
    { ...saved,entries: [{ ...entry,request: { ...entry.request,target: 'foreign' } }] },
    { ...saved,entries: [{ ...entry,request: { ...entry.request,id: 2 } }] },
    { ...saved,entries: [{ ...entry,request: { ...entry.request,wireHandle: 4 } }] },
    { ...saved,entries: [{ ...entry,request: { ...entry.request,values: [...entry.request.values,42] } }] },
    { ...saved,phase: 0 },{ ...saved,highWater: [] },
  ]) { expect(() => queries.restore(invalid,observed)).toThrow();expect(queries.snapshot()).toEqual(saved); }
});
test('one authority pass batches all modules and no module publishes if another answer is invalid', () => {
  const a = ring(), b = ring();a.prepareFrame(requestFrame(),1,0,byHandle)();b.prepareFrame(requestFrame(),1,0,byHandle)();const beforeA = a.snapshot(), beforeB = b.snapshot();let calls = 0;
  const rings = [{ identity: 'b',ring: b },{ identity: 'a',ring: a }];
  expect(() => answerV2QueryBatch(rings,0,requests => { calls++;expect(requests.map(row => row.module)).toEqual(['a','b']);return [answer(),answer(11)]; })).toThrow('ray answer');
  expect(a.snapshot()).toEqual(beforeA);expect(b.snapshot()).toEqual(beforeB);
  answerV2QueryBatch(rings,0,requests => { calls++;expect(requests).toHaveLength(2);return [answer(),answer()]; });expect(calls).toBe(2);
  expect(a.snapshot().entries[0]?.reply?.atTick).toBe(0);expect(b.snapshot().entries[0]?.reply?.atTick).toBe(0);
});
test('an oversized native result becomes an explicit refusal with no truncated data and ids never wrap', () => {
  const queries = new QueryRingV2(layout,new Map([['quest',{ pending: 1,operations: new Map<V2QueryOperation,number>([[5,3]]) }]])), view = requestFrame(), path = { ...binding,operations: new Set<V2QueryOperation>([5]) };
  view.setUint32(at(11)+8,5,true);view.setUint32(at(11)+20,0,true);[0,0,0,1,1,1,.3].forEach((value,i) => view.setFloat64(at(11)+24+i*8,value,true));queries.prepareFrame(view,1,0,new Map([[1,path]]))();
  queries.afterBodies(0,() => [{ status: 1,kind: 'path',points: [[0,0,0],[1,1,1]] }]);expect(queries.snapshot().entries[0]?.reply?.answer).toEqual({ status: 3 });
  const delivered = queries.delivery(6,new Map([['quest',path]]),due);expect(delivered.banks[1]?.count).toBe(0);
  const ids = ring();ids.prepareFrame(requestFrame(0,0xffffffff),1,0,byHandle)();ids.afterBodies(0,() => [answer()]);
  expect(() => ids.prepareFrame(requestFrame(6,1),1,6,byHandle,ids.delivery(6,byName,due).consumed)).toThrow('Reused');
});
test('afterBodies loans release idempotently and an old release cannot unlock a later phase', () => {
  const queries = ring(), first = queries.openAfterBodies(0);first.release();first.release();const second = queries.openAfterBodies(0);first.release();
  expect(() => queries.prepareFrame(requestFrame(),1,0,byHandle)).toThrow('re-entry');expect(() => first.prepare([])).toThrow('Released');second.release();
  expect(() => queries.prepareFrame(requestFrame(),1,0,byHandle)).not.toThrow();
});
