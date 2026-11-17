import { parseGroupStepV2 } from '@wildshard/format/scriptGroupStepV2';
import { parseReturnProjectionV2, returnProjectionV2Layout } from '@wildshard/format/returnProjectionV2';
import { SCRIPT_V2_REVISIONS } from '@wildshard/format/scriptAdmissionV2';
import { compileReturnProjectionV2 } from '../../src/sharddev/returnProjectionV2';
import { compileScriptV2 } from '../../src/sharddev/bake/compileScriptV2';
import { v2CoreSource } from '../../src/sharddev/as/wsV2';
import { hashImmutableBytes } from '@wildshard/engine/host/immutable';

const groups = parseGroupStepV2({ bank: [{ name: 'count', kind: 'number' }], columns: [], members: 8, signals: ['advance','badOutputs'], actions: [],
  profiles: [{ id: 'second', bank: [{ name: 'awake', kind: 'boolean' }, { name: 'count', kind: 'number' }], columns: [], members: 16, signals: ['advance'], actions: [] }],
  outputs: 1, pages: 1, fuel: 400000 });
const layout = returnProjectionV2Layout(1, 1, 32, groups);
export async function buildGroupFixture(): Promise<{groups: ReturnType<typeof parseGroupStepV2>; layout: ReturnType<typeof returnProjectionV2Layout>; descriptor: Awaited<ReturnType<typeof compileReturnProjectionV2>>['legacy'] & {v2: ReturnType<typeof parseReturnProjectionV2>}; bytes: Uint8Array}> {
  const built = await compileReturnProjectionV2({ id: 'groupFixture', abi: '1.0', side: 'sim', module: `blobs/wasm/${'0'.repeat(64)}.wasm`,
    source: 'behaviour/shared.as', binding: { shard: true }, pages: 1, onFail: 'hold', on: ['signal'], reads: ['field', 'random'], commands: ['channel'],
    fields: { value: 'value' }, signals: { run: 'run' }, channels: { out: 'out' }, stateVersion: 1, state: [], params: {} },
  { fields: new Map([['value', 1]]), signals: new Map([['run', 1]]), channels: new Map([['out', 1]]) },
  new Map([['behaviour/shared.as', `import { Read, Do, Field, Channel } from './generated/groupFixture';
    export function onSignal(signal:i32,value:f64,source:i32):void{Do.channel(Channel.out,Read.field(0,Field.value)+Read.random());}`]]), { asLineCeiling: 5 });
  const bytes = await compileScriptV2(`import * as core from './sdk/as/wsV2';let scratch:i32=0;
    export function ws_abi():i32{return 2;}export function ws_io():i32{return 0;}
    export function ws_init(lo:i32,hi:i32,fuel:i32):i32{return fuel;}
    export function ws_project(fuel:i32):i32{core.beginState();assert(core.beginBinding(0));scratch++;
      if(core.count(2)>0){
        if(core.parameter(2)==0){core.setState(0,core.state(0)+f64(scratch)+core.random(1));
          if(core.parameter(0)==2){core.pageOutput(1,0);core.pageOutput(1,0);}}
        else {core.setState(0,1);core.setState(1,core.state(1)+f64(scratch));}
      }else {core.pageOutput(1,core.field(0)+core.random(1));
        if(core.field(0)==99){const d:usize=128+2*24;store<u32>(d+16,1);store<f64>(usize(load<u32>(d+4)),1);}}

      core.endBinding();return fuel;}`, { lane: 'project', ioBytes: layout.bytes, sources: { 'sdk/as/wsV2.ts': v2CoreSource(0) } });
  const descriptor = { ...built.legacy, v2: parseReturnProjectionV2({ artifact: { abi: 2, minor: 0, compilerRevision: SCRIPT_V2_REVISIONS.compiler,
    admissionRevision: SCRIPT_V2_REVISIONS.admission, hash: hashImmutableBytes(bytes), lane: 'project', pages: 1, ioBytes: layout.bytes },
  fields: ['value'], signals: ['run'], channels: ['out'], bytes: btoa(Array.from(bytes, byte => String.fromCodePoint(byte)).join('')), groups }) };
  return {groups,layout,descriptor,bytes};
}
