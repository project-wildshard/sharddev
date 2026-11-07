import {expect,it} from 'vitest';
import {onFault,type Fault} from '../src/shared/engine/core/faults';
import {Color} from 'three';
import {ClientChannels} from '@wildshard/sharddev/clientChannels';
import {parseClientChannels,type ClientChannelProgram} from '@wildshard/format/clientChannels';
import {installChannelPrograms} from '@wildshard/engine/game/plugin/channelPrograms';
import {PINE_WEATHER_PROGRAMS} from '../src/shards/pine-hollow/generators/weatherChannels';
import {NALATI_WEATHER_PROGRAMS} from '../src/shards/nalati-grasslands/generators/weatherChannels';
import recorded from './fixtures/weather-projections.json' with {type:'json'};

function programRow(id:string,read:string,target:string,path:string[],input?:{owner:string;path:string[]}):ClientChannelProgram{
 const dag=new ClientChannels(id);dag.output('value',dag.read(read));
 const parsed=parseClientChannels([{...dag.build(),numeric:{group:'test',outputs:[{property:'value',target,path,restore:true}],inputs:input===undefined?[]:[{input:read,...input}]}}])[0];
 if(parsed===undefined)throw new Error('Missing test program');return parsed;
}
it('snapshots all inputs before publishing, and restores only declared private fields',()=>{
 const owner={a:1,b:2,held:9};
 const rows=parseClientChannels([{...programRow('first','oldB','root',['a'],{owner:'root',path:['b']}),numeric:{...programRow('first','oldB','root',['a'],{owner:'root',path:['b']}).numeric,group:'test',outputs:[{property:'value',target:'root',path:['a'],restore:true}],restoreOnly:[{property:'value',target:'root',path:['held']}]}},programRow('second','oldA','root',['b'],{owner:'root',path:['a']})]);
 const host=installChannelPrograms(rows,'test',new Map([['root',owner]])),restore=host.capture();
 host.evaluate({time:0,delta:.1,values:{}});expect(owner).toEqual({a:2,b:1,held:9});
 owner.held=7;restore();expect(owner).toEqual({a:1,b:2,held:9});
});
it('skips invalid numeric frames before any output and preserves private recurrence',()=>{
 const owner={a:1,b:2};const host=installChannelPrograms([programRow('first','a','root',['a']),programRow('second','b','root',['b'])],'test',new Map([['root',owner]]));
 const reports:Fault[]=[],stop=onFault(fault=>{reports.push(fault);});
 try{
  expect(()=>host.evaluate({time:0,delta:.1,values:{a:4,b:Number.NaN}})).not.toThrow();expect(owner).toEqual({a:1,b:2});
  expect(reports.map(fault=>[fault.system,fault.verdict])).toEqual([['channels.test','uncaught']]);
  host.evaluate({time:0,delta:.1,values:{a:4,b:5}});expect(owner).toEqual({a:4,b:5});
  host.evaluate({time:0,delta:.1,values:{a:4,b:Number.NaN}});expect(owner).toEqual({a:4,b:5});expect(reports).toHaveLength(1);
 }finally{stop();}
 owner.a=1;owner.b=2;
 expect(()=>host.evaluate({time:0,delta:.1,values:[4,5]})).toThrow();expect(owner).toEqual({a:1,b:2});
 const dag=new ClientChannels('accumulate'),previous=dag.local(0),next=dag.binary('add',previous,dag.read('delta'));dag.retain(previous,next);dag.output('value',next);
 const programs=parseClientChannels([{...dag.build(),numeric:{group:'test',outputs:[{property:'value',target:'root',path:['a']}]}}]);
 const accumulated=installChannelPrograms(programs,'test',new Map([['root',owner]]));
 for(const delta of [.2,.1,.3])accumulated.evaluate({time:0,delta,values:[delta]});expect(owner.a).toBeCloseTo(.6,14);
});
it('keeps the existing capability restrictions and optional private owner semantics',()=>{
 const colour=new Color(.2,.4,.6),colourHost=installChannelPrograms([programRow('colour','green','root',['colour','r'],{owner:'root',path:['colour','g']})],'test',new Map([['root',{colour}]]));colourHost.evaluate({time:0,delta:0,values:{}});expect(colour.r).toBe(.4);
 const good=programRow('good','a','root',['a']);
 expect(()=>installChannelPrograms([good],'missing',new Map())).toThrow();
 expect(()=>installChannelPrograms([good],'test',new Map())).toThrow();
 expect(()=>parseClientChannels([{...good,numeric:{group:'test',outputs:[{property:'value',target:'root',path:['__proto__','value']}]}}])).toThrow();
 expect(()=>installChannelPrograms([programRow('player','a','player',['a'])],'test',new Map([['player',{a:1}]]))).toThrow();
 const optional=parseClientChannels([{...good,numeric:{group:'test',outputs:[{property:'value',target:'root',path:['a'],nullable:true,restore:true}]}}]);
 const host=installChannelPrograms(optional,'test',new Map([['root',null]])),restore=host.capture();host.evaluate({time:0,delta:0,values:[7]});expect(restore).not.toThrow();
});
function fields(values:Readonly<Record<string,number>>):Record<string,number|Record<string,number>>{
 const owner:Record<string,number|Record<string,number>>={};
 for(const [name,value] of Object.entries(values)){const [root,component]=name.split('.');if(root===undefined)throw new Error('Missing field');if(component===undefined)owner[root]=value;else {const previous=owner[root];if(previous===undefined)owner[root]={[component]:value};else if(typeof previous==='number')throw new Error('Mixed field');else previous[component]=value;}}
 return owner;
}
function flat(owner:ReturnType<typeof fields>):Record<string,number>{return Object.fromEntries(Object.entries(owner).flatMap(([name,value])=>typeof value==='number'?[[name,value]]:Object.entries(value).map(([part,number])=>[`${name}.${part}`,number])));}
it('replays Nalati clear, transition, storm, wet and flash against the original look function',()=>{
 for(const sample of recorded.nalati){const look=fields(sample.before),host=installChannelPrograms(NALATI_WEATHER_PROGRAMS,'weather',new Map([['look',look]]));
 host.evaluate({time:0,delta:1/60,values:sample.weather});const after=flat(look);
 for(const [name,expected] of Object.entries(sample.after))expect(after[name],name).toBeCloseTo(expected,13);
 }
});
it('retains every Pine DAG output and entered-scope restoration over the original common vector',()=>{
 const owners=new Map<string,unknown>();
 for(const row of PINE_WEATHER_PROGRAMS)for(const port of [...(row.numeric?.outputs??[]),...(row.numeric?.restoreOnly??[])]){let root=owners.get(port.target);if(root===undefined){root={};owners.set(port.target,root);}if(typeof root!=='object'||root===null)throw new Error('Invalid fixture');Object.assign(root,fields({[port.path.join('.')]:3.25}));}
 const host=installChannelPrograms(PINE_WEATHER_PROGRAMS,'weather',owners),restore=host.capture();
 for(const sample of recorded.pine){
  host.evaluate({time:0,delta:.03,values:sample.values});
  for(const projection of PINE_WEATHER_PROGRAMS)for(const port of projection.numeric?.outputs??[]){const root=owners.get(port.target);if(typeof root!=='object'||root===null)throw new Error('Missing root');let at:unknown=root;for(const key of port.path){if(typeof at!=='object'||at===null)throw new Error('Missing field');at=Reflect.get(at,key);}const expected=Object.entries(sample.outputs).find(([id])=>id===projection.id)?.[1];if(expected===undefined)throw new Error('Missing original output');expect(at,projection.id).toBeCloseTo(expected,13);}
 }
 restore();
 for(const row of PINE_WEATHER_PROGRAMS)for(const port of row.numeric?.outputs.filter(value=>value.restore)??[]){let at:unknown=owners.get(port.target);for(const key of port.path){if(typeof at!=='object'||at===null)throw new Error('Missing field');at=Reflect.get(at,key);}expect(at).toBe(3.25);}
});
