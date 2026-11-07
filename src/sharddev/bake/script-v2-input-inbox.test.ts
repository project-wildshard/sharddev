import { expect,test } from 'vitest';
import { InputInboxV2,type V2InputBinding } from '@wildshard/engine/script/inputInboxV2';
import { prepareV2Observations } from '@wildshard/engine/script/observationsV2';
import { layoutV2,writeV2Frame,validateV2Frame,type V2FrameAuthority } from '@wildshard/format/scriptWireV2';
import { compileSimV2 } from '../test/compileSimV2';
import { ScriptModuleV2 } from '@wildshard/engine/script/moduleV2';

const layout = layoutV2(1024,1,new Map([[1,2],[2,2],[3,2],[5,2],[7,1],[8,4],[9,4]]));
const rights = { bindings: new Set(['law','sleeping']),players: new Set(['player']),actions: new Map([['strike',3]]),eventKinds: new Set([7]),lagTicks: 6 };
function binding(handle = 1,player = 11,subject = 12,due = true): V2InputBinding { return { handle,due,observed: new Map([[player,'player'],[subject,'animal']]) }; }
function tables() { return { bindings: new Map([['law',binding()],['sleeping',binding(2,11,12,false)]]),players: new Map([['player',11]]) }; }
const edge = { player: 'player',action: 'strike',phase: 1 as const,x: 0,y: 0 };
const event = { binding: 'law',kind: 7,subject: 'animal',player: 'player',values: [1,2,3,4] as const };

test('a real 10 Hz v2 guest sees press and release at their original 60 Hz ticks', async () => {
  const inbox = new InputInboxV2(layout,rights), { bindings,players } = tables();
  inbox.edge(1,edge);inbox.edge(3,{ ...edge,phase: 2 });inbox.event(4,event);
  const delivery = inbox.capture(6,bindings,players), code = await compileSimV2(`import * as ws from './sdk/as/wsV2';
export function onBinding():void{ws.setState(0,ws.absoluteTick(ws.edgeWord(1,2))-ws.absoluteTick(ws.edgeWord(0,2)));ws.setState(1,ws.absoluteTick(ws.eventWord(0,4)));}`,
  { io: 1024,ioBytes: layout.bytes });
  const state = layout.regions[2];if (state === undefined) throw new Error('Missing candidate state');
  const module = new ScriptModuleV2(code,{ seed: [1,2],initFuel: 10000,ioBytes: layout.bytes,output: [{ offset: layout.io+state.offset,count: 2,width: 8 }] });
  let authority: V2FrameAuthority;
  const run = () => module.step(6,100000,view => {
    const input = prepareV2Observations(layout,6,{ ...delivery,actions: new Set([3]),eventKinds: new Set([7]),
      bindings: [{ identity: 'law',handle: 1,self: 12,player: 11,observed: new Set([11,12]),enabled: true,due: true,divisor: 6,fuel: 100000,previousTick: 0,currentTick: 6,state: [0,0],parameters: [],fields: [],sample: { target: 0,atTick: 6 } }],
      players: [{ identity: 'player',handle: 11,atTick: 6 }],
    });
    authority = writeV2Frame(view,layout,{ lane: 1,module: 1,sequence: 1,tick: 6,due: 1 },input.counts);input.write(view);
  },view => { validateV2Frame(view,layout,authority);return [view.getFloat64(layout.io+state.offset,true),view.getFloat64(layout.io+state.offset+8,true)]; }).value;
  const before = inbox.snapshot();expect(run()).toEqual([2,4]);expect(run()).toEqual([2,4]);expect(inbox.snapshot()).toEqual(before);
  delivery.accept();expect(inbox.capture(12,bindings,players).edges).toEqual([]);expect(inbox.snapshot().events).toEqual([]);
});
test('accepted delivery keeps later receipts and events belonging to sleeping bindings', () => {
  const inbox = new InputInboxV2(layout,rights), { bindings,players } = tables();
  inbox.edge(1,edge);inbox.event(2,event);inbox.event(3,{ ...event,binding: 'sleeping' });
  const delivery = inbox.capture(6,bindings,players);inbox.edge(6,{ ...edge,phase: 2 });delivery.accept();
  expect(() => delivery.accept()).toThrow('Stale');
  expect(inbox.snapshot().edges.map(row => row.atTick)).toEqual([6]);expect(inbox.snapshot().events.map(row => row.binding)).toEqual(['sleeping']);
  const active = new Map([['law',binding()],['sleeping',binding(2)]]), next = inbox.capture(12,active,players);
  expect(next.edges.map(row => row.phase)).toEqual([2]);expect(next.events[0]?.binding).toBe('sleeping');next.accept();
  expect(inbox.snapshot().edges).toEqual([]);expect(inbox.snapshot().events).toEqual([]);
});
test('the existing authority can save and restore stable identities under different transient handles', () => {
  const inbox = new InputInboxV2(layout,rights);inbox.edge(2,edge);inbox.event(4,event);
  const wire = JSON.stringify(inbox.snapshot()), restored = new InputInboxV2(layout,rights);restored.restore(JSON.parse(wire));
  expect(JSON.stringify(restored.snapshot())).toBe(wire);
  const delivery = restored.capture(6,new Map([['law',binding(9,51,72)]]),new Map([['player',51]]));
  expect(delivery.edges[0]?.player).toBe(51);expect(delivery.events[0]).toMatchObject({ binding: 'law',subject: 72,player: 51,atTick: 4 });
  const before = restored.snapshot();expect(() => restored.restore({ ...before,events: [before.events[0],before.events[0]] })).toThrow();expect(restored.snapshot()).toEqual(before);
  expect(() => restored.capture(6,new Map([['law',binding(9,51,51)]]),new Map([['player',51]]))).toThrow('subject');
});
test('receipt lag and bounded capacity refuse atomically without consuming sequence or input', () => {
  const inbox = new InputInboxV2(layout,rights);inbox.edge(10,edge,4);const first = inbox.snapshot();
  for (const stamp of [3,11,Number.NaN]) { expect(() => inbox.edge(10,edge,stamp)).toThrow();expect(inbox.snapshot()).toEqual(first); }
  inbox.edge(10,edge);inbox.edge(10,edge);inbox.edge(10,edge);const full = inbox.snapshot();
  expect(() => inbox.edge(10,edge)).toThrow('full');expect(inbox.snapshot()).toEqual(full);
  const local = new InputInboxV2(layout,{ ...rights,lagTicks: 0 });expect(() => local.edge(10,edge,9)).toThrow();
  expect(() => new InputInboxV2(layout,{ ...rights,lagTicks: 7 })).toThrow();
});
