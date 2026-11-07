// @vitest-environment happy-dom
import {expect,test} from 'vitest';
import {QuestPanelCatalogueSchema,parseQuestPanelCatalogue,parsePanelDefinition} from '@wildshard/format/panelTemplate';
import {registeredJsonContract,validateRegisteredJson} from '@wildshard/format/registeredJson';
import {registeredJsonSchema,namedJsonSchema} from '../src/sharddev/formatJsonSchema';
import {nameBlob} from '../src/sharddev/blobs';
import {emptyShardfile} from '../src/sharddev/author';
import {createShardProduct} from '../src/shared/game/shardfile/shardProduct';
import {readDataPanels} from '../src/client/game/ui/dataPanels';
import {PINE_PANELS} from '../src/shards/pine-hollow/generators/panels';
import horsePanel from '../src/shards/nalati-grasslands/data/namePanel.json' with {type:'json'};
import {fixtureJsonCheck} from './fixtures/productFile';

const name='quests/panels.json';
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
const panel={frame:{tag:'div',text:'Ready'},lifetime:'persistent',showClass:'shown'};
for(const [user,value]of [['pine',PINE_PANELS],['nalati',{name:horsePanel}]]as const){
 test(`${user} catalogue retains all native panels, input and encoded bytes`,async()=>{
  const before=structuredClone(value),bytes=encode(value),parsed=parseQuestPanelCatalogue(value);
  expect(parsed).toEqual(Object.fromEntries(Object.entries(value).map(([key,row])=>[key,parsePanelDefinition(row)])));
  expect(value).toEqual(before);validateRegisteredJson(name,value);expect(value).toEqual(before);
  expect(registeredJsonContract(name).schema).toBe(QuestPanelCatalogueSchema);
  expect(registeredJsonSchema(name)).toEqual({...namedJsonSchema(QuestPanelCatalogueSchema),$comment:'@wildshard/format/panelTemplate#QuestPanelCatalogueSchema'});
  expect(nameBlob(name,'json',bytes,{jsonSchema:registeredJsonSchema(name)}).bytes).toEqual(bytes);
  const reads:string[]=[];
  expect(await readDataPanels({file:key=>{reads.push(key);return Promise.resolve(bytes);}})).toEqual(parsed);
  expect(reads).toEqual([name]);
 });
}
test('catalogue outer refusal precedes per-panel admission at the original sixteen-panel boundary',()=>{
 const sixteen=Object.fromEntries(Array.from({length:16},(_,i)=>[`panel${i}`,panel]));
 expect(Object.keys(parseQuestPanelCatalogue(sixteen))).toHaveLength(16);
 const seventeen={bad:{foreign:true},...sixteen};
 for(const input of[null,[],0,'panels',seventeen])expect(()=>parseQuestPanelCatalogue(input)).toThrow('Invalid named panels');
});
test('catalogue admission retains native action, recursion and transient-frame refusals',()=>{
 for(const value of[{...panel,lifetime:'open',transient:{milliseconds:10,flags:[]}},{frame:{tag:'script'},lifetime:'open'},
  {...panel,frame:{tag:'button',action:{id:'constructor.call'}}},{...panel,frame:{tag:'button',action:{id:'__proto__.call'}}},
  {...panel,body:Array.from({length:257},()=>({tag:'span'}))}]){
  expect(()=>parseQuestPanelCatalogue({one:value})).toThrow();expect(()=>validateRegisteredJson(name,{one:value})).toThrow();
 }
 let frame:unknown={tag:'span'};for(let i=0;i<35;i++)frame={tag:'div',children:[frame]};
 expect(()=>parseQuestPanelCatalogue({deep:{frame,lifetime:'open'}})).toThrow('Panel template exceeds its bound');
 expect(()=>parseQuestPanelCatalogue({heavy:{...panel,foreign:Array.from({length:8193},()=>0)}})).toThrow('Panel template exceeds its bound');
});
test('missing or foreign panel defining metadata refuses before any payload read',async()=>{
 const identity={slug:'panels',name:'Panels',author:'Test',revision:1,seed:1};
 for(const jsonSchema of[undefined,{},{$comment:'foreign'}]){
  let reads=0;const product=createShardProduct({...identity,shardfile:emptyShardfile(identity),sections:new Map(),jsonCheck:fixtureJsonCheck,
   files:new Map([[name,{hash:'a'.repeat(64),url:'/panels',...(jsonSchema===undefined?{}:{jsonSchema})}]]),read:()=>{reads++;return Promise.resolve(encode({one:panel}));}});
  await expect(product.json(name)).rejects.toThrow('unregistered named JSON is retired');expect(reads).toBe(0);
 }
});
