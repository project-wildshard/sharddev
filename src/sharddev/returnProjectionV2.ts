/** Dual compile stateless AS numeric rules. The candidate uses
 * ws_project and the defining v2 SDK, while the public v1 artifact is retained.
 * With `groups`, the same programme also serves group steps (ReturnProgram.prepareGroup): the selected project entry
 * exports groupStep() beside onSignal, and a call that lends group state runs it.
 * `binary` is the exact selected module for file producers; `witness` retains the original ABI1 bytes for binary sidecars. */
import { parseDecisionScripts,scriptV1Identifier } from '@wildshard/format/decisionScripts';
import { parseReturnProjectionV2,returnProjectionV2Layout,type ReturnProjectionV2Rows } from '@wildshard/format/returnProjectionV2';
import type { GroupStepRowsV2 } from '@wildshard/format/scriptGroupStepV2';
import { compileDecisionScripts,captureDecisionSources,type DecisionBuildOptions } from './buildDecisionScripts';
import type { DecisionRegistries } from './decisionBindingMap';
import { compileScriptV2 } from './bake/compileScriptV2';
import { SCRIPT_V2_REVISIONS } from '@wildshard/format/scriptAdmissionV2';
import { v2CoreSource } from './as/wsV2';
import { hashImmutableBytes } from './immutable';
import { decisionBindingsPath } from './decisionScriptBindings';

export async function compileReturnProjectionV2(input:unknown,registries:DecisionRegistries,authored:ReadonlyMap<string,string>,options:DecisionBuildOptions & {readonly projectSource?:string;readonly outputCapacity?:number;readonly worldActions?:boolean;readonly additional?:{readonly fields:readonly string[];readonly signals:readonly string[];readonly channels:readonly string[]};readonly capture?:{readonly fields:readonly string[];readonly channels:readonly string[]};readonly groups?:{readonly rows:GroupStepRowsV2;readonly helpers:Readonly<Record<string,string>>}}):Promise<{
  readonly legacy:{readonly script:ReturnType<typeof parseDecisionScripts>[number];readonly bytes:string};readonly candidate:ReturnProjectionV2Rows;readonly binary:Uint8Array;readonly witness:Uint8Array;
}> {
  const row=parseDecisionScripts([input])[0];
  if(row?.side!=='sim'||row.state.length>0||row.tick!==null||row.timers.length>0||row.on.length!==1||row.on[0]!=='signal'
    ||row.reads.some(read=>read!=='field'&&read!=='random'&&read!=='radial')||row.commands.some(command=>command!=='channel')||Object.keys(row.params).length>0)throw new Error('Not a numeric return projection');
  const old=await compileDecisionScripts([row],registries,authored,{...options,singleSignal:true}),script=old.rows[0],blob=old.blobs[0];
  if(script===undefined||blob===undefined)throw new Error('Missing legacy projection');
  // An additive project entry is admitted through the original source budget,
  // handler and captured-import checks; it cannot replace the ABI1 witness.
  const selected=options.projectSource??row.source;
  const captured=await captureDecisionSources(authored,options);
  const additional=options.additional;
  const projectionNames=(kind:'fields'|'signals'|'channels'):string[]=>{
    const base=Object.values(row[kind]).sort(),extra=[...(additional?.[kind]??[])];
    if(extra.some((name,index)=>name<=(base.at(-1)??'')||index>0&&(extra[index-1]??'')>=name)
      ||new Set([...Object.keys(row[kind]),...extra].map(scriptV1Identifier)).size!==Object.keys(row[kind]).length+extra.length)throw new Error('Invalid additional projection names');
    return [...base,...extra];
  };
  const fields=projectionNames('fields'),signals=projectionNames('signals'),channels=projectionNames('channels');
  const groups=options.groups,layout=returnProjectionV2Layout(fields.length,row.pages,options.outputCapacity,groups?.rows),path=decisionBindingsPath(row);
  const lines=["import * as core from '../../sdk/as/wsV2';"];
  for(const [kind,namespace,names]of [['fields','Field',fields],['signals','Signal',signals],['channels','Channel',channels]] as const){
    lines.push(`export namespace ${namespace}{`,...[...Object.entries(row[kind]),...(additional?.[kind]??[]).map(name=>[name,name])].map(([alias='',name=''])=>`export const ${scriptV1Identifier(alias)}:i32=${names.indexOf(name)+1};`),'}');
  }
  const capture=options.capture;
  const capturedIds=(kind:'fields'|'channels'):number[]=>{const names=capture?.[kind]??[];if(new Set(names).size!==names.length||names.some(name=>!Object.hasOwn(row[kind],name)))throw new Error('Undeclared projection capture');return names.map(name=>(kind==='fields'?fields:channels).indexOf(row[kind][name]??'')+1);};
  const cf=capturedIds('fields'),co=capturedIds('channels');
  if(capture!==undefined)lines.push(`let capturing:bool=false;const CF:usize=memory.data(${cf.length*16},8),CO:usize=memory.data(${co.length*16},8);`);
  lines.push(`export class Read{
    static field(actor:i32,id:i32):f64{assert(actor>=0&&actor<=8&&id>0&&id<=${fields.length});${capture===undefined?'':`if(actor==0)switch(id){${cf.map((id,i)=>`case ${id}:if(load<u32>(CF+${i*16}))return load<f64>(CF+${i*16+8});break;`).join('')}}`}return core.field(actor*${fields.length}+id-1);}
    static random():f64{return core.random(1);}
    static radial(yaw:f64,radius:f64):i32{assert(radius>=0&&radius<=10000);radialX=core.radialX(yaw,radius);radialZ=core.radialZ(yaw,radius);return 2;}
    ${capture===undefined?'':`static captureField(id:i32,value:f64):void{switch(id){${cf.map((id,i)=>`case ${id}:store<f64>(CF+${i*16+8},value);store<u32>(CF+${i*16},1);return;`).join('')}default:unreachable();}}`}
  }
  let radialX:f64=0,radialZ:f64=0;
  export class List{static at(index:i32):f64{assert(index==0||index==1);return index==0?radialX:radialZ;}}
  export class Do{
    static channel(id:i32,value:f64):void{assert(id>0&&id<=${channels.length});${capture===undefined?'':`if(capturing){switch(id){${co.map((id,i)=>`case ${id}:store<f64>(CO+${i*16+8},value);store<u32>(CO+${i*16},1);return;`).join('')}default:unreachable();}}`}core.pageOutput(id,value);}
    ${capture===undefined?'':`static capture():void{capturing=true;for(let i:i32=0;i<${cf.length};i++)store<u32>(CF+usize(i)*16,0);for(let i:i32=0;i<${co.length};i++)store<u32>(CO+usize(i)*16,0);}
      static captured(id:i32,fallback:f64):f64{switch(id){${co.map((id,i)=>`case ${id}:return load<u32>(CO+${i*16})?load<f64>(CO+${i*16+8}):fallback;`).join('')}default:unreachable();}return fallback;}
      static release():void{capturing=false;}`}
    ${options.worldActions===true?`static ignite(target:i32,x:f64,z:f64):void{core.ignite(target,x,z);}
    static dismount(target:i32,thrown:bool):void{core.dismount(target,thrown);}
    static taming(op:i32,target:i32,a:f64=0,b:f64=0,c:f64=0,d:f64=0,e:f64=0,f:f64=0):void{core.taming(op,target,a,b,c,d,e,f);}`:''}
  }`);
  // The legacy compiler has already checked the entire source budget and the
  // selected entry's captured import closure. Supply only admitted author texts.
  const sources:Record<string,string>={[path]:lines.join('\n'),'sdk/as/wsV2.ts':v2CoreSource(0)};
  if(groups!==undefined)for(const [name,text]of Object.entries(groups.helpers)){
    if(!/^sdk\/as\/group(?:Bank|Step)V2\.[a-z][a-z0-9-]*\.ts$/u.test(name)||Object.hasOwn(sources,name))throw new Error('Invalid group helper source');sources[name]=text;
  }
  // a group program's sources may import its helpers and the v2 core the module already carries
  Object.assign(sources,captured.entry({...row,source:selected},path,groups===undefined?undefined:new Set([...Object.keys(groups.helpers),'sdk/as/wsV2.ts'])));
  const source=`import {onSignal${groups===undefined?'':',groupStep'}} from './${selected.slice(0,-3)}';
    import * as core from './sdk/as/wsV2';
    export function ws_abi():i32{return 2;}
    export function ws_io():i32{return 0;}
    export function ws_init(lo:i32,hi:i32,fuel:i32):i32{return fuel;}
    export function ws_project(fuel:i32):i32{core.beginState();assert(core.beginBinding(0));${groups===undefined?'':'if(core.count(2)>0)groupStep();else '}onSignal(i32(core.parameter(0)),0,0);core.endBinding();return fuel;}`;
  const bytes=await compileScriptV2(source,{maximumPages:row.pages,ioBytes:layout.bytes,lane:'project',sources,...(options.compileMemo===undefined?{}:{compileMemo:options.compileMemo})});
  const candidate=parseReturnProjectionV2({artifact:{abi:2,minor:0,compilerRevision:SCRIPT_V2_REVISIONS.compiler,admissionRevision:SCRIPT_V2_REVISIONS.admission,
    hash:hashImmutableBytes(bytes),lane:'project',pages:row.pages,ioBytes:layout.bytes},fields,signals,channels,...(additional===undefined?{}:{additional}),...(options.outputCapacity===undefined?{}:{outputCapacity:options.outputCapacity}),bytes:btoa(Array.from(bytes,byte=>String.fromCodePoint(byte)).join('')),...(groups===undefined?{}:{groups:groups.rows})});
  return {legacy:{script,bytes:btoa(Array.from(blob.bytes,byte=>String.fromCodePoint(byte)).join(''))},candidate,binary:bytes,witness:blob.bytes};
}
