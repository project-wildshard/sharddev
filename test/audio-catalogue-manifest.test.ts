import { installAssetFixture } from './fixtures/bootSetup';
import { DRIFTWOOD_ISLAND_FACTS } from './fixtures/driftwood-island-facts';
import {expect,it,vi} from 'vitest';
import {Scope} from '@wildshard/engine/app/scope';
import {emptyShardfile} from '@wildshard/sharddev/author';
import {createShardProduct} from '../src/shared/game/shardfile/shardProduct';
import * as runtime from '../src/client/game/shardfile/runtimeProduct';
import {productAudioCatalogue} from '../src/client/game/shardfile/audioCatalogue';
import {parseAudioData} from '@wildshard/format/audio';
import {MANIFEST as pine} from '../src/shards/pine-hollow/discovery.generated';
import {MANIFEST as island} from '../src/shards/driftwood-isle/discovery.generated';
import { pineAudio as pineAudioSection } from '../src/shards/pine-hollow/generators/channelSections';
import { driftwoodAudio } from '../src/shards/driftwood-isle/generators/audio';
import { DRIFTWOOD_LAYOUTS } from './fixtures/driftwood-layout-source';

await installAssetFixture();

// GR8: called, not read from a scheduler job's output
const pineAudio = pineAudioSection(), islandAudio = { audio: driftwoodAudio(DRIFTWOOD_LAYOUTS.wreck, DRIFTWOOD_ISLAND_FACTS) };

it.each([[pine,pineAudio],[island,islandAudio]] as const)('%s boots from admitted catalogue rows without a shard facade',async(manifest,rows)=>{
 const source=emptyShardfile({slug:manifest.slug,name:'Catalogue',author:'Wildshard',revision:1,seed:1});
 const read=vi.fn<()=>Promise<Uint8Array>>(()=>Promise.reject(new Error('Unexpected blob read')));
 const product=createShardProduct({slug:manifest.slug,revision:1,shardfile:source,sections:new Map([['audio/audio',{audio:parseAudioData(rows.audio)}]]),files:new Map(),read});
 const scopes:Scope[]=[];
 const load=vi.spyOn(runtime,'loadFirstPartyProduct').mockImplementation((slug,scope)=>{
  expect(slug).toBe(manifest.slug);if(!(scope instanceof Scope))throw new Error('Catalogue needs its temporary lease');
  expect(scope.disposed).toBe(false);scopes.push(scope);return Promise.resolve(product);
 });
 const preload=manifest.audio?.preload,inventory=manifest.boot?.audio;
 if(preload===undefined||typeof inventory!=='function')throw new Error('Missing declared catalogue binding');
 const catalogue=await preload();
 expect(scopes).toHaveLength(1);expect(scopes[0]?.disposed).toBe(true);
 expect(await inventory()).toEqual([...catalogue.files().music,...catalogue.files().sfx]);
 expect(scopes).toHaveLength(2);expect(scopes.every(scope=>scope.disposed)).toBe(true);
 const direct=await productAudioCatalogue(manifest.slug,product);
 expect(direct.files()).toEqual(catalogue.files());expect(load).toHaveBeenCalledTimes(2);
 expect(read).not.toHaveBeenCalled();
});
