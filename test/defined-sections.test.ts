import { expect, test } from 'vitest';
import * as v from 'valibot';
import { namedJsonSchema } from '../src/sharddev/formatJsonSchema';
import * as sectionApi from '../src/sharddev/sections';
import { encodeCanonicalJson } from '@wildshard/engine/host/immutable';
import { fixtureNativeJson } from './fixtures/productFile';

const bytes=(value:unknown)=>new TextEncoder().encode(encodeCanonicalJson(value));
const schema=namedJsonSchema(v.strictObject({label:v.string(),rows:v.array(v.pipe(v.number(),v.minValue(0)))}));
test('custom definition and emission APIs are absent',()=>{
  expect(Reflect.has(sectionApi,'defineSection')).toBe(false);
  expect(Reflect.has(sectionApi,'emitDefinedSections')).toBe(false);
  expect(Reflect.has(sectionApi,'validateDefinedSection')).toBe(false);
});
test('named build and native validators retain strict shape and numeric checks',async()=>{
  const good={label:'Camp',rows:[2]};
  expect(sectionApi.validateDefinedJson(bytes(schema),bytes(good))).toEqual(good);
  expect(await fixtureNativeJson(schema,bytes(good))).toEqual(good);
  for(const bad of [{label:'Camp',rows:[-1]},{label:'Camp',rows:['2']},{label:'Camp',rows:[],extra:true}]){
    expect(()=>sectionApi.validateDefinedJson(bytes(schema),bytes(bad))).toThrow();
    await expect(fixtureNativeJson(schema,bytes(bad))).rejects.toThrow();
  }
});
test('paced named validation preserves cancellation and async refusal',async()=>{
  const good=bytes({label:'Camp',rows:[2]});let paints=0;
  expect(await fixtureNativeJson(schema,good,()=>{paints++;return Promise.resolve();})).toEqual({label:'Camp',rows:[2]});
  expect(paints).toBeGreaterThan(0);
  await expect(fixtureNativeJson(schema,good,()=>Promise.reject(new Error('Owner disposed')))).rejects.toThrow('Owner disposed');
  await expect(fixtureNativeJson({$schema:'http://json-schema.org/draft-07/schema#',$async:true,type:'object'},bytes({}),()=>Promise.resolve())).rejects.toThrow('asynchronous');
});
test('named disk schemas refuse corrupt UTF8, external code and unknown checks',()=>{
  expect(()=>sectionApi.validateDefinedJson(new Uint8Array([255]),bytes({}))).toThrow();
  for(const bad of [{$schema:'http://json-schema.org/draft-07/schema#',$ref:'https://example.invalid/schema'},{$schema:'http://json-schema.org/draft-07/schema#',type:'string',inventedCheck:true}])expect(()=>sectionApi.validateDefinedJson(bytes(bad),bytes('x'))).toThrow();
});
