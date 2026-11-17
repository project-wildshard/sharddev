import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { returnProjectionV2Layout } from '@wildshard/format/returnProjectionV2';
import { compileScript } from '../src/sharddev/bake/compileScript.ts';
import { compileScriptV2 } from '../src/sharddev/bake/compileScriptV2.ts';
import { v2CoreSource } from '../src/sharddev/as/wsV2.ts';

const target = resolve(process.argv[2] ?? '../engine/test/fixtures/wasm');
const ioBytes = returnProjectionV2Layout(2).bytes;
const source = `import * as core from './core';
export function ws_abi():i32{return 2;}export function ws_io():i32{return 0;}
export function ws_init(lo:i32,hi:i32,fuel:i32):i32{return fuel;}
export function ws_project(fuel:i32):i32{
  core.beginState();assert(core.beginBinding(0));
  core.pageOutput(2,core.field(0));core.pageOutput(1,core.parameter(0));
  core.endBinding();return fuel;
}`;

mkdirSync(target, { recursive: true });
const bytes = await compileScriptV2(source, { lane: 'project', ioBytes, sources: { 'core.ts': v2CoreSource(0) } });
writeFileSync(resolve(target, 'return-projection-template.wasm'), bytes);
writeFileSync(resolve(target, 'return-projection-template.json'), `${JSON.stringify({ source, fixture: 'return-projection-template.wasm', ioBytes }, null, 2)}\n`);

const groupRngSource = `import * as core from './sdk/as/wsV2';
export function ws_abi():i32{return 2;}export function ws_io():i32{return 0;}
export function ws_init(lo:i32,hi:i32,fuel:i32):i32{return fuel;}
export function ws_project(fuel:i32):i32{core.beginState();assert(core.beginBinding(0));
  core.setState(0,core.random(1));core.setState(1,core.random(2));
  core.setState(2,core.random(1));core.setState(3,core.random(2));
  if(core.parameter(0)==2)core.pageOutput(99);
  core.endBinding();return fuel;}`;
const groupRngIoBytes = 1216;
writeFileSync(resolve(target, 'script-v2-group-rng.wasm'), await compileScriptV2(groupRngSource, {
  lane: 'project', ioBytes: groupRngIoBytes, sources: { 'sdk/as/wsV2.ts': v2CoreSource(0) },
}));
writeFileSync(resolve(target, 'script-v2-group-rng.json'), `${JSON.stringify({ source: groupRngSource, fixture: 'script-v2-group-rng.wasm', ioBytes: groupRngIoBytes }, null, 2)}\n`);

const groupMembersSource = `import * as core from './sdk/as/wsV2';
export function ws_abi():i32{return 2;}export function ws_io():i32{return 0;}
export function ws_init(lo:i32,hi:i32,fuel:i32):i32{return fuel;}
export function ws_project(fuel:i32):i32{core.beginState();assert(core.beginBinding(0));
  core.setState(0,core.state(0)+1);const signal=i32(core.parameter(0));
  if(signal==4){core.pageOutput(6,3,4);core.pageOutput(2,0,1);core.endBinding();return fuel;}
  core.pageOutput(1,0,core.field(1),signal==3?2:core.field(0));
  core.pageOutput(2,0,signal==2?99:1);core.pageOutput(3,0,1.2,2.3,3.4);
  core.pageOutput(4,0,6,7,8);core.pageOutput(5,0,.5);core.pageOutput(6,3,4);
  core.endBinding();return fuel;}`;
const groupMembersIoBytes = 1408;
writeFileSync(resolve(target, 'script-v2-group-members.wasm'), await compileScriptV2(groupMembersSource, {
  lane: 'project', ioBytes: groupMembersIoBytes, sources: { 'sdk/as/wsV2.ts': v2CoreSource(0) },
}));
writeFileSync(resolve(target, 'script-v2-group-members.json'), `${JSON.stringify({ source: groupMembersSource, fixture: 'script-v2-group-members.wasm', ioBytes: groupMembersIoBytes }, null, 2)}\n`);

const legacyGuests = {
  'script-call-results': `let calls:i32=0;
export function abi_version():i32{return 0;}
export function init(lo:i32,hi:i32):void{calls=lo;}
export function in_ptr():i32{return 16384;}export function in_cap():i32{return 4096;}
export function out_ptr():i32{return 24576;}export function out_cap():i32{return 32;}
export function out_count():i32{return 2;}
export function on_tick():void{
 calls++;let value=load<f64>(16416);if(value==99)unreachable();
 store<f64>(24576,1);store<f64>(24584,1);store<f64>(24592,value);
 store<f64>(24616,3);store<f64>(24624,9);store<f64>(24632,1);store<f64>(24640,load<f64>(16384));
}`,
  'script-lane-results': `let calls:i32=0;
export function abi_version():i32{return 0;}
export function init(lo:i32,hi:i32):void{calls=lo;}
export function in_ptr():i32{return 16384;}export function in_cap():i32{return 4096;}
export function out_ptr():i32{return 24576;}export function out_cap():i32{return 32;}
export function out_count():i32{return 2;}
export function on_tick():void{
 calls++;let value=load<f64>(16400);if(value==99)unreachable();
 store<f64>(24576,1);store<f64>(24584,1);store<f64>(24592,value);
 store<f64>(24616,3);store<f64>(24624,9);store<f64>(24632,1);store<f64>(24640,load<f64>(16384));
}`,
  'script-virgin-memory': `let value:i32=0;
export function abi_version():i32{return 0;}
export function init(lo:i32,hi:i32):void{value=lo;store<i32>(32768,value);}
export function in_ptr():i32{return 16384;}export function in_cap():i32{return 4096;}
export function out_ptr():i32{return 24576;}export function out_cap():i32{return 32;}
export function out_count():i32{return 0;}
export function on_tick():void{value++;store<i32>(32768,value);}`,
};
for (const [name, guest] of Object.entries(legacyGuests)) {
  const maximumPages = name === 'script-virgin-memory' ? 2 : 1;
  writeFileSync(resolve(target, `${name}.wasm`), await compileScript(guest, { maximumPages }));
}
writeFileSync(resolve(target, 'legacy-guests.json'), `${JSON.stringify({ legacyGuests }, null, 2)}\n`);
