import {expect,test} from 'vitest';
import {DEFAULT_GOLDEN_CAMERAS,goldenPreviewIdentity,selectGoldenShards,selectGoldenCameraNumbers} from '../scripts/goldens/capture-inputs.mjs';

test('goldens default to 24 cameras and identify the actual served artifact without HEAD',()=>{
  expect(DEFAULT_GOLDEN_CAMERAS).toBe('art/legacy-goldens/compare/cameras24.json');
  const sha=`744c3ab7e2${'0'.repeat(30)}`,version={build:'744c3ab-candidate'};
  expect(goldenPreviewIdentity(version)).toEqual({build:version.build,sha:'744c3ab'});
  expect(goldenPreviewIdentity(version,sha).sha).toBe(sha);
  expect(()=>goldenPreviewIdentity(version,'f'.repeat(40))).toThrow('does not match');
  for(const value of [{build:'HEAD'}, {build:'unknown'}, {}, null])expect(()=>goldenPreviewIdentity(value)).toThrow();
  expect(()=>goldenPreviewIdentity(version,'744c3ab')).toThrow('full source SHA');
});

test('one-shard and ordered subsets never fall back or accept duplicate/unknown selections',()=>{
  const cameras={first:[],second:[],third:[]};
  expect(selectGoldenShards(cameras)).toEqual(['first','second','third']);
  expect(selectGoldenShards(cameras,'second')).toEqual(['second']);
  expect(selectGoldenShards(cameras,'third,first')).toEqual(['third','first']);
  for(const requested of ['', 'missing','first,first','first,'])expect(()=>selectGoldenShards(cameras,requested)).toThrow();
  expect(selectGoldenCameraNumbers('')).toBe(null);
  expect([...selectGoldenCameraNumbers('24,1')??[]]).toEqual([24,1]);
  for(const requested of ['0','25','1,1','2,','NaN','1.5'])expect(()=>selectGoldenCameraNumbers(requested)).toThrow();
});
