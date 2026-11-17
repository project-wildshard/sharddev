import { expect,test } from 'vitest';
import { v2CoreSource } from '../as/wsV2';
import { compileScriptV2 } from './compileScriptV2';
import { ScriptModuleV2 } from '@wildshard/engine/script/moduleV2';
import { prepareV2Observations } from '@wildshard/engine/script/observationsV2';
import { layoutV2,writeV2Frame,validateV2Frame,type V2FrameAuthority } from '@wildshard/format/scriptWireV2';

const layout = layoutV2(1024,1,new Map([[1,1],[2,10],[3,10],[4,6],[5,1],[6,1],[7,1],[8,1],[9,1]]));
function offset(kind: number,index = 0): number {
  const region = layout.regions[kind-1];if (region === undefined) throw new Error('Missing test region');return 1024+region.offset+index*region.stride;
}
const source = `import * as ws from './sdk/as/wsV2';
export function ws_abi():i32{return 2;} export function ws_io():i32{return ws.io();}
export function ws_init(lo:i32,hi:i32,fuel:i32):i32{return 0;}
export function ws_step(tick:i32,fuel:i32):i32{
 ws.beginState();ws.select(0);
 ws.setState(0,ws.distance(ws.parameter(0),ws.parameter(1),ws.parameter(2),ws.parameter(3)));
 ws.setState(1,ws.bearing(ws.parameter(0),ws.parameter(1),ws.parameter(2),ws.parameter(3)));
 ws.setState(2,ws.radialX(ws.parameter(4),ws.parameter(5)));ws.setState(3,ws.radialZ(ws.parameter(4),ws.parameter(5)));
 ws.setState(6,ws.field(0));ws.setState(7,ws.observed(0));ws.setState(8,ws.playerValue(0,0));
 ws.setState(9,ws.absoluteTick(ws.edgeWord(0,2))+ws.eventValue(0,0));return 0;
}`;
let compiled: Promise<Uint8Array> | undefined;
function bytes(): Promise<Uint8Array> {
  compiled ??= compileScriptV2(source,{ ioBytes: layout.bytes,sources: { 'sdk/as/wsV2.ts': v2CoreSource(1024) } });return compiled;
}
function prepare(view: DataView,values: readonly number[] = [0,0,3,4,.3,2]): V2FrameAuthority {
  const tick = 2**30+3, state = Array.from({ length: 10 },() => 0);state[4] = 2**40+.125;state[5] = -0;
  const prepared = prepareV2Observations(layout,tick,{
    bindings: [{ identity: 'test',handle: 1,self: 2,player: 3,observed: new Set([2,3]),enabled: true,due: true,divisor: 6,fuel: 100000,previousTick: tick-6,currentTick: tick,state,
      parameters: values.map((value,index) => ({ name: `p${index}`,value })),fields: [{ name: 'test',id: 9,value: 21 }],sample: { target: 0,atTick: tick,pose: { x: 17,y: 0,z: 0,yaw: 0 } } }],
    players: [{ identity: 'player',handle: 3,atTick: tick,pose: { x: 19,y: 0,z: 0,yaw: 0 } }],actions: new Set([2]),eventKinds: new Set([3]),
    edges: [{ player: 3,action: 2,atTick: 2**30-1,sequence: 1,phase: 1,x: 0,y: 0 }],events: [{ binding: 'test',kind: 3,subject: 0,player: 3,atTick: tick,sequence: 1,values: [4,0,0,0] }],
  });
  const authority = writeV2Frame(view,layout,{ module: 1,lane: 1,sequence: 1,tick,due: prepared.due },prepared.counts);prepared.write(view);return authority;
}
async function host(): Promise<ScriptModuleV2> { return new ScriptModuleV2(await bytes(),{ seed: [1,2],initFuel: 10000,ioBytes: layout.bytes,output: [{ offset: offset(3),count: 10,width: 8 }] }); }

test('the v2 SDK reads one host observation block with no function imports, preserving durable precision', async () => {
  const code = await bytes(), imports = WebAssembly.Module.imports(new WebAssembly.Module(new Uint8Array(code)));
  expect(imports).toEqual([{ module: 'env',name: 'memory',kind: 'memory' }]);
  const module = await host();let authority: V2FrameAuthority;
  const result = module.step(3,100000,view => { authority = prepare(view); },view => {
    validateV2Frame(view,layout,authority);return Array.from({ length: 10 },(_,i) => view.getFloat64(offset(3,i),true));
  }).value;
  expect(result.slice(0,4)).toEqual([5,Math.atan2(3,4),Math.sin(.3)*2,Math.cos(.3)*2]);
  expect(result[4]).toBe(2**40+.125);expect(Object.is(result[5],-0)).toBe(true);expect(result.slice(6)).toEqual([21,17,19,2**30+3]);
});
test('pure AS geometry matches the native convention for quadrants, large/small magnitudes and signed zero', async () => {
  const module = await host();
  for (const [x,z,toX,toZ,yaw,radius] of [[0,0,-3,4,1,3],[0,0,1e150,1e150,-1,4],[0,0,1e-150,2e-150,Math.PI,0],[0,0,-0,-0,-0,-0]] as const) {
    const result = module.step(3,100000,view => { prepare(view,[x,z,toX,toZ,yaw,radius]); },view => Array.from({ length: 4 },(_,i) => view.getFloat64(offset(3,i),true))).value;
    for (const [i,expected] of [Math.hypot(toX-x,toZ-z),Math.atan2(toX-x,toZ-z),Math.sin(yaw)*radius,Math.cos(yaw)*radius].entries()) {
      if (expected === 0) expect(Object.is(result[i],expected)).toBe(true);else expect(result[i]).toBeCloseTo(expected,Math.abs(expected) > 1 ? 10 : 155);
    }
  }
});
test('SDK absent reads, stale indices and forged directory extents trap locally before a host can publish', async () => {
  const module = await host();let reads = 0;
  for (const corrupt of [
    (view: DataView) => view.setUint32(offset(6)+4,0,true),
    (view: DataView) => view.setUint32(offset(5)+12,0,true),
    (view: DataView) => view.setUint32(offset(5),9,true),
    (view: DataView) => view.setUint32(offset(7)+4,0,true),
    (view: DataView) => view.setUint32(offset(1)+24,0x7fffffff,true),
    (view: DataView) => view.setUint32(1024+128+5*24+4,0xfffffff0,true),
    (view: DataView) => view.setUint32(1024+128+5*24+12,0xffffffff,true),
  ]) expect(() => module.step(3,100000,view => { prepare(view);corrupt(view); },() => { reads++; })).toThrow(WebAssembly.RuntimeError);
  expect(reads).toBe(0);
  expect(() => module.step(3,100000,view => { prepare(view); },() => undefined)).not.toThrow();
});
