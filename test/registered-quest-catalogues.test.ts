import nativeStoryFixture from './fixtures/pine-native-story.json' with { type: 'json' };
// oxlint-disable-next-line import/no-nodejs-modules -- Check actual admitted immutable product bodies in this Node test.
import {readFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve only members of the admitted product folder.
import {join} from 'node:path';
import {readBuiltShardfile} from '../scripts/build-shardfiles.mjs';
import {hashImmutableBytes,encodeCanonicalJson} from '../src/sdk/immutable';
import {expect,test} from 'vitest';
import * as v from 'valibot';
import {REGISTERED_JSON,validateRegisteredJson} from '@wildshard/format/registeredJson';
import {CarriedQuestSchema,parseCarriedQuest} from '@wildshard/format/questSteps';
import {ContractCatalogueSchema,parseContractCatalogue} from '@wildshard/format/contracts';
import {NativeQuestCompositionSchema,parseNativeQuestComposition,NativeQuestServiceSpotsSchema,parseNativeQuestServiceSpots} from '@wildshard/format/nativeQuestComposition';
import {registeredJsonSchema,namedJsonSchema} from '../src/sharddev/formatJsonSchema';
import {nameBlob} from '../src/sharddev/blobs';
import {emptyShardfile} from '../src/sharddev/author';
import {createShardProduct} from '../src/shared/game/shardfile/shardProduct';
import {fixtureJsonCheck} from './fixtures/productFile';

const roots=[
 {name:'quests/native-story.json',schema:NativeQuestCompositionSchema,parse:parseNativeQuestComposition},
 {name:'quests/native-spots.json',schema:NativeQuestServiceSpotsSchema,parse:parseNativeQuestServiceSpots},
 {name:'quests/contracts.json',schema:ContractCatalogueSchema,parse:parseContractCatalogue},
 {name:'quests/carried.json',schema:CarriedQuestSchema,parse:parseCarriedQuest},
]as const;
type Name=typeof roots[number]['name'];
function body(name:Name):{bytes:Uint8Array;input:unknown;schema:Record<string,unknown>}{
 if(name==='quests/native-story.json'){
  const bytes=new TextEncoder().encode(encodeCanonicalJson(nativeStoryFixture));
  expect(hashImmutableBytes(bytes)).toBe('6ec75c8f3b81778eda9ab75356978ad7cb3f3793053780374ed00bd3ce982f14');
  return {bytes,input:structuredClone(nativeStoryFixture),schema:namedJsonSchema(NativeQuestCompositionSchema)};
 }
 const slug=name==='quests/carried.json'?'nalati-grasslands':'pine-hollow',folder=readBuiltShardfile(process.cwd(),slug);
 const index=v.parse(v.object({files:v.array(v.object({name:v.exactOptional(v.string()),path:v.string(),hash:v.string(),jsonSchema:v.exactOptional(v.unknown())}))}),JSON.parse(readFileSync(join(folder,'shard.json'),'utf8')));
 const file=index.files.find(row=>row.name===name);if(file===undefined)throw new Error('Missing admitted native quest file');
 const bytes=new Uint8Array(readFileSync(join(folder,file.path)));expect(hashImmutableBytes(bytes)).toBe(file.hash);
 const input:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));return{bytes,input,schema:v.parse(v.record(v.string(),v.unknown()),file.jsonSchema)};
}
function duplicate(name:Name,input:unknown):unknown{
 switch(name){
 case'quests/native-story.json':{const row=parseNativeQuestComposition(input),first=row.saved.restore[0];if(first===undefined)throw new Error('No restore role');return{...row,saved:{...row.saved,restore:[...row.saved.restore,first]}};}
 case'quests/native-spots.json':{const row=parseNativeQuestServiceSpots(input),first=row.rows[0];if(first===undefined)throw new Error('No actual native spot');return{...row,rows:[...row.rows,first]};}
 case'quests/contracts.json':{const row=parseContractCatalogue(input),first=row.rows[0];if(first===undefined)throw new Error('No contract');return{...row,rows:[...row.rows,first]};}
 case'quests/carried.json':{const row=parseCarriedQuest(input),state={...row.state};delete state[row.outputs.carrying];return{...row,state};}
 default:throw new Error('Unexpected native quest root');
 }
}
for(const root of roots){
 test(`${root.name} retains its whole native root, original body and unchanged input`,()=>{
  const{input,bytes,schema}=body(root.name),before=structuredClone(input);expect(REGISTERED_JSON[root.name].schema).toBe(root.schema);
  expect(registeredJsonSchema(root.name)).toEqual({...namedJsonSchema(root.schema),$comment:REGISTERED_JSON[root.name].source});
  expect(registeredJsonSchema(root.name)).toEqual({...schema,$comment:REGISTERED_JSON[root.name].source});
  expect(root.parse(input)).toEqual(before);validateRegisteredJson(root.name,input);expect(input).toEqual(before);
  expect(nameBlob(root.name,'json',bytes,{jsonSchema:registeredJsonSchema(root.name)}).bytes).toEqual(bytes);
 });
 test(`${root.name} retains native identity/reference checks beyond its structural schema`,()=>{
  const{input}=body(root.name),invalid=duplicate(root.name,input);expect(()=>root.parse(invalid)).toThrow();expect(()=>validateRegisteredJson(root.name,invalid)).toThrow();
  expect(()=>validateRegisteredJson(root.name,{...v.parse(v.record(v.string(),v.unknown()),input),foreign:true})).toThrow();
 });
 test(`${root.name} rejects missing and foreign defining metadata before payload reads`,async()=>{
  const{bytes}=body(root.name),identity={slug:'quest-contract',name:'Quest',author:'Fixture',revision:1,seed:1};
  for(const jsonSchema of[undefined,{},{$comment:'foreign'}]){
   let reads=0;const product=createShardProduct({...identity,shardfile:emptyShardfile(identity),sections:new Map(),jsonCheck:fixtureJsonCheck,
    files:new Map([[root.name,{hash:'a'.repeat(64),url:'/quest',...(jsonSchema===undefined?{}:{jsonSchema})}]]),read:()=>{reads++;return Promise.resolve(bytes);}});
   await expect(product.json(root.name)).rejects.toThrow('unregistered named JSON is retired');expect(reads).toBe(0);
  }
 });
}
