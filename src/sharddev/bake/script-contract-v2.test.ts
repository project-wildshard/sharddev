import { expect, test } from 'vitest';
import * as v from 'valibot';
import { compileScriptV2 } from './compileScriptV2';
import { admitScriptContract, ScriptContractSchema } from '@wildshard/format/scriptContract';
import { assetCost } from '@wildshard/format/product';
import { SCRIPT_V2_REVISIONS } from '@wildshard/format/scriptAdmissionV2';

const head = 'export function ws_abi():i32{return 2;} export function ws_io():i32{return 1024;} export function ws_init(lo:i32,hi:i32,fuel:i32):i32{return 0;}\n';
const lanes = {
  sim: 'export function ws_step(dtick:i32,fuel:i32):i32{store<f64>(1024,dtick);return 0;}',
  project: 'export function ws_project(fuel:i32):i32{store<f64>(1024,1.0);return 0;}',
  view: 'export function ws_view(dt:f64,alpha:f64,fuel:i32):i32{store<f64>(1024,dt);return 0;}',
} as const;
const contract = (lane: 'sim' | 'project' | 'view', over: Record<string, unknown> = {}): unknown =>
  ({ abi: 2, lane, pages: 1, ioBytes: 4096, compilerRevision: SCRIPT_V2_REVISIONS.compiler, admissionRevision: SCRIPT_V2_REVISIONS.admission, ...over });

test('an abi 2 contract admits each lane through admitScriptV2 on a copy, before anything instantiates it', async () => {
  for (const lane of ['sim', 'project', 'view'] as const) {
    const bytes = await compileScriptV2(head + lanes[lane], { lane, ioBytes: 4096 }), before = Uint8Array.from(bytes);
    const admitted = admitScriptContract(bytes, v.parse(ScriptContractSchema, contract(lane)));
    expect('lane' in admitted && admitted.lane).toBe(lane);
    expect(bytes).toEqual(before);
    expect(assetCost('wasm', bytes, v.parse(ScriptContractSchema, contract(lane))).decoded).toBe(bytes.length);
  }
});

test('an abi 2 contract refuses another lane, other pages, unpinned revisions and I/O past its pages', async () => {
  const bytes = await compileScriptV2(head + lanes.view, { lane: 'view', ioBytes: 4096 });
  expect(() => admitScriptContract(bytes, v.parse(ScriptContractSchema, contract('sim')))).toThrow();
  expect(() => admitScriptContract(bytes, v.parse(ScriptContractSchema, contract('view', { pages: 2 })))).toThrow('fixed pages');
  expect(() => v.parse(ScriptContractSchema, contract('view', { compilerRevision: SCRIPT_V2_REVISIONS.compiler + 1 }))).toThrow();
  expect(() => v.parse(ScriptContractSchema, contract('view', { admissionRevision: SCRIPT_V2_REVISIONS.admission + 1 }))).toThrow();
  expect(() => admitScriptContract(bytes, v.parse(ScriptContractSchema, contract('view', { ioBytes: 65536 + 16 })))).toThrow('exceeds its pages');
});

test('the v0 and v1 contract rows are unchanged', () => {
  expect(v.parse(ScriptContractSchema, { abi: 0 })).toEqual({ abi: 0 });
  expect(v.parse(ScriptContractSchema, { abi: 1, pages: 1 })).toEqual({ abi: 1, pages: 1 });
  expect(() => v.parse(ScriptContractSchema, { abi: 1, pages: 1, lane: 'view' })).toThrow();
  expect(() => v.parse(ScriptContractSchema, { abi: 2, pages: 1 })).toThrow();
});
