import { expect,test } from 'vitest';
import { readV2QueryRequests,prepareV2QueryReplies,type V2QueryBinding,type V2QueryRequest,type V2QueryOperation } from '@wildshard/format/scriptQueriesV2';
import { compileSimV2 } from '../test/compileSimV2';
import { ScriptModuleV2 } from '@wildshard/engine/script/moduleV2';
import { prepareV2Observations } from '@wildshard/engine/script/observationsV2';
import { layoutV2,writeV2Frame,validateV2Frame,type V2FrameAuthority } from '@wildshard/format/scriptWireV2';

const layout = layoutV2(1024,1,new Map([[1,1],[2,1],[3,1],[5,1],[11,2],[12,2],[13,8]]));
const original: V2QueryBinding = { identity: 'quest',handle: 2,observed: new Map([[4,'body-A'],[9,'body-B']]),operations: new Set<V2QueryOperation>([4,5,8,9]) };
const restored: V2QueryBinding = { ...original,handle: 7,observed: new Map([[17,'body-A'],[43,'body-B']]) };
function at(kind: number,index = 0): number { const region = layout.regions[kind-1];if (region === undefined) throw new Error('Missing fixture region');return 1024+region.offset+index*region.stride; }
const program = `import * as ws from './sdk/as/wsV2';export function onBinding():void{
if(ws.count(12)==0)ws.query(8,1,ws.self(),0,2,0,0,-1,0,10);
else for(let i=0;i<ws.count(12);i++){if(ws.replyBinding(i)==ws.handle())ws.setState(0,ws.replyValue(i,4)+ws.replyData(i,3));}
}`;
let compiled: Promise<Uint8Array> | undefined;
async function host(): Promise<ScriptModuleV2> {
  compiled ??= compileSimV2(program,{ io: 1024,ioBytes: layout.bytes });
  return new ScriptModuleV2(await compiled,{ seed: [1,2],initFuel: 10000,ioBytes: layout.bytes,output: [{ offset: at(3),count: 1,width: 8 }] });
}
function prepare(view: DataView,binding = original,tick = 6,banks: readonly { kind: number; count: number; bytes: Uint8Array }[] = []): V2FrameAuthority {
  const observed = new Set(binding.observed.keys()), self = [...binding.observed].find(([,id]) => id === 'body-A')?.[0];if (self === undefined) throw new Error('Missing native body');
  const prepared = prepareV2Observations(layout,tick,{ bindings: [{ identity: binding.identity,handle: binding.handle,self,player: 0,observed,enabled: true,due: true,divisor: 6,fuel: 10000,previousTick: 0,currentTick: tick,state: [0],parameters: [],fields: [],sample: { atTick: tick,target: 0 } }],players: [],edges: [],events: [],actions: new Set(),eventKinds: new Set() });
  const counts = new Map(prepared.counts);for (const bank of banks) counts.set(bank.kind,bank.count);
  const authority = writeV2Frame(view,layout,{ module: 1,lane: 1,sequence: 1,tick,due: 1 },counts);prepared.write(view);
  for (const bank of banks) new Uint8Array(view.buffer,view.byteOffset+at(bank.kind),bank.bytes.length).set(bank.bytes);return authority;
}
async function issued(): Promise<{ memory: ArrayBuffer; request: V2QueryRequest }> {
  const module = await host();let authority: V2FrameAuthority;
  const requests = module.step(6,100000,view => { authority = prepare(view); },view => {
    const counts = validateV2Frame(view,layout,authority);return readV2QueryRequests(view,layout,counts[10] ?? 0,6,new Map([[2,original]]));
  }).value;
  const request = requests[0];if (request === undefined) throw new Error('Missing issued query');return { memory: module.memory.buffer.slice(0),request };
}
test('real AS emits a finite bounded query and intake resolves scoped targets to stable saved identities', async () => {
  const { request } = await issued();expect(request).toEqual({ binding: 'quest',id: 1,op: 8,target: 'body-A',atTick: 6,values: [0,2,0,0,-1,0,10] });
  expect(Object.isFrozen(request)).toBe(true);expect(Object.isFrozen(request.values)).toBe(true);
});
test('query intake refuses unknown operations/flags, wrong issue ticks, forged arguments and duplicate ids atomically', async () => {
  const { memory } = await issued();
  const corruptions = [
    (view: DataView) => view.setUint32(at(11)+8,99,true),(view: DataView) => view.setUint32(at(11)+12,1,true),
    (view: DataView) => view.setInt32(at(11)+16,5,true),(view: DataView) => view.setUint32(at(11)+20,999,true),
    (view: DataView) => view.setFloat64(at(11)+24,Number.NaN,true),(view: DataView) => view.setFloat64(at(11)+56,0,true),
    (view: DataView) => view.setUint32(at(11)+4,0,true),
  ];
  for (const corrupt of corruptions) { const view = new DataView(memory.slice(0));corrupt(view);expect(() => readV2QueryRequests(view,layout,1,6,new Map([[2,original]]))).toThrow(); }
  const duplicate = new DataView(memory.slice(0));new Uint8Array(duplicate.buffer,at(11,1),80).set(new Uint8Array(duplicate.buffer,at(11),80));expect(() => readV2QueryRequests(duplicate,layout,2,6,new Map([[2,original]]))).toThrow('Duplicate');
  expect(() => readV2QueryRequests(new DataView(memory),layout,3,6,new Map([[2,original]]))).toThrow('length');
});
test('next-entry replies remap saved body identities to fresh local handles and remain readable without imports', async () => {
  const { request } = await issued(), answer = { status: 1 as const,kind: 'ray' as const,hit: { point: [0,0,0] as const,normal: [0,1,0] as const,distance: 2,body: 'body-B' } };
  const banks = prepareV2QueryReplies(layout,7,[{ request,atTick: 6,answer }],new Map([['quest',restored]]));
  const reply = banks[0], data = banks[1];if (reply === undefined || data === undefined) throw new Error('Missing reply banks');
  expect(new DataView(reply.bytes.buffer).getUint32(0,true)).toBe(7);expect(new DataView(data.bytes.buffer).getFloat64(24,true)).toBe(43);
  const module = await host();let authority: V2FrameAuthority;
  expect(module.step(7,100000,view => { authority = prepare(view,restored,7,banks); },view => { validateV2Frame(view,layout,authority);return view.getFloat64(at(3),true); }).value).toBe(45);
  expect(() => prepareV2QueryReplies(layout,6,[{ request,atTick: 6,answer }],new Map([['quest',original]]))).toThrow('delivery tick');
});
test('reply capacity, stale handles and bad result domains refuse a whole reply batch without truncation', async () => {
  const { request } = await issued(), bindings = new Map([['quest',original]]);
  expect(() => prepareV2QueryReplies(layout,7,[{ request,atTick: 6,answer: { status: 1,kind: 'ray',hit: { point: [0,0,0],normal: [0,1,0],distance: 2,body: 'stale' } } }],bindings)).toThrow('Stale');
  expect(() => prepareV2QueryReplies(layout,7,[{ request,atTick: 6,answer: { status: 1,kind: 'ray',hit: { point: [0,0,0],normal: [0,1,0],distance: 11,body: null } } }],bindings)).toThrow('distance');
  expect(() => prepareV2QueryReplies(layout,7,[{ request: { ...request,op: 5,target: null },atTick: 6,answer: { status: 1,kind: 'path',points: [[0,0,0],[1,1,1],[2,2,2]] } }],bindings)).toThrow('ring full');
  const refusal = { request,atTick: 6,answer: { status: 3 as const } };
  expect(() => prepareV2QueryReplies(layout,7,[refusal,refusal],bindings)).toThrow('identity');
  const banks = prepareV2QueryReplies(layout,7,[refusal],bindings);expect(banks[1]?.count).toBe(0);
});
