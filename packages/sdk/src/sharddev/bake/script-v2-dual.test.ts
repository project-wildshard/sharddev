import { expect,test } from 'vitest';
import { compileDualScriptV2 } from '../test/compileDualScriptV2';
import { compileScript } from './compileScript';
import { admitScriptContract } from '@wildshard/format/scriptContract';
import { admitScriptV2 } from '@wildshard/format/scriptAdmissionV2';
import { hashImmutableBytes } from '../immutable';

const author = 'export function advance(value:f64):f64{return value+1;}', sources = { 'author.ts': author };
const legacy = `import {advance} from './author';export function ws_abi():i32{return 1;}export function ws_io():i32{return 16384;}export function ws_init(lo:i32,hi:i32):void{}export function ws_handle():i32{store<f64>(16384,advance(7));return 0;}`;
const candidate = `import {advance} from './author';export function ws_abi():i32{return 2;}export function ws_io():i32{return 1024;}export function ws_init(lo:i32,hi:i32,fuel:i32):i32{return 0;}export function ws_step(tick:i32,fuel:i32):i32{store<f64>(1024,advance(f64(tick)));return 0;}`;
const input = () => ({ authored: new Map(Object.entries(sources)),legacy: { source: legacy },candidate: { source: candidate,lane: 'sim' as const,ioBytes: 656 },pages: 1 });

test('one immutable author closure compiles and admits under both ABIs without changing legacy bytes', async () => {
  const before = await compileScript(legacy,{ abi: 1,maximumPages: 1,sources }), pair = await compileDualScriptV2(input());
  expect(pair.legacy.bytes).toEqual(before);expect(pair.legacy.hash).toBe(hashImmutableBytes(before));
  expect(() => admitScriptContract(pair.legacy.bytes,{ abi: 1,pages: 1 })).not.toThrow();
  expect(admitScriptV2(pair.candidate.bytes,{ lane: 'sim',ioBytes: 656 }).lane).toBe('sim');
  expect(pair.candidate.artifact).toMatchObject({ abi: 2,compilerRevision: 1,admissionRevision: 1,hash: hashImmutableBytes(pair.candidate.bytes) });
  expect(pair.authors).toEqual([{ path: 'author.ts',hash: hashImmutableBytes(new TextEncoder().encode(author)) }]);
  expect(await compileScript(legacy,{ abi: 1,maximumPages: 1,sources })).toEqual(before);
});
test('neither wrapper can replace or silently omit any authored input', async () => {
  const base = input();
  await expect(compileDualScriptV2({ ...base,candidate: { ...base.candidate,sources: { 'author.ts': 'different body' } } })).rejects.toThrow('overrides');
  await expect(compileDualScriptV2({ ...base,authored: new Map([...base.authored,['missing.ts','export function unused():void{}']]) })).rejects.toThrow('omits authored source');
  await expect(compileDualScriptV2({ ...base,legacy: { source: legacy.replace("'./author'","'../author'") } })).rejects.toThrow('escapes');
});
test('a rejected candidate never returns a publishable pair', async () => {
  const base = input();
  await expect(compileDualScriptV2({ ...base,candidate: { ...base.candidate,source: candidate.replace('return 2;','return 1;') } })).rejects.toThrow();
});
