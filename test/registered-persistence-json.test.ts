import {expect,test} from 'vitest';
import {AdventurePersistenceSchema} from '@wildshard/format/namedJsonContracts';
import {registeredJsonContract,validateRegisteredJson} from '@wildshard/format/registeredJson';
import {registeredJsonSchema,namedJsonSchema} from '../src/sharddev/formatJsonSchema';
import {nameBlob} from '../src/sharddev/blobs';
import {emptyShardfile} from '../src/sharddev/author';
import {createShardProduct} from '../src/shared/game/shardfile/shardProduct';
import {fixtureJsonCheck} from './fixtures/productFile';
import pine from '../src/shards/pine-hollow/data/persistence.json' with {type:'json'};
import {nalatiPersistenceRows} from '../src/shards/nalati-grasslands/generators/persistence';

const name='quests/persistence.json';
const source='@wildshard/format/namedJsonContracts#AdventurePersistenceSchema';
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));

test.each([{label:'Pine',rows:pine},{label:'Nalati',rows:nalatiPersistenceRows()}])('$label persistence retains its native input and bytes',({rows})=>{
  const value=structuredClone(rows),bytes=encode(value);
  expect(registeredJsonContract(name).schema).toBe(AdventurePersistenceSchema);
  expect(registeredJsonSchema(name)).toEqual({...namedJsonSchema(AdventurePersistenceSchema),$comment:source});
  validateRegisteredJson(name,value);expect(encode(value)).toEqual(bytes);
  expect(nameBlob(name,'json',bytes,{jsonSchema:registeredJsonSchema(name)}).bytes).toEqual(bytes);
  expect(()=>nameBlob(name,'json',bytes)).toThrow('defining schema');
  expect(()=>validateRegisteredJson(name,{...value,nonnegative:0})).toThrow();
  expect(()=>validateRegisteredJson(name,{...value,bond:{key:'bond',flags:Array.from({length:17},()=>({flag:'tamed'}))}})).toThrow();
});

test('persistence refuses missing and foreign metadata before reading saved policy',async()=>{
  const schema=registeredJsonSchema(name),bytes=encode(pine);
  for(const metadata of [undefined,{...schema,$comment:'foreign-contract'}]){
    let reads=0;
    const identity={slug:'persistence-contract',name:'Persistence',author:'Fixture',revision:1,seed:1};
    const product=createShardProduct({...identity,shardfile:emptyShardfile(identity),sections:new Map(),jsonCheck:fixtureJsonCheck,
      files:new Map([[name,{hash:'a'.repeat(64),url:'/same',...(metadata===undefined?{}:{jsonSchema:metadata})}]]),
      read:()=>{reads++;return Promise.resolve(bytes);}});
    await expect(product.json(name)).rejects.toThrow('unregistered named JSON is retired');expect(reads).toBe(0);
  }
});
