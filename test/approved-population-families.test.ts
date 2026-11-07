import {expect,test} from 'vitest';
import * as v from 'valibot';
// oxlint-disable-next-line import/no-nodejs-modules -- Pin complete original population documents.
import {createHash} from 'node:crypto';
import {platformFileFamily,validatePlatformFile} from '@wildshard/format/platformFileFamilies';
import {registeredJsonSchema} from '../src/sharddev/formatJsonSchema';
import {nameBlob} from '../src/sharddev/blobs';
import {NativePopulationRowsSchema} from '@wildshard/format/populationRoster';
import {PopulationShelterSchema} from '@wildshard/format/herdShelter';
import {CreatureInstallSchema} from '@wildshard/format/speciesLooks';
import roots from './fixtures/approved-population-families.json' with {type:'json'};

test('six approved population families retain complete wire bodies and native defining parsers',()=>{
 for(const [name,fixture]of Object.entries(roots)){
  const input:unknown=JSON.parse(fixture.body),before=JSON.stringify(input),document=registeredJsonSchema(name);
  if(document===undefined||typeof document['$comment']!=='string')throw new Error('Missing population schema');
  const source=document['$comment'],family=platformFileFamily(name,source);
  if(family===undefined)throw new Error('Missing approved population family');
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
test('family admission retains the original native roster, kind and shelter bounds',()=>{
 const roster=v.parse(NativePopulationRowsSchema,JSON.parse(roots['actors/roster.json'].body));
 const shelter=v.parse(PopulationShelterSchema,JSON.parse(roots['actors/shelter.json'].body));
 const install=v.parse(CreatureInstallSchema,JSON.parse(roots['actors/creature-install.json'].body));
 expect(()=>validatePlatformFile('actors/roster.json','@wildshard/format/populationRoster#NativePopulationRowsSchema',{...roster,bodyCount:roster.limit+1})).toThrow();
 expect(()=>validatePlatformFile('actors/shelter.json','@wildshard/format/herdShelter#PopulationShelterSchema',{...shelter,herdLimit:0})).toThrow();
 expect(()=>validatePlatformFile('actors/creature-install.json','@wildshard/format/speciesLooks#CreatureInstallSchema',{
  ...install,packed:{...install.packed,kinds:Array.from({length:65},()=>install.packed.kinds[0]??'invalid')},
 })).toThrow();
});
