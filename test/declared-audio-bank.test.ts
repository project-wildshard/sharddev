import { installAssetFixture } from './fixtures/bootSetup';
import {expect,it,vi} from 'vitest';
import {Vector3} from 'three';
import {Scope} from '@wildshard/engine/app/scope';
import {app} from '@wildshard/engine/app/runtime';
import {parseAudioData} from '@wildshard/format/audio';
import {installDeclaredAudio} from '@wildshard/engine/audio/declared';
import {DeclaredSoundBank,declaredCatalogue,declaredVoiceTable,type DeclaredBankAudio} from '@wildshard/engine/audio/declaredBank';
import {CueCatalogue} from '@wildshard/engine/audio/Cues';
import {impact,renderPcm} from '@wildshard/engine/audio/gen';
import {createCueRouter} from '@wildshard/engine/audio/cueRouting';
import {tap} from '@wildshard/engine/core/harnessTap';
import pineSource from '../src/shards/pine-hollow/data/audioSource.json' with {type:'json'};
import islandSource from '../src/shards/driftwood-isle/data/audioSource.json' with {type:'json'};

await installAssetFixture();

const pine=parseAudioData(pineSource.audio),island=parseAudioData(islandSource.audio);
function nativeAudio(){
 const play=vi.fn<ReturnType<DeclaredBankAudio['voices']['playback']>['play']>(()=>true),register=vi.fn<DeclaredBankAudio['voices']['register']>(()=>()=>{/* native removal */}),shot=vi.fn<DeclaredBankAudio['shot']>(()=>false),phrase=vi.fn<DeclaredBankAudio['playPhrase']>();
 const audio:DeclaredBankAudio={ready:true,listenerYaw:0,ambient:{} as GainNode,shot,playPhrase:phrase,
  voices:{register,prewarm:vi.fn<DeclaredBankAudio['voices']['prewarm']>(),playback:()=>({play,value:()=>0,listener:vi.fn<ReturnType<DeclaredBankAudio['voices']['playback']>['listener']>()})}};
 return {audio,play,register,shot,phrase};
}
it('builds byte-identical procedural variants and refuses missing recipes before pool mutation',()=>{
 const table=declaredVoiceTable(island);
 const expected=['impact-shell','vocal-boar','vocal-crab','vocal-monkey','vocal-sailor','windup-boar','windup-crab','windup-sailor'];
 expect(Object.keys(table)).toEqual(expected);
 for(const id of expected){
  const family=table[id];if(family===undefined||!('gen' in family))throw new Error('Missing procedural family');
  const program=island.pcm?.[id.replace('-','.')];
  expect(family.n).toBe(id.startsWith('vocal')?3:id.startsWith('windup')?2:4);
  expect(family.half).toBe(id==='vocal-boar'||id.endsWith('sailor'));
  for(let seed=1;seed<=family.n;seed++){
   const old=id==='impact-shell'?impact('shell',8000,seed):program===undefined?undefined:renderPcm(program,8000,seed);
   expect(family.gen(8000,seed,0)).toEqual(old);
  }
 }
 const {audio,register}=nativeAudio(),scope=new Scope('audio.test');
 expect(()=>installDeclaredAudio({...island,pcm:{}},{audio,scope},'voices')).toThrow('Missing PCM');
 expect(register).not.toHaveBeenCalled();scope.dispose();
 expect(()=>parseAudioData({...island,pcm:{}})).toThrow('declared voice bank');
});
it('routes native playback with the same defaults, heavy branch, point references and water direction',()=>{
 const {audio,play}=nativeAudio(),scope=new Scope('audio.test');
 const bank=installDeclaredAudio(island,{audio,scope},'voices');
 const player={position:{x:1,y:2,z:3},yaw:.4};
 const cue=createCueRouter(island.routing.filter(row=>row.bus==='audio'),{voices:new Map(),bindings:island.voiceBindings,
  owners:new Map<string,object>([['sfx',bank],['playback',bank.playback],['listener',player]])});
 const point=new Vector3(1,2,3);
 expect(cue('cue.weapon.fire',{dir:-1})).toBe(true);
 expect(play).toHaveBeenLastCalledWith('whoosh',{speed:1,dir:-1});
 cue('cue.weapon.fire',{dir:1,heavy:true,speed:.85});expect(play).toHaveBeenLastCalledWith('heavy',{speed:.85,dir:1});
 cue('cue.hit.shell',{point,strength:.7});expect(play).toHaveBeenLastCalledWith('impact',{material:'shell',strength:.7},{at:point});
 expect(play.mock.lastCall?.[2]?.at).toBe(point);
 cue('cue.player.dive',{});expect(play).toHaveBeenLastCalledWith('plunge',{direction:'down',up:false});
 scope.dispose();expect(()=>installDeclaredAudio(island,{audio,scope},'voices')).toThrow('disposed');
});
it('keeps the positional sample-first boundary, inclusive range, taps and native phrase',()=>{
 const {audio,shot,phrase}=nativeAudio(),scope=new Scope('audio.test');
 const bank=installDeclaredAudio(island,{audio,scope},'voices'),sound=vi.fn<NonNullable<typeof tap.sound>>();
 const previous=tap.sound;tap.sound=sound;
 try{
  const listener={x:0,y:0,z:0};bank.spatial('gull',{x:14,y:0,z:0},listener);
  const options={pan:.8,gain:2**-1.3};
  expect(shot).toHaveBeenCalledWith('gull',{...options,out:audio.ambient});
  expect(phrase).toHaveBeenCalledWith(island.synth?.['gull'],audio.ambient,options);
  expect(sound.mock.calls).toEqual([['gullCallAt'],['gullCall']]);
  phrase.mockClear();shot.mockReturnValue(true);bank.spatial('gull',{x:160,y:0,z:0},listener);expect(phrase).not.toHaveBeenCalled();
  shot.mockClear();bank.spatial('gull',{x:160.001,y:0,z:0},listener);expect(shot).not.toHaveBeenCalled();
 }finally{tap.sound=previous;scope.dispose();}
});
it('selects decoded bark families in order with the same cosmetic draw and no immediate repeat',()=>{
 const {audio,play}=nativeAudio(),scope=new Scope('audio.test');
 const bank=installDeclaredAudio(pine,{audio,scope},'voices'),catalogue=bank.catalogue;
 vi.spyOn(catalogue,'clips').mockReturnValue([]);
 vi.spyOn(bank,'barks').mockReturnValue(['bark-test-a','bark-test-b','bark-test-c']);
 const draw=vi.spyOn(app.rng.stream('cosmetic'),'int').mockReturnValue(0),at={x:1,y:2,z:3};
 expect(bank.bark('test',at)).toBe(true);expect(play).toHaveBeenLastCalledWith('shot',{family:'bark-test-a'},{at,gain:.8});
 expect(bank.bark('test',at)).toBe(true);expect(play).toHaveBeenLastCalledWith('shot',{family:'bark-test-b'},{at,gain:.8});
 expect(draw.mock.calls).toEqual([[0,2],[0,1]]);
 bank.shot('leverDry');expect(play).toHaveBeenLastCalledWith('shot',{family:'leverDry'},{});
 scope.dispose();
});

it('keeps shared sprite slices until the last playback scope retires',async()=>{
 const tables=await import('@wildshard/engine/boot/tables');
 const preload=await import('@wildshard/engine/audio/preload');
 const {pcmBuffer}=await import('./engine/audio/pcm-buffer');
 const buffer=pcmBuffer(48000),set='catalogue-lifetime-fixture';
 const manifest=vi.spyOn(tables,'sfxManifests').mockReturnValue({[set]:{
  sprite:{file:'shots.m4a',clips:{take:[.1,.2]}},oneshots:{shot:{files:['take'],gain:.7}}
 }});
 const bytes=vi.spyOn(tables,'publicBytes').mockReturnValue({[`/assets/sfx/${set}/shots.m4a`]:1});
 const decode=vi.spyOn(preload,'decodeBytes').mockResolvedValue(buffer);
 try{
  const row={set,tolerance:.05,arrayFamilies:false,familyGain:true,loopGain:1};
  const read=():Promise<ArrayBuffer>=>Promise.resolve(new ArrayBuffer(1));
  if(pine.bank===undefined)throw new Error('Missing fixture bank');
  const rows={...pine,bank:{...pine.bank,catalogue:row}},a=new Scope('catalogue.a'),b=new Scope('catalogue.b');
  const {audio}=nativeAudio(),first=new DeclaredSoundBank(audio,rows,a),second=new DeclaredSoundBank(audio,rows,b);
  const boot=declaredCatalogue(row,read);await boot.decodeShots();
  const clips=boot.clips('shot');
  expect(first.catalogue.clips('shot')).toBe(clips);expect(second.catalogue.clips('shot')).toBe(clips);
  expect(clips).toEqual([{buffer,offset:.1,duration:.2,gain:.7}]);
  const owned=new CueCatalogue(set,read,preload.decodeBytes),loan=await owned.decodeAll();
  expect(loan.shots.size).toBe(1);owned.dispose();expect(loan.shots.size).toBe(0);
  a.dispose();expect(first.catalogue.clips('shot')).toBeUndefined();
  expect(second.catalogue.clips('shot')).toBe(clips);expect(boot.clips('shot')).toBe(clips);
  b.dispose();expect(boot.clips('shot')).toBeUndefined();
  expect(second.catalogue.decoded).toEqual([]);expect(second.catalogue.available).toBe(false);
  first.prewarm(['shot']);second.prewarm(['shot']);expect(decode).toHaveBeenCalledTimes(2);
  expect(declaredCatalogue(row,read).clips('shot')).toBeUndefined();
  let finish:(value:ArrayBuffer)=>void=()=>{throw new Error('Decode fixture not ready');};
  const delayed=new Promise<ArrayBuffer>(resolve=>{finish=resolve;}),pending=declaredCatalogue(row,()=>delayed),observer=declaredCatalogue(row,read);
  const lateScope=new Scope('catalogue.late'),lateBank=new DeclaredSoundBank(audio,rows,lateScope);
  const work=pending.decodeShots();lateScope.dispose();finish(new ArrayBuffer(1));await work;
  expect(observer.clips('shot')).toBeUndefined();expect(lateBank.catalogue.decoded).toEqual([]);
 }finally{manifest.mockRestore();bytes.mockRestore();decode.mockRestore();}
});
