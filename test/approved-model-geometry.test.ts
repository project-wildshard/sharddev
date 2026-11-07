import {expect,test} from 'vitest';
import * as v from 'valibot';
// oxlint-disable-next-line import/no-nodejs-modules -- Pin the complete original document bytes.
import {createHash} from 'node:crypto';
import {FixedGeometryGroupsSchema as GeometryRoot} from '@wildshard/format/islandLibrary';
import {FixedPracticeFileSchema as PracticeRoot} from '@wildshard/format/practiceCourseRows';
import {platformFileFamily,validatePlatformFile} from '@wildshard/format/platformFileFamilies';
import {registeredJsonSchema} from '../src/sharddev/formatJsonSchema';
import {parseFixedPractice} from '../src/shards/nine-dragon-stack/generators/sections';
import {parseSectionValue} from '../src/sharddev/sections';
import {FixedGeometryGroupsSchema} from '../src/shards/driftwood-isle/generators/sections';
import roots from './fixtures/approved-model-geometry-roots.json' with {type:'json'};

test('the whole geometry and practice author roots retain their original complete values',()=>{
  const practice:unknown=JSON.parse(roots['geometry/fixed-kits.json'].body);
  const groups:unknown=JSON.parse(roots['models/fixed-geometry.json'].body);
  expect(v.parse(PracticeRoot,practice)).toEqual(practice);
  expect(v.parse(GeometryRoot,groups)).toEqual(groups);
  expect(parseFixedPractice(practice)).toEqual(practice);
  expect(JSON.stringify(parseFixedPractice(practice),(_key,value:unknown)=>typeof value==='number'&&Object.is(value,-0)?'-0':value)).toBe(roots['geometry/fixed-kits.json'].body);
  expect(parseSectionValue(FixedGeometryGroupsSchema,groups)).toEqual(groups);
  for(const [name,fixture]of Object.entries(roots)){
    const input:unknown=JSON.parse(fixture.body),before=JSON.stringify(input),document=registeredJsonSchema(name);
    if(document===undefined||typeof document['$comment']!=='string')throw new Error('Missing defining schema');
    const source=document['$comment'];
    expect(createHash('sha256').update(fixture.body).digest('hex')).toBe(fixture.sha256);
    expect(validatePlatformFile(name,source,input)).toBeDefined();
    expect(platformFileFamily(name,undefined)).toBeUndefined();
    expect(platformFileFamily(name,`${source}Other`)).toBeUndefined();
    expect(platformFileFamily(`private/${name}`,source)).toBeUndefined();
    expect(JSON.stringify(input)).toBe(before);
  }
});

test('the complete practice contract rejects invalid geometry and untyped return guests',()=>{
  const row=v.parse(PracticeRoot,JSON.parse(roots['geometry/fixed-kits.json'].body)).practice;
  for(const practice of [
    {...row,frame:{...row.frame,invalid:Infinity}},
    {...row,presentation:{...row.presentation,colliders:[{kind:'sphere'}]}},
    {...row,program:{...row.program,script:{}}},
    {...row,program:{...row.program,bytes:1}},
    {...row,program:{...row.program,script:{...row.program.script,callback:()=>0}}},
    {...row,program:{...row.program,foreign:true}},
  ])expect(()=>v.parse(PracticeRoot,{practice})).toThrow();
  const group=v.parse(GeometryRoot,JSON.parse(roots['models/fixed-geometry.json'].body));
  expect(()=>v.parse(GeometryRoot,{...group,npc:{...group.npc,trader:{...group.npc.trader,fore:undefined}}})).toThrow();
  expect(()=>v.parse(GeometryRoot,{...group,foreign:true})).toThrow();
});
