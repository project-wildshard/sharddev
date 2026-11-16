import {expect,test} from 'vitest';
import {compileScriptV2} from './compileScriptV2';
import {v2CoreSource} from '../as/wsV2';
import {ReturnProgram} from '@wildshard/engine/game/population/returnProgram';
import {Scope} from '@wildshard/engine/app/scope';
import {compileReturnProjectionV2} from '../returnProjectionV2';
import {returnProjectionV2Layout} from '@wildshard/format/returnProjectionV2';
import {hashImmutableBytes} from '@wildshard/engine/host/immutable';
import {SCRIPT_V2_REVISIONS} from '@wildshard/format/scriptAdmissionV2';

test('admitted project radial math is finite and close to native geometry',async()=>{
  const layout=returnProjectionV2Layout(2);
  const bytes=await compileScriptV2(`import * as core from './core';
    export function ws_abi():i32{return 2;}export function ws_io():i32{return 0;}
    export function ws_init(lo:i32,hi:i32,fuel:i32):i32{return fuel;}
    export function ws_project(fuel:i32):i32{
      core.beginState();assert(core.beginBinding(0));const radius=core.field(0),yaw=core.field(1);
      core.pageOutput(1,core.radialX(yaw,radius));core.pageOutput(2,core.radialZ(yaw,radius));
      core.endBinding();return fuel;
    }`,{lane:'project',ioBytes:layout.bytes,sources:{'core.ts':v2CoreSource(0)}});
  // The public native boundary also admits a real ABI1 compatibility witness.
  // Keep the original ws_project module and every radial/signed-zero oracle.
  const built=await compileReturnProjectionV2({id:'radialFixture',abi:'1.0',side:'sim',module:`blobs/wasm/${'0'.repeat(64)}.wasm`,
    source:'behaviour/radial.as',binding:{shard:true},pages:1,onFail:'hold',on:['signal'],reads:['field','radial'],commands:['channel'],
    fields:{radius:'radius',yaw:'yaw'},signals:{radial:'radial'},channels:{x:'x',z:'z'},stateVersion:1,state:[],params:{}},
    {fields:new Map([['radius',1],['yaw',2]]),signals:new Map([['radial',1]]),channels:new Map([['x',1],['z',2]])},
    new Map([['behaviour/radial.as',`import {Read,Do,Field,Channel,List} from './generated/radialFixture';
      export function onSignal(signal:i32,value:f64,source:i32):void{
        Read.radial(Read.field(0,Field.yaw),Read.field(0,Field.radius));Do.channel(Channel.x,List.at(0));Do.channel(Channel.z,List.at(1));}`]]),{asLineCeiling:5});
  const owner=new Scope('radial-native'),hash=hashImmutableBytes(bytes);
  try {
  ReturnProgram.lendModules(owner,new Map([[hash,bytes]]),[{id:'radial.projection',module:`blobs/wasm/${hash}.wasm`,side:'sim',abi:2,
    lane:'project',pages:1,ioBytes:layout.bytes,compilerRevision:SCRIPT_V2_REVISIONS.compiler,admissionRevision:SCRIPT_V2_REVISIONS.admission}]);
  const program=ReturnProgram.page({...built.legacy,v2:{artifact:{abi:2,minor:0,compilerRevision:SCRIPT_V2_REVISIONS.compiler,admissionRevision:SCRIPT_V2_REVISIONS.admission,
    hash,lane:'project',pages:1,ioBytes:layout.bytes},fields:['radius','yaw'],signals:['radial'],channels:['x','z'],bytes:''}},owner);
  for(const yaw of [0,-0,Math.PI,-Math.PI,Math.PI/2,600*2.6,-75.8695,-74.7565,-70.3045,1e6,1e12])for(const radius of [0,1,3.6,10000]){
    const actual=program.project('radial',{radius,yaw}),expected={x:Math.sin(yaw)*radius,z:Math.cos(yaw)*radius};
    // G415: AS and native libm may round a transcendental result differently.
    // Geometry uses a tight relative/near-zero tolerance, not bit identity.
    for(const key of ['x','z'] as const)expect(Math.abs((actual[key]??Infinity)-expected[key])).toBeLessThanOrEqual(1e-12*Math.max(1,Math.abs(expected[key])));
  }
  expect(Object.is(program.project('radial',{radius:1,yaw:-0})['x'],-0)).toBe(true);
  } finally { owner.dispose(); }
});
