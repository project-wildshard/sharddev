import { expect,test } from 'vitest';
import { DecisionHost,type DecisionScript,type DecisionHostOptions } from '@wildshard/engine/script/decision';
import { OwnedSimBatchV2,type OwnedV2Frame } from '@wildshard/engine/script/ownedSimBatchV2';
import { layoutV2 } from '@wildshard/format/scriptWireV2';
import { compileScript } from './compileScript';
import { compileSimV2 } from '../test/compileSimV2';

const layout = layoutV2(2048,1,new Map([[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[9,32],[10,32],[21,1],[22,1]]));
let modules: Promise<readonly [Uint8Array,Uint8Array]> | undefined;
function bytes(): Promise<readonly [Uint8Array,Uint8Array]> {
  modules ??= Promise.all([compileScript(`export function ws_abi():i32{return 1;}export function ws_io():i32{return 16384;}
export function ws_init(lo:i32,hi:i32):void{}export function ws_handle():i32{unreachable();return 0;}`,{ abi: 1 }),
    compileSimV2(`import * as ws from './sdk/as/wsV2';export function onBinding():void{
      if(ws.fieldPresent(0)&&ws.field(0)<0)unreachable();
      ws.setState(0,ws.state(0)+f64(ws.count(9)));
      ws.actorCommand(13,0,1,ws.state(0)+f64(ws.eventWord(0,4)),0);
      if(ws.fieldPresent(0)&&ws.field(0)>10)ws.actorCommand(13,0,99,7,0);
    }`,{ io: 2048,ioBytes: layout.bytes })]);return modules;
}
async function fixture() {
  const [old,modern] = await bytes(), effects: number[] = [];
  const script: DecisionScript = { id: 'owned',module: 'v1',side: 'sim',on: ['start','tick','signal'],tick: 10,stateVersion: 1,onFail: 'hold',state: [{ name: 'n',type: 'i32',scope: 'binding',default: 0,min: 0,max: 100 }],params: {},ids: { channels: { out: 1 } },reads: [],lists: [],commands: ['channel'] };
  const binding = { id: 1,script: script.id,self: 0,actors: [],instance: 0 };
  const options: DecisionHostOptions = { scripts: [script],bindings: [binding],modules: new Map([['v1',old]]),seed: [1,2],externalDivisor: 6,
    world: { read: () => 0,list: () => 0,failed: () => { throw new Error('Legacy call'); },prepare: commands => {
      const values = commands.map(row => row[3]);return { commit: () => { effects.push(...values); } };
    } } };
  const host = new DecisionHost(options), lane = new OwnedSimBatchV2(modern,{ host,bindings: [{ binding,script }],layout,divisor: 6,fuel: 100000,initFuel: 10000,seed: [1,2],eventKinds: new Set([1,2,13]) });
  function frame(fail: boolean | number = false): OwnedV2Frame { return { bindings: [{ id: 1,observed: new Map(),fields: [{ name: 'sample',id: 1,value: typeof fail === 'number' ? fail : fail ? -1 : 5 }],sample: { atTick: host.snapshot().tick,target: 0 } }],players: [] }; }
  const step = (tick: number,fail: boolean | number = false): void => { host.stepExternal(tick);lane.advance(tick,() => frame(fail),new Map()); };
  return { host,lane,step,effects,frame };
}
test('the original owner receives v2 commands only on its next native tick', async () => {
  const f = await fixture();f.host.enqueue(1,[1,0,0,0,0,0]);
  for (let tick = 1; tick <= 6; tick++) f.step(tick);
  expect(f.host.state(1)).toEqual({ n: 0 });expect(f.effects).toEqual([]);expect(f.host.snapshot().staged).toHaveLength(1);
  f.step(7);expect(f.host.state(1)).toEqual({ n: 2 });expect(f.effects).toEqual([1]);
  f.step(8);expect(f.effects).toEqual([1]);
});
test('old queued input uses the old saved tick, while v2 logical input round-trips exactly', async () => {
  const f = await fixture();for (let tick = 1; tick <= 5; tick++) f.step(tick);
  f.host.enqueue(1,[13,0,7,0,0,0]);const old = f.host.snapshot();
  const restore = f.lane.prepareRestore(old,undefined,new Map());expect(f.host.snapshot()).toEqual(old);restore();
  expect(f.lane.snapshot().input.events).toEqual([{ binding: '1',kind: 13,subject: null,player: null,atTick: 5,sequence: 1,values: [7,0,0,0] }]);
  const saved = f.lane.snapshot(), native = f.host.snapshot(), restored = await fixture();
  restored.lane.prepareRestore(native,saved,new Map())();
  expect(JSON.stringify(restored.lane.snapshot())).toBe(JSON.stringify(saved));
  f.step(6);restored.step(6);expect(restored.host.snapshot()).toEqual(f.host.snapshot());
  f.step(7);restored.step(7);expect(restored.effects).toEqual(f.effects);
});
test('a refused guest does not drain input or publish native state or effects', async () => {
  const f = await fixture();f.host.enqueue(1,[1,0,0,0,0,0]);
  for (let tick = 1; tick <= 6; tick++) f.step(tick,true);
  expect(f.host.state(1)).toEqual({ n: 0 });expect(f.effects).toEqual([]);expect(f.host.snapshot().staged).toEqual([]);
  expect(f.lane.snapshot().input.events.map(row => row.kind)).toEqual([1,2]);
  expect(f.lane.snapshot().failures).toBe(1);
});

test('a valid command prefix plus a malformed native suffix cannot publish state or consume input', async () => {
  const f = await fixture();f.host.enqueue(1,[1,0,0,0,0,0]);
  for (let tick = 1; tick <= 7; tick++) f.step(tick,13);
  expect(f.host.state(1)).toEqual({ n: 0 });expect(f.effects).toEqual([]);expect(f.host.snapshot().staged).toEqual([]);
  expect(f.lane.snapshot().input.events.map(row => row.kind)).toEqual([1,2]);expect(f.lane.snapshot().failures).toBe(1);
});
