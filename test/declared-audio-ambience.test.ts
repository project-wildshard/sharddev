// @vitest-environment happy-dom
import { installAssetFixture } from './fixtures/bootSetup';
import {expect,it,vi} from 'vitest';
import {Camera} from 'three';
import {Audio} from '@wildshard/engine/audio/Audio';
import {Scope} from '@wildshard/engine/app/scope';
import {audioRandom} from '@wildshard/engine/audio/util';
import {installDeclaredAudio} from '@wildshard/engine/audio/declared';
import {parseAudioData,AudioDataSchema} from '@wildshard/format/audio';
import {formatJsonSchema} from '@wildshard/sharddev/formatJsonSchema';
import {DeclaredAmbience} from '@wildshard/engine/audio/declaredAmbience';
import {AmbienceMix,type AmbienceMixPorts} from '@wildshard/engine/audio/ambience';
import pineSource from '../src/shards/pine-hollow/data/audioSource.json' with {type:'json'};
import islandSource from '../src/shards/driftwood-isle/data/audioSource.json' with {type:'json'};

await installAssetFixture();

// The injected native constructor records ports and retains every real mix method.
const captured:AmbienceMixPorts[]=[];
class ObservedMix extends AmbienceMix {
 constructor(...args:ConstructorParameters<typeof AmbienceMix>){super(...args);captured.push(args[2]);}
}
const pine=parseAudioData(pineSource.audio),island=parseAudioData(islandSource.audio);
function ports(){const result=captured.at(-1);if(result===undefined)throw new Error('Missing real mix');return result;}
function makePine(){
 const audio=new Audio(),scope=new Scope('ambience.parent');
 const ambience=new DeclaredAmbience(pine,{audio,scope,heightAt:()=>0,sea:0,floorRows:{cabins:[]},sites:{cabins:[]},owners:{terrain:{POND:{x:0,z:0,r:0}},cabins:null}},ObservedMix);
 return {audio,scope,ambience};
}
it('preserves live weather/night and thrall input values without another clock or random draw',()=>{
 expect(()=>formatJsonSchema(AudioDataSchema)).not.toThrow();
 const {scope,ambience}=makePine(),mix=ports();
 try{
  expect(mix.random).toBe(audioRandom);expect(mix.zoneScope).toBe(ambience.scope);
  for(const [night,rain,dawn] of [[0,0,0],[.7,.4,.2],[1.4,1,.8],[-.5,0,0]]){
   ambience.night=night??0;ambience.inputs['rain']=rain??0;ambience.inputs['dawn']=dawn??0;
   expect(mix.inputs?.['rawNight']?.()).toBe(night);expect(mix.inputs?.['rawRain']?.()).toBe(rain);expect(mix.inputs?.['rawDawn']?.()).toBe(dawn);
   expect(mix.inputs?.['thr']?.()).toBe(Math.max(0,Math.min(1,(night??0)*.5)));
  }
  const camera=new Camera(),frame=vi.spyOn(ambience.routing,'frame').mockImplementation(()=>undefined);
  ambience.update(.1,camera);expect(frame).toHaveBeenCalledExactlyOnceWith(.1,camera);
 }finally{scope.dispose();}
});
it('uses the native catalogue and retains entered sample/timer teardown without disposing the parent',()=>{
 const {audio,scope,ambience}=makePine(),mix=ports(),bank=ambience.sfx;
 try{
  const listener=vi.spyOn(bank.playback,'listener'),shot=vi.spyOn(bank,'shot').mockReturnValue(true);
  mix.listener?.(1,2,3,.4);expect(listener).toHaveBeenCalledExactlyOnceWith(1,2,3,.4);
  const options={at:{x:4,y:5,z:6},gain:.7};expect(mix.shot?.('thrall_call',options)).toBe(true);expect(shot).toHaveBeenCalledExactlyOnceWith('thrall_call',options);
  const bed=vi.spyOn(bank.catalogue,'bed').mockResolvedValue(undefined),drop=vi.spyOn(bank.catalogue,'dropBed');
  void mix.sample?.load('rain-open');mix.sample?.drop('rain-open');expect(bed).toHaveBeenCalledWith('rain-open');expect(drop).toHaveBeenCalledWith('rain-open');
  mix.sampleLive?.(['hollow']);mix.roomWeight?.('cabin',.6);mix.diagnostic?.('rain',.8);
  expect(ambience.diag['beds']).toEqual(['hollow']);expect(ambience.diag['sends']).toMatchObject({cabin:.6});expect(ambience.diag['rain']).toBe(.8);
  const schedules=vi.spyOn(ambience.routing,'dropSchedules'),samples=vi.spyOn(ambience.routing,'dropSamples'),dispose=vi.spyOn(ambience.routing,'dispose');
  ambience.dispose();expect(schedules).toHaveBeenCalledOnce();expect(samples).toHaveBeenCalledOnce();expect(dispose).not.toHaveBeenCalled();expect(scope.disposed).toBe(false);
  expect(audio.ready).toBe(false);
 }finally{scope.dispose();}
});
it('keeps the island wind handoff, standalone scope and borrowed live uniform reads',()=>{
 const audio=new Audio(),scope=new Scope('island.parent'),wind={uTime:{value:4},uWindStrength:{value:.7}};
 const installed=vi.spyOn(audio,'installSynthBed'),windBed=vi.spyOn(audio,'windBed');
 const ambience=new DeclaredAmbience(island,{audio,scope,heightAt:()=>0,sea:0,owners:{wind,cove:{fall:{foot:[127.5,18]},cave:{x:16,z:22,yaw:.7,depth:9}}}},ObservedMix),mix=ports();
 try{
  expect(mix.points?.['fall']).toEqual({x:127.5,y:1,z:18});expect(mix.points?.['cave']).toEqual({x:16-Math.sin(.7)*9*.5,z:22-Math.cos(.7)*9*.5});
  expect(mix.random).toBe(audioRandom);expect(mix.zoneScope).toBeUndefined();expect(ambience.scope).not.toBe(scope);
  expect(windBed).toHaveBeenCalledExactlyOnceWith(island.ambience);expect(installed).toHaveBeenCalledOnce();
  expect(mix.inputs?.['windTime']?.()).toBe(4);wind.uTime.value=9;expect(mix.inputs?.['windTime']?.()).toBe(9);
  const restart=vi.spyOn(audio,'restartSynthBed').mockImplementation(()=>undefined);mix.onBuild?.();mix.onBuild?.();expect(restart).toHaveBeenCalledExactlyOnceWith('island');
  expect(()=>ambience.sfx).toThrow('ambience sound bank');scope.dispose();expect(ambience.scope.disposed).toBe(false);
  ambience.dispose();expect(ambience.scope.disposed).toBe(true);
 }finally{scope.dispose();ambience.dispose();}
});
it('refuses missing owners, cyclic input declarations and disposed scopes before bank registration',()=>{
 const audio=new Audio(),scope=new Scope('ambience.refusal'),register=vi.spyOn(audio.voices,'register');
 expect(()=>installDeclaredAudio(island,{audio,scope,heightAt:()=>0,sea:0},'ambience')).toThrow('Missing ambience input owner');
 const zones=pine.zones;if(zones?.lifecycle===undefined)throw new Error('Missing lifecycle');
 const invalid={...pine,zones:{...zones,lifecycle:{...zones.lifecycle,inputs:[{kind:'value' as const,id:'loop',value:'loop'}]}}};
 expect(()=>installDeclaredAudio(invalid,{audio,scope,heightAt:()=>0,sea:0},'ambience')).toThrow('earlier input');
 expect(register).not.toHaveBeenCalled();scope.dispose();expect(()=>installDeclaredAudio(island,{audio,scope,heightAt:()=>0,sea:0,owners:{wind:{}}},'ambience')).toThrow('disposed');
});

it('reads the same pond, fire pits and wheel boundary from their native owners',()=>{
 const audio=new Audio(),scope=new Scope('ambience.spatial'),terrain={POND:{x:4,z:5,r:10}},cabins={wheel:{value:0},firePits:[{x:2,y:3,z:4}]};
 const ambience=new DeclaredAmbience(pine,{audio,scope,heightAt:()=>0,sea:0,floorRows:{cabins:[]},sites:{cabins:[]},owners:{terrain,cabins}},ObservedMix),mix=ports();
 try{
  expect(mix.circles?.['pond']?.()).toEqual(terrain.POND);terrain.POND={x:8,z:9,r:12};expect(mix.circles?.['pond']?.()).toEqual(terrain.POND);
  expect(mix.pointLists?.['fire']?.()).toBe(cabins.firePits);cabins.firePits=[{x:7,y:8,z:9}];expect(mix.pointLists?.['fire']?.()).toBe(cabins.firePits);
  const mill=mix.spots?.['spots']?.().find(row=>row.zone==='mill');expect(mill).toBeDefined();
  for(const speed of [0,.01,.011,1]){cabins.wheel.value=speed;expect(mill?.gain?.()).toBe(speed>.01?1:0);}
  const before=mix.spots?.['spots']?.().length??0;ambience.addSpot({zone:'cave',x:1,z:2,r:3,fade:3});expect(mix.spots?.['spots']?.()).toHaveLength(before+1);
  ambience.inputs['rain']=.8;expect(ambience.stepSurface(100,100,0)).toBe('wet');
  terrain.POND.r=0;expect(mix.circles?.['pond']?.()).toBeUndefined();
 }finally{scope.dispose();}
});

it('lends detached probe bounds and ordered palm points without world object lookup',()=>{
 const audio=new Audio(),scope=new Scope('numeric.island');
 const bounds={holdBox:{x:12,z:-4,r:8,yMin:-3,yMax:6},caveBox:{x:20,z:25,r:5,yMin:0,yMax:10}},palms=[{x:1,z:2},{x:-4,z:6}];
 const ambience=new DeclaredAmbience(island,{audio,scope,heightAt:()=>0,sea:0,bounds,near:{palms},owners:{wind:{uTime:{value:0},uWindStrength:{value:0}},cove:{fall:{foot:[127.5,18]},cave:{x:16,z:22,yaw:.7,depth:9}}}},ObservedMix);
 try{
  const mix=ports();expect(mix.objects).toBeUndefined();expect(mix.bounds).toBe(bounds);expect(mix.bounds?.['holdBox']).toBe(bounds.holdBox);expect(mix.near?.['palms']).toBe(palms);
 }finally{ambience.dispose();scope.dispose();}
});
