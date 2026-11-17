import { expect,test } from 'vitest';
import { compileSimV2 } from '../test/compileSimV2';
import { compileScriptV2 } from './compileScriptV2';
import { ScriptModuleV2 } from '@wildshard/engine/script/moduleV2';
import { prepareV2Observations,type V2BindingInput } from '@wildshard/engine/script/observationsV2';
import { layoutV2,writeV2Frame,validateV2Frame,type V2FrameAuthority } from '@wildshard/format/scriptWireV2';

const layout = layoutV2(1024,1,new Map([[1,2],[2,2],[3,2],[4,2],[5,2]]));
const program = `import * as ws from './sdk/as/wsV2';
export function onBinding():void{ws.setState(0,ws.state(0)+1);for(let i=0;i<i32(ws.parameter(0));i++)ws.setState(0,f64(i));}`;
let compiled: Promise<Uint8Array> | undefined;
function bytes(): Promise<Uint8Array> { compiled ??= compileSimV2(program,{ io: 1024,ioBytes: layout.bytes });return compiled; }
function offset(kind: number): number { const region = layout.regions[kind-1];if (region === undefined) throw new Error('Missing fixture region');return 1024+region.offset; }
function rows(fuel = 10000,exclude = false): V2BindingInput[] {
  const common = { self: 0,player: 0,observed: new Set<number>(),enabled: true,due: true,divisor: 6 as const,fuel: 10000,previousTick: 0,currentTick: 6,parameters: [{ name: 'iterations',value: 0 }],fields: [],sample: { atTick: 6,target: 0 } };
  return [{ ...common,identity: 'b',handle: 1,state: [4] },{ ...common,identity: 'a',handle: 2,state: [2],fuel,enabled: !exclude,due: !exclude }];
}
function write(view: DataView,input: readonly V2BindingInput[]): V2FrameAuthority {
  const prepared = prepareV2Observations(layout,6,{ bindings: input,players: [],edges: [],events: [],actions: new Set(),eventKinds: new Set() });
  const authority = writeV2Frame(view,layout,{ lane: 1,module: 1,sequence: 1,tick: 6,due: prepared.due },prepared.counts);prepared.write(view);return authority;
}
async function host(): Promise<ScriptModuleV2> { return new ScriptModuleV2(await bytes(),{ seed: [1,2],initFuel: 10000,ioBytes: layout.bytes,output: [{ offset: offset(3),count: 2,width: 8 }] }); }
test('one generated sim entry visits stable due bindings with private, read-only fuel slices', async () => {
  const code = await bytes(), image = new WebAssembly.Module(new Uint8Array(code));
  expect(WebAssembly.Module.imports(image)).toEqual([{ module: 'env',name: 'memory',kind: 'memory' }]);expect(WebAssembly.Module.exports(image).map(row => row.name)).not.toContain('__v2_fuel');
  const module = await host();let authority: V2FrameAuthority;
  const result = module.step(6,100000,view => { authority = write(view,rows()); },view => {
    validateV2Frame(view,layout,authority);return [view.getFloat64(offset(3),true),view.getFloat64(offset(3)+8,true)];
  });
  expect(result.value).toEqual([3,5]);expect(result.remaining).toBeGreaterThan(0);expect(result.remaining).toBeLessThan(100000);
});
test('a binding slice trap retains its advisory hint and a rewind can exclude only that binding', async () => {
  const module = await host();let published = false;
  expect(() => module.step(6,100000,view => { write(view,rows(1)); },() => { published = true; })).toThrow(WebAssembly.RuntimeError);
  expect(published).toBe(false);expect(new DataView(module.memory.buffer).getUint32(1024+64,true)).toBe(2);
  const result = module.step(6,100000,view => { write(view,rows(1,true)); },view => [view.getFloat64(offset(3),true),view.getFloat64(offset(3)+8,true)]).value;
  expect(result).toEqual([2,5]);
});
test('a module budget cannot be replenished by the intrinsic or by starting another binding', async () => {
  const module = await host();let reads = 0;
  const heavy = rows().map(row => Object.assign(row,{ parameters: [{ name: 'iterations',value: 1000000 }],fuel: 0x7fffffff }));
  expect(() => module.step(6,10000,view => { write(view,heavy); },() => { reads++; })).toThrow(WebAssembly.RuntimeError);expect(reads).toBe(0);
  const bad = `@external("env","__v2_fuel") declare function bad(value:i32):i32;
export function ws_abi():i32{return 2;} export function ws_io():i32{return 1024;}
export function ws_init(lo:i32,hi:i32,fuel:i32):i32{return 0;}
export function ws_step(tick:i32,fuel:i32):i32{return bad(tick);}`;
  await expect(compileScriptV2(bad)).rejects.toThrow('function imports');
  expect(() => compileSimV2(program,{ io: 1024,ioBytes: layout.bytes,sources: { 'program.ts': '' } })).toThrow('Reserved');
});
