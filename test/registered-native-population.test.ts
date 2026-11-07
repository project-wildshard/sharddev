// oxlint-disable-next-line import/no-nodejs-modules -- Verify actual admitted author payload bytes in this Node test.
import { readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the exact admitted product folder without changing it.
import { join } from 'node:path';
import { expect,test } from 'vitest';
import * as v from 'valibot';
import { REGISTERED_JSON,validateRegisteredJson } from '@wildshard/format/registeredJson';
import { CreatureInstallSchema } from '@wildshard/format/speciesLooks';
import { PopulationProjectionSchema } from '@wildshard/format/populationProjection';
import { PopulationShelterSchema,parsePopulationShelter } from '@wildshard/format/herdShelter';
import { registeredJsonSchema,namedJsonSchema } from '@wildshard/sharddev/formatJsonSchema';
import { encodeCanonicalJson,hashImmutableBytes } from '@wildshard/engine/host/immutable';
import { nameBlob } from '@wildshard/sharddev/blobs';
import { emptyShardfile } from '@wildshard/sharddev/author';
import { createShardProduct } from '@wildshard/engine/game/shardfile/shardProduct';
import { readBuiltShardfile } from '../scripts/build-shardfiles.mjs';

const fileSchema=v.object({name:v.exactOptional(v.string()),path:v.string(),hash:v.string()});
const indexSchema=v.object({files:v.array(fileSchema)});
const names=['actors/creature-install.json','actors/projection.json','actors/shelter.json'] as const;
function actualDocument(slug:string,name:string){
 const folder=readBuiltShardfile(process.cwd(),slug);
 const index=v.parse(indexSchema,JSON.parse(readFileSync(join(folder,'shard.json'),'utf8')));
 const row=index.files.find(file=>file.name===name);
 if(row===undefined)throw new Error(`Missing actual admitted document ${name}`);
 const bytes=new Uint8Array(readFileSync(join(folder,row.path)));
 if(hashImmutableBytes(bytes)!==row.hash)throw new Error('Actual prepared payload differs from manifest');
 const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 return{bytes,value};
}
const install=actualDocument('driftwood-isle',names[0]);
const projection=actualDocument('driftwood-isle',names[1]);
const shelter=actualDocument('pine-hollow',names[2]);
const documents=[install,projection,shelter];

test('three approved existing hosts retain their exact defining schemas and actual payloads',()=>{
 expect(REGISTERED_JSON[names[0]].schema).toBe(CreatureInstallSchema);
 expect(REGISTERED_JSON[names[1]].schema).toBe(PopulationProjectionSchema);
 expect(REGISTERED_JSON[names[2]].schema).toBe(PopulationShelterSchema);
 for(const [i,name] of names.entries()){
  const document=documents[i];if(document===undefined)throw new Error('Missing actual document');
  const schema=registeredJsonSchema(name),contract=REGISTERED_JSON[name];
  expect(schema).toEqual({...namedJsonSchema(contract.schema),$comment:contract.source});
  validateRegisteredJson(name,document.value);
  expect(new TextEncoder().encode(encodeCanonicalJson(document.value))).toEqual(document.bytes);
  expect(nameBlob(name,'json',document.bytes,{jsonSchema:schema}).bytes).toEqual(document.bytes);
 }
});

test('original native bounds refuse malformed install, projection and shelter rows',()=>{
 const a=v.parse(CreatureInstallSchema,install.value);
 const b=v.parse(PopulationProjectionSchema,projection.value);
 const c=parsePopulationShelter(shelter.value);
 const bad=[{...a,packed:{...a.packed,kinds:Array.from({length:65},()=>a.packed.kinds[0]??'invalid')}},
  {...b,splash:{...b.splash,capacity:241}}, {...c,herdLimit:0}];
 expect(()=>v.parse(CreatureInstallSchema,bad[0])).toThrow();
 expect(()=>v.parse(PopulationProjectionSchema,bad[1])).toThrow();
 expect(()=>parsePopulationShelter(bad[2])).toThrow();
 for(const [i,name] of names.entries()){
  const value=bad[i];if(value===undefined)throw new Error('Missing invalid control');
  expect(()=>validateRegisteredJson(name,value)).toThrow();
  expect(()=>nameBlob(name,'json',new TextEncoder().encode(encodeCanonicalJson(value)),{jsonSchema:registeredJsonSchema(name)})).toThrow();
 }
});

test('missing and foreign defining metadata refuses before reading any host payload',async()=>{
 const identity={slug:'native-docs',name:'Native documents',author:'Test',revision:1,seed:1};
 for(const name of names)for(const schema of [undefined,{},{$comment:'foreign'}]){
  let reads=0;
  const product=createShardProduct({slug:identity.slug,revision:1,shardfile:emptyShardfile(identity),sections:new Map(),
   files:new Map([[name,{hash:'a'.repeat(64),url:'https://example.test/data',...(schema===undefined?{}:{jsonSchema:schema})}]]),
   builtJson:true,read:()=>{reads++;return Promise.reject(new Error('No payload read permitted'));}});
  await expect(product.json(name)).rejects.toThrow('unregistered named JSON is retired');expect(reads).toBe(0);
 }
});
