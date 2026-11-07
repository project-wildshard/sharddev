import {expect,test} from 'vitest';
import * as v from 'valibot';
// oxlint-disable-next-line import/no-nodejs-modules -- Pin complete original native input bytes.
import {createHash} from 'node:crypto';
import {PopulationHabitatSchema} from '@wildshard/format/populationEnvironment';
import {TamingPoseFileSchema} from '@wildshard/format/populationRoster';
import {platformFileFamily,validatePlatformFile} from '@wildshard/format/platformFileFamilies';
import {registeredJsonSchema} from '../src/sharddev/formatJsonSchema';
import {namePopulationHabitat} from '../src/sharddev/nativePopulationRows';
import roots from './fixtures/approved-population-metadata.json' with {type:'json'};

test('the habitat and taming documents retain all original native fields and body hashes',()=>{
 for(const [name,fixture]of Object.entries(roots)){
  const input:unknown=JSON.parse(fixture.body),before=JSON.stringify(input),schema=registeredJsonSchema(name);
  if(schema===undefined||typeof schema['$comment']!=='string')throw new Error('Missing full native input schema');
  const source=schema['$comment'],family=platformFileFamily(name,source);
  if(family===undefined)throw new Error('Missing approved native input family');
  expect(createHash('sha256').update(fixture.body).digest('hex')).toBe(fixture.sha256);
  expect(v.parse(family.schema,input)).toEqual(input);
  expect(validatePlatformFile(name,source,input)).toBe(family);
  expect(platformFileFamily(name,`${source}Other`)).toBeUndefined();
  expect(platformFileFamily(`private/${name}`,source)).toBeUndefined();
  expect(JSON.stringify(input)).toBe(before);
 }
});
test('G872 fixes both canopy counts at 155 and at most 6 ledges',()=>{
 const fixture=roots['sim/population-metadata.json'],row=v.parse(PopulationHabitatSchema,JSON.parse(fixture.body));
 const blob=namePopulationHabitat('sim/population-metadata.json',row,155,6);
 expect(createHash('sha256').update(blob.bytes).digest('hex')).toBe(fixture.sha256);
 expect(blob.file.jsonSchema?.['$comment']).toBe('@wildshard/format/populationEnvironment#PopulationHabitatSchema');
 expect(row.trees).toHaveLength(155);expect(row.tops).toHaveLength(155);
 const tree=row.trees[0],top=row.tops[0];
 if(tree===undefined||top===undefined)throw new Error('Missing actual canopy entries');
 for(const input of [{...row,trees:row.trees.slice(1)},{...row,tops:row.tops.slice(1)},
  {...row,trees:[...row.trees,tree]},{...row,tops:[...row.tops,top]},
  {...row,ledges:Array.from({length:7},()=>({x:0,y:0,z:0,r:1}))},{...row,foreign:true}])expect(()=>v.parse(PopulationHabitatSchema,input)).toThrow();
});
test('native taming poses refuse invalid hierarchy and foreign pose/source fields',()=>{
 const row=v.parse(TamingPoseFileSchema,JSON.parse(roots['sim/taming-poses.json'].body)),first=row.poses[0];
 if(first===undefined)throw new Error('Missing actual taming pose');
 const joint=first.pose.joints[0];if(joint===undefined)throw new Error('Missing actual native joint');
 for(const pose of [{...first.pose,joints:[{...joint,parent:0},...first.pose.joints.slice(1)]},
  {...first.pose,joints:[{...joint,order:'bad'},...first.pose.joints.slice(1)]},{...first.pose,foreign:true}])
  expect(()=>v.parse(TamingPoseFileSchema,{poses:[{...first,pose},...row.poses.slice(1)]})).toThrow();
});
