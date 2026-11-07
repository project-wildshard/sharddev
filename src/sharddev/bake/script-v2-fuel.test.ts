import { expect,test } from 'vitest';
import binaryen from 'binaryen';
import { instrumentV2Fuel } from './v2Fuel';
import { instrumentV2Finite } from './v2Finite';
import { inspectV2Fuel } from '@wildshard/format/scriptFuelV2';

function wasm(step: string, extra = '', init = '(i32.const 0)', view = '(i32.const 0)'): Uint8Array {
  const module = binaryen.parseText(`(module (import "env" "memory" (memory 1 1)) ${extra}
    (func $abi (export "ws_abi") (result i32) (i32.const 2))
    (func (export "ws_io") (result i32) (i32.const 1024))
    (func $init (export "ws_init") (param i32 i32 i32) (result i32) ${init})
    (func $step (export "ws_step") (param i32 i32) (result i32) ${step})
    (func (export "ws_project") (param i32) (result i32) (i32.const 0))
    (func (export "ws_view") (param f64 f64 i32) (result i32) ${view}))`);
  try { return module.emitBinary(); } finally { module.dispose(); }
}
const meter = (input: Uint8Array,lane: 'sim' | 'view' = 'sim'): Uint8Array => instrumentV2Fuel(input,{ lane });
async function instance(bytes: Uint8Array): Promise<WebAssembly.Instance> {
  const memory = new WebAssembly.Memory({ initial: 1,maximum: 1 });
  return (await WebAssembly.instantiate(new Uint8Array(bytes),{ env: { memory } })).instance;
}
const callable = (value: unknown): value is (...args: number[]) => unknown => typeof value === 'function';
function call(guest: WebAssembly.Instance,name: string,...args: number[]): unknown {
  const method = guest.exports[name]; if (!callable(method)) throw new Error('Missing fixture entry'); return method(...args);
}
function mutate(bytes: Uint8Array,change: (module: binaryen.Module) => void): Uint8Array {
  const module = binaryen.readBinary(bytes); try { change(module); return module.emitBinary(); } finally { module.dispose(); }
}
test('v2 charges instruction counts in an internal global, returns the remainder and retains snapshots', async () => {
  const bytes = meter(wasm('(global.set $saved (i32.add (global.get $saved) (i32.const 1))) (i32.const 42)', '(global $saved (mut i32) (i32.const 0))'));
  const checked = inspectV2Fuel(bytes), guest = await instance(bytes);
  expect(checked.globals).toEqual(['__state_0']); expect(checked.pages).toBe(1);
  expect(call(guest,'ws_step',0,100)).toBe(94); expect(call(guest,'ws_step',0,100)).toBe(94);
  const saved = guest.exports['__state_0']; expect(saved instanceof WebAssembly.Global && saved.value).toBe(2);
  expect(WebAssembly.Module.imports(await WebAssembly.compile(new Uint8Array(bytes)))).toEqual([{ module: 'env',name: 'memory',kind: 'memory' }]);
  expect(WebAssembly.Module.exports(await WebAssembly.compile(new Uint8Array(bytes))).some(value => value.kind === 'global' && value.name !== '__state_0')).toBe(false);
  expect(() => call(guest,'ws_step',0,-1)).toThrow(WebAssembly.RuntimeError);
  expect(() => call(guest,'ws_step',0,5)).toThrow(WebAssembly.RuntimeError);
});
test('v2 meters each repeated block and all fueled entries, including init and view', async () => {
  const loop = '(loop $again (br $again)) (i32.const 0)';
  const cases = [
    { bytes: meter(wasm(loop)),name: 'ws_step',args: [0,80] },
    { bytes: meter(wasm('(i32.const 0)','',loop)),name: 'ws_init',args: [0,0,80] },
    { bytes: meter(wasm('(i32.const 0)','','(i32.const 0)',loop),'view'),name: 'ws_view',args: [1/60,0.5,80] },
  ];
  for (const row of cases) {
    const guest = await instance(row.bytes); expect(() => call(guest,row.name,...row.args)).toThrow(WebAssembly.RuntimeError);
    expect(guest.exports[row.name === 'ws_view' ? 'ws_step' : 'ws_view']).toBeUndefined();
  }
});
test('v2 preserves finite guard control flow while metering nested branches and helpers', async () => {
  const bytes = meter(instrumentV2Finite(wasm(`(if (local.get 0) (then (f64.store (i32.const 0) (call $value)))) (i32.const 0)`,
    '(func $value (result f64) (f64.const 2))'))), guest = await instance(bytes);
  const skipped = call(guest,'ws_step',0,300), taken = call(guest,'ws_step',1,300);
  expect(typeof skipped === 'number' && typeof taken === 'number' && taken < skipped).toBe(true);
});
test('v2 refuses cyclic/deep calls and even an acyclic guest entry refill before execution', () => {
  expect(() => meter(wasm('(call $init (i32.const 0) (i32.const 0) (i32.const 100))'))).toThrow('Guest calls a v2 entry');
  expect(() => meter(wasm('(call $a)', '(func $a (result i32) (call $b)) (func $b (result i32) (call $a))'))).toThrow('cycle');
  const chain = (length: number): string => Array.from({ length },(_,i) => `(func $f${i} (result i32) ${i+1 === length ? '(i32.const 0)' : `(call $f${i+1})`})`).join(' ');
  expect(() => meter(wasm('(call $f0)',chain(63)))).toThrow('depth exceeds 64');
  expect(() => meter(wasm('(call $f0)',chain(62)))).not.toThrow();
});
test('v2 byte verification rejects forged charges, extra fuel writes, exposed fuel and wrapper bypasses', () => {
  const original = meter(wasm('(i32.const 0)'));
  const fuel = inspectV2Fuel(original).fuel;
  // Mutations below operate on bytes, independently of the instrumenter.
  const text = binaryen.readBinary(original); let wat: string, name: string; try { wat = text.emitText(); name = binaryen.getGlobalInfo(text.getGlobalByIndex(fuel)).name; } finally { text.dispose(); }
  const altered = (source: string): Uint8Array => { const module = binaryen.parseText(source); try { return module.emitBinary(); } finally { module.dispose(); } };
  const underpriced = wat.replace(/(\(i32.sub\s+\(global.get [^)]*\)\s+\(i32.const )2(\))/u,(_,a: string,b: string) => `${a}1${b}`);
  expect(underpriced).not.toBe(wat); expect(() => inspectV2Fuel(altered(underpriced))).toThrow('basic block');
  expect(() => inspectV2Fuel(altered(wat.replace('(i32.sub','(i32.add')))).toThrow();
  expect(() => inspectV2Fuel(mutate(original,module => { module.addGlobalExport(binaryen.getGlobalInfo(module.getGlobalByIndex(fuel)).name,'leaked'); }))).toThrow();
  expect(() => inspectV2Fuel(altered(wat.replace('(drop','(return')))).toThrow();
  expect(() => inspectV2Fuel(altered(wat.replace('(drop',`(global.set $${name} (i32.const 100)) (drop`)))).toThrow();
});


test('calls to admitted constant getters pay for the getter body as well as the call', async () => {
  const bytes = meter(wasm('(i32.add (call $abi) (call $abi))')), guest = await instance(bytes);
  expect(call(guest,'ws_step',0,100)).toBe(92);
});
