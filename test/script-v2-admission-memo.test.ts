import {expect,test} from 'vitest';
import {compileScriptV2} from '../src/sharddev/bake/compileScriptV2';
import {v2CoreSource} from '../src/sharddev/as/wsV2';
import {admitScriptV2} from '@wildshard/format/scriptAdmissionV2';

const project=(output:number):Promise<Uint8Array>=>compileScriptV2(`import * as core from './core';
  export function ws_abi():i32{return 2;}export function ws_io():i32{return 0;}
  export function ws_init(lo:i32,hi:i32,fuel:i32):i32{return fuel;}
  export function ws_project(fuel:i32):i32{core.beginState();assert(core.beginBinding(0));core.pageOutput(1,core.field(0)+${String(output)});core.endBinding();return fuel;}`,
{lane:'project',ioBytes:1024,sources:{'core.ts':v2CoreSource(0)}});

test('T10: one admission serves every caller of the same bytes and I/O, with or without a lane, and a wrong lane still refuses',async()=>{
  const bytes=await project(1),fresh=await project(2);
  const contract=admitScriptV2(bytes,{lane:'project',ioBytes:1024});
  expect(admitScriptV2(bytes.slice(),{ioBytes:1024})).toEqual(contract);
  expect(admitScriptV2(bytes,{lane:'project',ioBytes:1024})).toEqual(contract);
  expect(()=>admitScriptV2(bytes,{lane:'sim',ioBytes:1024})).toThrow('V2 lane has missing or extra work entries');
  expect(()=>admitScriptV2(fresh,{lane:'sim',ioBytes:1024})).toThrow('V2 lane has missing or extra work entries');
  // a lane-less first admission answers a later lane request as the lane's own admission would
  const laneless=admitScriptV2(fresh,{ioBytes:1024});
  expect(laneless.lane).toBe('project');expect(admitScriptV2(fresh,{lane:'project',ioBytes:1024})).toEqual(laneless);
  // the default I/O is 656 bytes, cached or not
  expect(admitScriptV2(bytes)).toEqual(admitScriptV2(bytes,{ioBytes:656}));
  expect(admitScriptV2(bytes).ioBytes).toBe(656);
  // a caller's copy is its own
  const mine=admitScriptV2(bytes,{ioBytes:1024});mine.fuel=-1;
  expect(admitScriptV2(bytes,{ioBytes:1024}).fuel).toBe(contract.fuel);
});
