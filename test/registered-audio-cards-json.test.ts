import {expect,test} from 'vitest';
import {AudioSceneSchema} from '@wildshard/format/audioScene';
import {KitFigureCardsSchema} from '@wildshard/format/questFigures';
import {registeredJsonContract,validateRegisteredJson} from '@wildshard/format/registeredJson';
import {registeredJsonSchema,namedJsonSchema} from '../src/sharddev/formatJsonSchema';
import {encodeCanonicalJson,hashImmutableBytes} from '../src/sdk/immutable';
import {nameBlob} from '../src/sharddev/blobs';
import {emptyShardfile} from '../src/sharddev/author';
import {createShardProduct} from '../src/shared/game/shardfile/shardProduct';
import {fixtureJsonCheck} from './fixtures/productFile';
import {nalatiAudioRows} from '../src/shards/nalati-grasslands/generators/audioRows';
import {driftwoodKitFigureCards} from '../src/shards/driftwood-isle/generators/kitFigureCards';

const audio=nalatiAudioRows().audio.scene,cards=driftwoodKitFigureCards();
const contracts=[
 {name:'audio/scene.json',schema:AudioSceneSchema,source:'@wildshard/format/audioScene#AudioSceneSchema',value:audio,invalid:{...audio,fields:{...audio.fields,res:1}}},
 {name:'people/cards.json',schema:KitFigureCardsSchema,source:'@wildshard/format/questFigures#KitFigureCardsSchema',value:cards,invalid:{...cards,cards:{}}},
] as const;
const encode=(value:unknown)=>new TextEncoder().encode(encodeCanonicalJson(value));

test.each(contracts)('$name retains its actual author rows, native parser and full bytes',row=>{
 const value=structuredClone(row.value),bytes=encode(value);
 expect(registeredJsonContract(row.name).schema).toBe(row.schema);
 expect(registeredJsonSchema(row.name)).toEqual({...namedJsonSchema(row.schema),$comment:row.source});
 validateRegisteredJson(row.name,value);expect(value).toEqual(row.value);
 expect(nameBlob(row.name,'json',bytes,{jsonSchema:registeredJsonSchema(row.name)}).bytes).toEqual(bytes);
 expect(()=>nameBlob(row.name,'json',bytes)).toThrow('defining schema');
 expect(()=>validateRegisteredJson(row.name,row.invalid)).toThrow();
});

test.each(contracts)('$name refuses missing and foreign metadata before reading its body',async row=>{
 const bytes=encode(row.value),schema=registeredJsonSchema(row.name);
 for(const metadata of [undefined,{...schema,$comment:'foreign-contract'}]){
  let reads=0;
  const identity={slug:'audio-cards-contract',name:'Audio cards',author:'Fixture',revision:1,seed:1};
  const product=createShardProduct({...identity,shardfile:emptyShardfile(identity),sections:new Map(),jsonCheck:fixtureJsonCheck,
   files:new Map([[row.name,{hash:'a'.repeat(64),url:'/same',...(metadata===undefined?{}:{jsonSchema:metadata})}]]),
   read:()=>{reads++;return Promise.resolve(bytes);}});
  await expect(product.json(row.name)).rejects.toThrow('unregistered named JSON is retired');expect(reads).toBe(0);
 }
});

test.each(contracts)('$name admits the complete native document through the existing product reader',async row=>{
 const value=structuredClone(row.value),bytes=encode(value),identity={slug:'audio-cards-contract',name:'Audio cards',author:'Fixture',revision:1,seed:1};
 let reads=0;
 const product=createShardProduct({...identity,shardfile:emptyShardfile(identity),sections:new Map(),jsonCheck:fixtureJsonCheck,
  files:new Map([[row.name,{hash:hashImmutableBytes(bytes),url:'/same',jsonSchema:registeredJsonSchema(row.name)}]]),
  read:()=>{reads++;return Promise.resolve(bytes);}});
 expect(await product.json(row.name)).toEqual(value);expect(reads).toBe(1);
});
