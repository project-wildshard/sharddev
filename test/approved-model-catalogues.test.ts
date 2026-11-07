import {expect,test} from 'vitest';
import * as v from 'valibot';
// oxlint-disable-next-line import/no-nodejs-modules -- Pin the original complete document bytes.
import {createHash} from 'node:crypto';
import {platformFileFamily,validatePlatformFile} from '@wildshard/format/platformFileFamilies';
import {registeredJsonSchema} from '../src/sharddev/formatJsonSchema';
import {nameSpecimenBook} from '../src/sharddev/bake/specimenCatalogue';
import roots from './fixtures/approved-model-catalogue-roots.json' with {type:'json'};

test('G1004 catalogue families retain every original body and refuse foreign roots',()=>{
  for(const [name,fixture]of Object.entries(roots)){
    const document=registeredJsonSchema(name);
    if(document===undefined||typeof document['$comment']!=='string')throw new Error(`Missing defining schema ${name}`);
    const source=document['$comment'],family=platformFileFamily(name,source);
    if(family===undefined)throw new Error(`Missing approved family ${name}`);
    const input:unknown=JSON.parse(fixture.body),before=JSON.stringify(input);
    expect(createHash('sha256').update(fixture.body).digest('hex')).toBe(fixture.sha256);
    expect(v.parse(family.schema,input)).toEqual(input);
    expect(validatePlatformFile(name,source,input)).toBe(family);
    expect(()=>validatePlatformFile(name,source,{})).toThrow();
    expect(()=>validatePlatformFile(name,source,{...v.parse(v.record(v.string(),v.unknown()),input),foreign:true})).toThrow();
    expect(platformFileFamily(name,undefined)).toBeUndefined();
    expect(platformFileFamily(name,`${source}Other`)).toBeUndefined();
    expect(platformFileFamily(`private/${name}`,source)).toBeUndefined();
    expect(JSON.stringify(input)).toBe(before);
  }
});

test('provenance metadata leaves all three emitted specimen-book bodies byte-identical',()=>{
  for(const name of ['models/cover-phone.json','models/cover-desktop.json','models/gear-book.json'] as const){
    const fixture=roots[name],input:unknown=JSON.parse(fixture.body);
    const blob=nameSpecimenBook(name,input);
    expect(createHash('sha256').update(blob.bytes).digest('hex')).toBe(fixture.sha256);
    expect(blob.file.jsonSchema?.['$comment']).toBe('@wildshard/format/specimenCatalogue#SpecimenBookSchema');
  }
});
