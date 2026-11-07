import {weatherWitness as weatherScript} from './fixtures/weatherInlineWitness';
import { bindFlatTerrain } from '@wildshard/engine/test/terrain';
import { expect, test } from 'vitest';
import type { SystemSpec } from '../src/client/engine/app/systems';
import { WeatherContinuation } from '../src/shared/engine/world/weatherContinuation';
import { parseWeatherProgram } from '@wildshard/format/weatherProgram';
import { encodeCanonicalJson, hashImmutableBytes } from '../src/sdk/immutable';
import { installWeatherReactions, nativeWeatherBundle } from '../src/server/game/weather/reactions';
import { installWeatherContinuation } from '../src/server/game/weather/continuation';
import { Scope } from '../src/shared/engine/app/scope';
import nalati from '../src/shards/nalati-grasslands/data/weather.json' with {type:'json'};
import pine from '../src/shards/pine-hollow/data/weather.json' with { type:'json' };
import saved from './fixtures/weather-continuation.json' with { type:'json' };
import frozen from './fixtures/legacy-oracles/pine-weather.json' with { type:'json' };

const rows=parseWeatherProgram(pine);
/** Nalati's storm as its page installs it: the bundle's reactions on a plain continuation, struck at `points`. */
function steppeStorm(seed:number,points:[number,number,number][],circles:[number,number,number][],scope:Scope){
  const bundle=nativeWeatherBundle({weather:nalati,reactions:weatherScript},circles);
  return installWeatherReactions(installWeatherContinuation({seed},bundle.weather,{phase:0},undefined),{...bundle.reactions,points},{scope});
}
test('DATA weather preserves phase RNG, every numeric output and held-mode transitions',()=>{
  // The retired PineWeather's 2400 captures per case, frozen in fixtures/legacy-oracles/pine-weather.json: exact samples, then a hash of all.
  const cases=frozen.cases[Symbol.iterator]();
  for(const seed of [1,0x4a1a])for(const mode of ['live','rain','clear','fog'] as const){
    const oracle=cases.next().value;
    if(oracle===undefined)throw new Error('Missing frozen weather case');
    expect({seed:oracle.seed,mode:oracle.mode}).toEqual({seed,mode});
    const current=new WeatherContinuation(rows,{seed,mode}),trace:unknown[]=[],samples=new Map(oracle.samples.map(row=>[row.step,row.weather]));
    for(let i=0;i<2400;i++){
      const dt=i%11===0?31:(i%7+1)/120,phase=(i/239)%1;
      current.update(dt,phase);
      const weather=current.captureWeather();trace.push(weather);
      if(samples.has(i))expect(weather).toEqual(samples.get(i));
      if(i===987)current.force('rain');
      if(i===1234)current.setMode('live');
    }
    expect(hashImmutableBytes(new TextEncoder().encode(encodeCanonicalJson(trace)))).toBe(oracle.sha256);
  }
});
test('old v1 cadence/wind saves resume exactly and malformed restore is atomic',()=>{
  for(const entry of saved){
    const current=new WeatherContinuation(rows,{seed:entry.seed,mode:entry.mode}),identity=current.gust?.current;
    current.prepareContinuationRestore(entry.saved)();
    expect(current.captureContinuation()).toEqual(entry.saved);
    for(let i=0;i<entry.tail.length;i++){
      current.step((i%5+1)/60,(i/13)%1);expect(current.captureContinuation()).toEqual(entry.tail[i]);
    }
    for(const bad of [{...entry.saved,boost:2},{...entry.saved,wind:{...entry.saved.wind,time:0}},
      {...entry.saved,weather:{...entry.saved.weather,n:{rain:0}}}]){
      const before=current.captureContinuation();expect(()=>current.prepareContinuationRestore(bad)).toThrow();
      expect(current.captureContinuation()).toEqual(before);expect(current.gust?.current).toBe(identity);
    }
  }
});
test('Nalati runs its reactions at ten Hz on one phase owner and snapshots them whole',()=>{
  const restore=bindFlatTerrain({heightAt:()=>0});
  try {
    const scope=new Scope('weather-test'),current=steppeStorm(7,[],[[1,2,3]],scope);
    Object.assign(current.inputs,{px:1,py:0,pz:2,calmSpeed:5,calmDir:0,calmGust:.6,crouched:0,mounted:0,held:0});
    current.weather.force('storm',.4);current.weather.hold=true;
    const phases=current.weather;let ticks=0;
    for(let i=0;i<60;i++)if(current.update(1/60))ticks++;
    expect(ticks).toBeGreaterThanOrEqual(9);expect(ticks).toBeLessThanOrEqual(10);
    expect(current.weather).toBe(phases);expect(current.inputs['sheltered']).toBe(1);expect(current.register('low')).toBe(0);
    const checkpoint=current.snapshot();current.update(.1);current.restore(checkpoint);
    expect(current.snapshot()).toEqual(checkpoint);scope.dispose();
  } finally {restore();}
});
test('Nalati strikes the highest probed point and lands it 1.2 s later',()=>{
  const restore=bindFlatTerrain({heightAt:()=>0});
  try {
    const scope=new Scope('weather-test'),points=Array.from({length:63*63},(_,i):[number,number,number]=>[(i%63)*8-248,Math.floor(i/63)*8-248,50]);
    const current=steppeStorm(19,points,[],scope);
    Object.assign(current.inputs,{px:0,py:0,pz:0,calmSpeed:5,calmDir:0,calmGust:.6,crouched:0,mounted:0,held:0});
    current.weather.force('storm',.4);current.weather.hold=true;current.weather.registers['nextBolt']=0;
    const telegraphs:Record<string,number>[]=[],strikes:Record<string,number>[]=[];
    current.on('telegraph',e=>{telegraphs.push({...e});});current.on('strike',e=>{strikes.push({...e});});
    for(let i=0;i<10&&telegraphs.length===0;i++)current.update(.1);
    expect(telegraphs).toHaveLength(1);expect(telegraphs[0]?.['kind']).toBe(1);expect(telegraphs[0]?.['y']).toBe(50);
    for(let i=0;i<13;i++)current.update(.1);
    expect(strikes).toHaveLength(1);expect(strikes[0]).toMatchObject({x:telegraphs[0]?.['x'],kind:1});expect(current.register('armed')).toBe(0);
    scope.dispose();
  } finally {restore();}
});
test('weather programs refuse incomplete phases, outputs and unbounded expressions',()=>{
  expect(()=>parseWeatherProgram({...pine,next:{clear:'missing'}})).toThrow();
  expect(()=>parseWeatherProgram({...pine,outputs:{rain:1}})).toThrow();
  expect(()=>parseWeatherProgram({...pine,values:[['rain','later']]})).toThrow();
  expect(()=>parseWeatherProgram({...pine,values:[['t',1]]})).toThrow();
  expect(()=>parseWeatherProgram({...pine,values:[['bad',['ss',0,1]]]})).toThrow();
});

test('page installer keeps the declared system, clock and pause owner',()=>{
  const systems:SystemSpec[]=[],state={paused:false},day={phase:.25};
  const weather=installWeatherContinuation({seed:31,system:spec=>{systems.push(spec);},state},rows,day,'live');
  const original=new WeatherContinuation(rows,{seed:31,mode:'live'}),system=systems[0];
  expect(system).toMatchObject({...rows.page,phase:'update'});
  if(system===undefined)throw new Error('Missing installed page system');
  for(let i=0;i<120;i++){
    day.phase=i/120;state.paused=i%7===0;
    system.run(.5,i*.5);if(!state.paused)original.update(.5,day.phase);
    expect(weather.captureWeather()).toEqual(original.captureWeather());
    expect(weather.registers).toEqual(original.registers);
  }
});

test('action rows refuse undeclared registers and inputs before consuming RNG',()=>{
  for(const actions of [
    {tick:[{target:'missing',value:0}]},
    {tick:[{target:'boost',value:'register.missing'}]},
    {tick:[{target:'boost',when:'clock',value:0}]},
    {tick:[{target:'boost',value:{range:[0,'missing']}}]},
    {tick:Array.from({length:65},()=>({target:'boost',value:0}))},
  ])expect(()=>parseWeatherProgram({...pine,actions})).toThrow();
  expect(()=>parseWeatherProgram({...pine,outputs:{...pine.outputs,wind:'register.boost'}})).toThrow();
});
