import { expect, test } from 'vitest';
import { admitScript } from '@wildshard/format/scriptAdmission';
import { compileScript } from '@wildshard/sdk/compileScript';
import { scriptSource } from '../test/scriptSource';

const source = (body = 'return 0;', extra = '') => `${extra}
export function ws_abi():i32 { return 1; }
export function ws_init(lo:i32,hi:i32):void {}
export function ws_io():i32 { return 16384; }
export function ws_handle():i32 { ${body} }`;

test('v1 admits real bounded metered modules without changing v0 admission', async () => {
  const bytes = await compileScript(source(), { abi: 1 });
  expect(admitScript(bytes, 1)).toMatchObject({ initialPages: 1, maximumPages: 1 });
  expect(() => admitScript(bytes)).toThrow('ABI export');
  const old = await compileScript(scriptSource());
  expect(admitScript(old)).toMatchObject({ initialPages: 1, maximumPages: 64 });
  expect(() => admitScript(old, 1)).toThrow('fixed');
});

test('v1 accepts only its deterministic read and list imports', async () => {
  const imports = `@external("env","ws_read") declare function read(op:i32,a:f64,b:f64):f64;
@external("env","ws_list") declare function list(op:i32,a:f64,b:f64,out:i32,cap:i32):i32;`;
  const bytes = await compileScript(source('return i32(read(1,1,0))+list(1,1,0,32768,4);', imports), { abi: 1 });
  expect(admitScript(bytes, 1).functions).toBeGreaterThan(0);
  const foreign = await compileScript(source('return query(1,0,0);', '@external("env","query") declare function query(a:i32,b:i32,c:i32):i32;'), { abi: 1 });
  expect(() => admitScript(foreign, 1)).toThrow('Import signature');
});

test('v1 refuses grow, wrong signatures, and memory above four pages', async () => {
  const growing = await compileScript(source('return memory.grow(0);'), { abi: 1 });
  expect(() => admitScript(growing, 1)).toThrow('memory.grow');
  const wrong = await compileScript(source().replace('ws_handle():i32', 'ws_handle(x:i32):i32'), { abi: 1 });
  expect(() => admitScript(wrong, 1)).toThrow('ws_handle');
  const four = await compileScript(source(), { abi: 1, maximumPages: 4 });
  expect(admitScript(four, 1)).toMatchObject({ initialPages: 4, maximumPages: 4 });
  await expect(compileScript(source(), { abi: 1, maximumPages: 5 })).rejects.toThrow('1..4');
});
