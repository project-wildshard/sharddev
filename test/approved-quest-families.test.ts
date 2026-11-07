import {expect,test} from 'vitest';
import * as v from 'valibot';
// oxlint-disable-next-line import/no-nodejs-modules -- Pin complete original quest document bytes.
import {createHash} from 'node:crypto';
import {platformFileFamily,validatePlatformFile} from '@wildshard/format/platformFileFamilies';
import {registeredJsonSchema} from '../src/sharddev/formatJsonSchema';
import {nameBlob} from '../src/sharddev/blobs';
import {NativeQuestServiceSpotsSchema} from '@wildshard/format/nativeQuestComposition';
import {ContractCatalogueSchema} from '@wildshard/format/contracts';
import roots from './fixtures/approved-quest-families.json' with {type:'json'};

test('seven approved quest families retain complete wire bodies and their original native admissions',()=>{
 for(const [name,fixture]of Object.entries(roots)){
  const input:unknown=JSON.parse(fixture.body),before=JSON.stringify(input),document=registeredJsonSchema(name);
  if(document===undefined||typeof document['$comment']!=='string')throw new Error('Missing quest schema');
  const source=document['$comment'],family=platformFileFamily(name,source);
  if(family===undefined)throw new Error('Missing approved quest family');
  expect(createHash('sha256').update(fixture.body).digest('hex')).toBe(fixture.sha256);
  expect(v.parse(family.schema,input)).toEqual(input);
  expect(validatePlatformFile(name,source,input)).toBe(family);
  expect(createHash('sha256').update(nameBlob(name,'json',new TextEncoder().encode(fixture.body),{jsonSchema:document}).bytes).digest('hex')).toBe(fixture.sha256);
  expect(()=>validatePlatformFile(name,source,{...v.parse(v.record(v.string(),v.unknown()),input),foreign:true})).toThrow();
  expect(platformFileFamily(name,undefined)).toBeUndefined();
  expect(platformFileFamily(name,`${source}Other`)).toBeUndefined();
  expect(platformFileFamily(`private/${name}`,source)).toBeUndefined();
  expect(JSON.stringify(input)).toBe(before);
 }
});
test('quest registration retains original duplicate service and contract identities',()=>{
 const spots=v.parse(NativeQuestServiceSpotsSchema,JSON.parse(roots['quests/native-spots.json'].body));
 const first=spots.rows[0];if(first===undefined)throw new Error('Missing actual native service spot');
 expect(()=>validatePlatformFile('quests/native-spots.json','@wildshard/format/nativeQuestComposition#NativeQuestServiceSpotsSchema',{
  ...spots,rows:[...spots.rows,first],
 })).toThrow('Duplicate');
 const contracts=v.parse(ContractCatalogueSchema,JSON.parse(roots['quests/contracts.json'].body));
 const offer=contracts.rows[0];if(offer===undefined)throw new Error('Missing actual native contract offer');
 expect(()=>validatePlatformFile('quests/contracts.json','@wildshard/format/contracts#ContractCatalogueSchema',{
  ...contracts,rows:[...contracts.rows,offer],
 })).toThrow('Invalid contract catalogue references');
 expect(platformFileFamily('quests/native-story.json','@wildshard/format/nativeQuestComposition#NativeQuestCompositionSchema')).toBeUndefined();
});
