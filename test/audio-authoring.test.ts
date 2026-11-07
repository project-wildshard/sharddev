import { DRIFTWOOD_ISLAND_FACTS } from './fixtures/driftwood-island-facts';
import { DRIFTWOOD_LAYOUTS } from './fixtures/driftwood-layout-source';
import {expect,it} from 'vitest';
import {parseAudioData} from '@wildshard/format/audio';
import {loadHeadlessProduct} from '../src/sdk/headlessProduct';
import {builtProduct} from './fixtures/builtProduct';
import pineSource from '../src/shards/pine-hollow/data/audioSource.json' with {type:'json'};
import islandSource from '../src/shards/driftwood-isle/data/audioSource.json' with {type:'json'};
import cove from '../src/shards/driftwood-isle/data/coveComposition.json' with {type:'json'};
import {islandCoveSpec} from '../src/shards/driftwood-isle/generators/coveLayout';
import {driftwoodGameplayAudioEnvironment} from '../src/shards/driftwood-isle/generators/gameplayAudioEnvironment';

const islandRows=parseAudioData({...islandSource.audio,gameplay:{...islandSource.audio.gameplay,entryEnvironment:driftwoodGameplayAudioEnvironment(DRIFTWOOD_LAYOUTS.wreck, DRIFTWOOD_ISLAND_FACTS),constants:{cove:{fall:cove.audioFall,cave:cove.audioCave,caveBounds:cove.audioBounds}}}});

it.each([
  ['pine-hollow',pineSource],['driftwood-isle',islandSource],
] as const)('%s publishes its authored audio through the existing section',async(slug,source)=>{
  const rows=slug==='driftwood-isle'?islandRows:parseAudioData(source.audio);
  expect(cove.audioBounds).toEqual(islandCoveSpec().caveBounds);
  expect(cove.audioFall.foot).toEqual(islandCoveSpec().fall.foot);
  expect(islandCoveSpec().cave).toMatchObject(cove.audioCave);
  // the verified built product (the product cohort), not a whole author build inside the assertion
  const product=await loadHeadlessProduct(builtProduct(slug));
  expect(product.shardfile.audio).toEqual(rows);
  // The producer uses the public wire parser: invalid PCM or zone rows still refuse.
  expect(()=>parseAudioData({...source.audio,pcm:{bad:{seed:[1,2],values:[],samples:0}}})).toThrow();
  expect(()=>parseAudioData({...source.audio,zones:{...source.audio.zones,tickHz:0}})).toThrow();
},30000);

it('every declared cove ambience read resolves in the emitted runtime owner',()=>{
  const rows=islandRows;
  const reads=rows.zones?.lifecycle?.inputs.filter(row=>row.kind==='read'&&row.owner==='cove')??[];
  expect(reads).toHaveLength(6);
  for(const row of reads){
    if(row.kind!=='read')throw new Error('Expected numeric owner read');
    let value:unknown=rows.gameplay?.constants?.['cove'];
    for(const field of row.path){
      if(typeof value!=='object'||value===null)throw new Error(`Missing cove ambience path: ${row.path.join('.')}`);
      value=Reflect.get(value,field);
    }
    expect(typeof value,row.path.join('.')).toBe('number');
    expect(Number.isFinite(value),row.path.join('.')).toBe(true);
  }
});
