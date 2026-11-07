// @vitest-environment happy-dom
import {expect,it,vi} from 'vitest';
import {Audio} from '@wildshard/engine/audio/Audio';
import {Music} from '@wildshard/engine/audio/Music';
import {CatalogueScore,type ScoreSource} from '@wildshard/engine/audio/SetScore';
import {installDeclaredAudio} from '@wildshard/engine/audio/declared';
import {Scope} from '@wildshard/engine/app/scope';
import {App} from '@wildshard/engine/app/app';
import {jsonSlot} from '@wildshard/engine/saves/slots';
import {createLevelInstallation} from '@wildshard/engine/level/installation';
import type {DebugRowSpec} from '@wildshard/engine/level/context';
import {parseAudioData,AudioDataSchema} from '@wildshard/format/audio';
import {formatJsonSchema} from '@wildshard/sharddev/formatJsonSchema';
import {shardContext} from '../src/client/game/plugin/context';
import {installRuntimeScore} from '../src/client/game/plugin/audio';
import {RetainedRuntimeHooks} from '../src/client/game/shard/retainedHooks';
import {createShardProduct} from '../src/shared/game/shardfile/shardProduct';
import {emptyShardfile} from '@wildshard/sharddev/author';
import {MANIFEST as TEMPLATE} from '../src/shards/_template/discovery.generated';
import pineSource from '../src/shards/pine-hollow/data/audioSource.json' with {type:'json'};
import islandSource from '../src/shards/driftwood-isle/data/audioSource.json' with {type:'json'};

const pine=parseAudioData(pineSource.audio),island=parseAudioData(islandSource.audio);
function mixer(){
 const audio=new Audio(),music=new Music(audio),order:string[]=[];
 let active:ScoreSource|undefined;
 vi.spyOn(music,'refreshScore').mockImplementation(()=>{/* No WebAudio graph in this scope proof. */});
 vi.spyOn(music,'setScore').mockImplementation((_id,source)=>{
  active=source;order.push('bind');return()=>{if(active===source){active=undefined;order.push('unbind');}};
 });
 vi.spyOn(audio,'onLevelBank').mockImplementation((_listener,scope)=>{order.push('bank');scope.onDispose(()=>{order.push('bank.off');});});
 return {audio,music,order,active:()=>active};
}
it('starts automatically despite retired saved scene and sting overrides',()=>{
 expect(()=>formatJsonSchema(AudioDataSchema)).not.toThrow();
 const profile=pine.music;if(profile===undefined)throw new Error('Missing score');
 const device=jsonSlot('debug.plugin.pine-hollow.pineScore','device'),settings=jsonSlot('settings','global');
 const original=device.read(),legacy=settings.read();
 try{
  settings.write({pineScore:'boss-2'});
  for(const pick of ['night','boss-3','dawn']){
   device.write(pick);const {music}=mixer(),score=CatalogueScore.get(music,profile);
   expect(score.sceneName).toBe('day');expect(score.phase).toBe(1);
   score.setScene('night');expect(score.sceneName).toBe('night');
   score.setScene('boss');score.setBossPhase(3);expect(score.phase).toBe(3);
  }
  expect(()=>parseAudioData({...pine,music:{...profile,lifecycle:{...profile.lifecycle,debugPin:{}}}})).toThrow();
 }finally{device.write(original);settings.write(legacy);}
});
it('installs the native bank in the same order and keeps persistent state across entered scopes',()=>{
 const {audio,music,order,active}=mixer(),first=new Scope('score.first');
 const score=installDeclaredAudio(pine,{audio,music,scope:first},'score');
 expect(order).toEqual(['bind','bind','bank']);expect(active()).toBe(score);
 score.setScene('boss');score.setBossPhase(3);
 const dispose=vi.spyOn(score,'dispose');first.dispose();expect(active()).toBeUndefined();expect(dispose).not.toHaveBeenCalled();
 const second=new Scope('score.second');
 const entered=installDeclaredAudio(pine,{audio,music,scope:second},'score');
 expect(entered).toBe(score);expect(entered.sceneName).toBe('boss');expect(entered.phase).toBe(3);
 second.dispose();expect(order.filter(event=>event==='bank.off')).toHaveLength(2);
 expect(()=>installDeclaredAudio(pine,{audio,music,scope:second},'score')).toThrow('disposed');
 const ordinary=new Scope('score.ordinary'),fresh=installDeclaredAudio(island,{audio,music,scope:ordinary},'score');
 const free=vi.spyOn(fresh,'dispose');ordinary.dispose();expect(free).toHaveBeenCalledOnce();
 const next=new Scope('score.next');expect(installDeclaredAudio(island,{audio,music,scope:next},'score')).not.toBe(fresh);next.dispose();
});
it('defers a retained score until entry without registering a scene override',()=>{
 const {audio,music,active}=mixer(),scope=new Scope('score.home'),app=new App(),debug=vi.fn<(row:DebugRowSpec)=>()=>void>(()=>()=>{/* Resident choice cleanup. */});
 const level=createLevelInstallation(app,scope,{debugRow:debug},()=>({set:()=>{/* No loading UI. */},detail:()=>{/* No loading UI. */}}));
 const source=emptyShardfile({slug:'template',name:'Score',author:'Wildshard',revision:1,seed:1});
 const product=createShardProduct({slug:'template',revision:1,shardfile:source,sections:new Map(),files:new Map(),read:()=>Promise.reject(new Error('Unexpected file'))});
 const context=shardContext(level.context,TEMPLATE,{shard:TEMPLATE,rows:new Map(),declaredAudio:pine,bag:{tab:()=>()=>{/* No inventory. */},fragment:()=>()=>{/* No inventory. */}}},product);
 const retained=new RetainedRuntimeHooks(context,{deferActivation:true});
 try{
  installRuntimeScore(retained.context,audio,music);expect(active()).toBeUndefined();expect(debug).not.toHaveBeenCalled();
  retained.activate();const score=active();expect(score).toBeInstanceOf(CatalogueScore);expect(debug).not.toHaveBeenCalled();
  retained.deactivate();expect(active()).toBeUndefined();retained.activate();expect(active()).toBe(score);expect(debug).not.toHaveBeenCalled();
  const ordinary=mixer(),bank=vi.spyOn(ordinary.music,'residentBank');
  const other=new RetainedRuntimeHooks({...context,game:{...context.game,declaredAudio:island}},{deferActivation:true});
  installRuntimeScore(other.context,ordinary.audio,ordinary.music);
  expect(ordinary.active()).toBeInstanceOf(CatalogueScore);expect(bank).toHaveBeenCalledOnce();
  expect(debug).not.toHaveBeenCalled();
 }finally{scope.dispose();}
});
