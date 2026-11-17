import { expect,test } from 'vitest';
import { compileScript } from './compileScript';
import { scriptSource } from '../test/scriptSource';
import { compileScriptV2 } from './compileScriptV2';
import { compileSimV2 } from '../test/compileSimV2';
import { ScriptModuleV2 } from '@wildshard/engine/script/moduleV2';
import { validateV2FloatColumns } from '@wildshard/format/scriptMemoryV2';

const source = `let transient:i32=5;
export function ws_abi():i32{return 2;} export function ws_io():i32{return 1024;}
export function ws_init(lo:i32,hi:i32,fuel:i32):i32 { transient=7;store<i32>(62000,9);return 0; }
function work(tick:i32):i32 { transient++;store<i32>(62000,load<i32>(62000)+3);
 store<f64>(1040,<f64>(load<i32>(62000)+transient+load<i32>(64000)));
 if(tick==2) unreachable();
 if(tick==3) store<u64>(1040,0x7ff8000000000001);return 0; }
export function ws_step(tick:i32,fuel:i32):i32{return work(tick);}
export function ws_project(fuel:i32):i32{return work(0);}
export function ws_view(dt:f64,alpha:f64,fuel:i32):i32{return 0;}`;
const write = (view: DataView): void => { view.setInt32(64000,11,true); };
const read = (view: DataView): number => view.getFloat64(1040,true);
const options = { seed: [1,2] as const,initFuel: 10000,output: [{ offset: 1040,count: 1,width: 8 as const }] };

test('v2 sim/project rewinds every raw byte and mutable global, even after a trap or re-step', async () => {
  const module = new ScriptModuleV2(await compileScriptV2(source,{ lane: 'sim' }),options);
  expect(module.step(0,10000,write,read).value).toBe(31);
  new Uint8Array(module.memory.buffer).fill(0xa5);
  expect(module.step(0,10000,write,read).value).toBe(31);
  const projection = new ScriptModuleV2(await compileScriptV2(source,{ lane: 'project' }),options);
  new Uint8Array(projection.memory.buffer).fill(0xa5); expect(projection.project(10000,write,read).value).toBe(31);
  expect(() => module.step(2,10000,write,read)).toThrow(WebAssembly.RuntimeError);
  expect(module.step(0,10000,write,read).value).toBe(31);
  expect(() => module.step(0,1,write,read)).toThrow(WebAssembly.RuntimeError);
  expect(module.step(0,10000,write,read).value).toBe(31);
  expect(new DataView(module.memory.buffer).getInt32(62000,true)).toBe(12);
});
test('v2 validates every numeric output before exposing any candidate, including integer-forged NaNs', async () => {
  const module = new ScriptModuleV2(await compileScriptV2(source,{ lane: 'sim' }),options); let reads = 0;
  expect(() => module.step(3,10000,write,view => { reads++;return read(view); })).toThrow('Non-finite v2 output column');
  expect(reads).toBe(0); expect(module.step(0,10000,write,read).value).toBe(31);
  expect(() => module.step(0,10000,write,() => { throw new Error('Domain refusal'); })).toThrow('Domain refusal');
  expect(module.step(0,10000,write,read).value).toBe(31);
});
test('v2 rejects re-entry and preserves the initial image when a host preparation refuses', async () => {
  const module = new ScriptModuleV2(await compileScriptV2(source,{ lane: 'project' }),options);
  expect(() => module.project(10000,() => { module.project(10000,write,read); },read)).toThrow('re-entry');
  expect(() => module.project(10000,view => { view.setInt32(62000,100,true);throw new Error('Prepare refusal'); },read)).toThrow('Prepare refusal');
  expect(module.project(10000,write,read).value).toBe(31);
});
test.each([1,4])('v2 restores sparse, dense and zero images byte-for-byte across %i pages', async pages => {
  for (const kind of ['sparse','dense','zero'] as const) {
    const bytes = await compileScriptV2(kind === 'zero' ? source.replace('store<i32>(62000,9);','') : source,{ lane: 'sim',maximumPages: pages });
    const module = new ScriptModuleV2(bytes,{ ...options,...(kind === 'dense' ? { initialize(view: DataView): void {
      new Uint8Array(view.buffer).fill(0xa5);view.setFloat64(2048,-0,true);view.setBigUint64(2056,0x7ff8000000000001n,true);
    } } : {}) });
    const initial = new Uint8Array(module.memory.buffer).slice(), expected = kind === 'zero' ? 22 : 31;
    if (kind === 'zero') expect(initial.every(value => value === 0)).toBe(true);
    const inspect = (view: DataView): void => {
      expect(new Uint8Array(view.buffer).every((value,index) => value === initial[index])).toBe(true);write(view);
    };
    const step = (): number => module.step(0,10000,inspect,read).value;
    new Uint8Array(module.memory.buffer).fill(0x5a);expect(step()).toBe(expected);
    // Even fixed memories detach their old buffer on an external grow(0).
    const previous = module.memory.buffer;module.memory.grow(0);expect(previous.byteLength).toBe(0);
    expect(step()).toBe(expected);
    expect(() => module.step(2,10000,inspect,read)).toThrow(WebAssembly.RuntimeError);
    expect(step()).toBe(expected);
    expect(() => module.step(0,10000,view => { inspect(view);view.setUint8(view.byteLength-1,99);throw new Error('write refusal'); },read)).toThrow('write refusal');
    expect(step()).toBe(expected);
    expect(() => module.step(0,10000,inspect,view => { new Uint8Array(view.buffer).fill(0x7f);throw new Error('read refusal'); })).toThrow('read refusal');
    expect(step()).toBe(expected);
  }
});
test('host-owned v2 float column bounds use checked arithmetic and preserve both widths and signed zero', () => {
  const view = new DataView(new ArrayBuffer(64)); view.setFloat64(0,-0,true);view.setFloat32(16,Math.fround(1.25),true);
  expect(() => validateV2FloatColumns(view,[{ offset: 0,count: 1,width: 8 },{ offset: 16,count: 1,width: 4 }])).not.toThrow();
  expect(Object.is(view.getFloat64(0,true),-0)).toBe(true);
  for (const column of [{ offset: 56,count: 2,width: 8 as const },{ offset: 0,count: Number.MAX_SAFE_INTEGER,width: 8 as const },{ offset: 1,count: 1,width: 4 as const },{ offset: 0,count: 2,width: 8 as const,stride: 4 }]) expect(() => validateV2FloatColumns(view,[column])).toThrow('outside fixed memory');
  view.setFloat32(16,Infinity,true);expect(() => validateV2FloatColumns(view,[{ offset: 0,count: 2,width: 4,stride: 16 }])).toThrow('Non-finite');
});


test('a v2 compile cannot change either existing compiler version in the same process', async () => {
  const v1 = 'export function ws_abi():i32{return 1;} export function ws_init(lo:i32,hi:i32):void{} export function ws_io():i32{return 16384;} export function ws_handle():i32{return 0;}';
  const before0 = await compileScript(scriptSource()), before1 = await compileScript(v1,{ abi: 1 });
  await compileScriptV2(source,{ lane: 'sim' });
  await compileSimV2(`import * as ws from './sdk/as/wsV2';export function onBinding():void{ws.setState(0,ws.distance(ws.state(0),ws.parameter(0),0,0));}`,{ io: 1024,ioBytes: 4096 });
  expect(await compileScript(scriptSource())).toEqual(before0); expect(await compileScript(v1,{ abi: 1 })).toEqual(before1);
});
