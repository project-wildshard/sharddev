import {expect,test} from 'vitest';
import * as v from 'valibot';
// oxlint-disable-next-line import/no-nodejs-modules -- Pin the original complete document bytes.
import {createHash} from 'node:crypto';
import {platformFileFamily,validatePlatformFile} from '@wildshard/format/platformFileFamilies';
import {registeredJsonSchema} from '../src/sharddev/formatJsonSchema';
import roots from './fixtures/people-places-root-users.json' with {type:'json'};

test('G1004 registers only the three approved complete people/place documents',()=>{
  for(const [name,fixture]of Object.entries(roots)){
    const schema=registeredJsonSchema(name);
    if(schema===undefined)throw new Error('Missing registered document schema');
    const source=schema['$comment'];
    if(typeof source!=='string')throw new Error('Missing defining document identity');
    const family=platformFileFamily(name,source);
    if(family===undefined)throw new Error(`Missing approved document ${name}`);
    const input:unknown=JSON.parse(fixture.body);
    const before=JSON.stringify(input);
    expect(createHash('sha256').update(fixture.body).digest('hex')).toBe(fixture.sha256);
    expect(v.parse(family.schema,input)).toEqual(input);
    expect(validatePlatformFile(name,source,input)).toBe(family);
    expect(platformFileFamily(name,undefined)).toBeUndefined();
    expect(platformFileFamily(name,`${source}Other`)).toBeUndefined();
    expect(platformFileFamily(`private/${name}`,source)).toBeUndefined();
    const object=v.parse(v.record(v.string(),v.unknown()),input);
    expect(()=>validatePlatformFile(name,source,{...object,foreign:true})).toThrow();
    expect(()=>validatePlatformFile(name,source,{})).toThrow();
    expect(JSON.stringify(input)).toBe(before);
  }
});
