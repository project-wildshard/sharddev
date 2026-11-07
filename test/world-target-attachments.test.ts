// @vitest-environment happy-dom
// oxlint-disable-next-line import/no-nodejs-modules -- The native attachment proof uses the shipped physics binary.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import * as v from 'valibot';
import { Vector3 } from 'three';
import { Flags } from '../src/shared/engine/world/interact/flags';
import { createSimHost, type SimHost } from '../src/server/engine/sim';
import { loadRapier } from '../src/shared/engine/physics/rapier';
import { snapshotSimHost, serializeSimSnapshot } from '../src/shared/engine/sim/snapshot';
import { restoreSimHost } from '../src/server/engine/sim/restore';
import { parseWorldTargets } from '@wildshard/format/worldTargets';
import { parseInteractionRows } from '@wildshard/format/questInteractions';
import { InteractionRules, installInteractionRows } from '../src/shared/game/quest/interactionRows';
import { bindQuestPageInteractions } from '../src/client/game/plugin/ui';
import { BladeMoves } from '../src/client/game/plugin/bladeMoves';
import { bindNativeWorldTargets, installNativeMelee, type NativeRuntimeEffect, type NativeMeleeInput } from '../src/server/game/plugin/simulation';
import { TickEffectSchema, TickCommitSchema } from '../src/sdk/tickProtocol';
import { WHIP_CONTACT_MOVES } from '../src/shards/sunscar-dunes/generators/rows/whipContacts';
import { SIGNAL_MELEE_HOST } from '../src/shards/sunscar-dunes/generators/rows/nativeMelee';
import { FAN_CONTACTS } from '../src/shards/far-reach/generators/rows/fanContacts';
import { SKY_MELEE_HOST } from '../src/shards/far-reach/generators/rows/nativeMelee';
import { SIM_LEVEL } from './fixtures/sim-level/level';

const rapier = loadRapier(Uint8Array.from(readFileSync('public/assets/physics/rapier.wasm')));
const whip = 'weapon.sunscar-dunes.whip', fan = 'weapon.far-reach.fan';
const interactionRows = () => parseInteractionRows({ marks: [{id:'raised'}], rows: [
  {id:'crank',act:1,at:'crank',crack:'heavy',needs:[{none:['raised']}],sets:['raised']},
] });
const rayTargets = () => parseWorldTargets({ targets: [{id:'crank',weapon:whip,at:[0,1.68,-4],radius:.8,
  needs:{none:['raised']},scan:{kind:'ray',selection:'nearest'},rules:[
    {move:'sunscar.whip.crack',contact:0,effects:[{kind:'hint',text:'Pull'}],caught:'always'},
    {move:'sunscar.whip.double.1',contact:0,effects:[],caught:'always'},
    {move:'sunscar.whip.double.2',contact:1,effects:[{kind:'interaction',id:'crank'}],caught:'if-applied'},
  ]}],spots:[] });
const pageSource = () => ({actions:[{id:'pull-visible',interaction:'crank',after:[{kind:'visible',target:'bucket',value:true}]}]});

test('page attachment uses actual marks and aliased action presentation on the existing timed landing',()=>{
  const flags=new Flags('page-target-binding',false), bucket={visible:false}, hints:string[]=[], caught:boolean[]=[];
  const page=bindQuestPageInteractions(pageSource(),{flags,interactions:interactionRows(),visible:new Map([['bucket',bucket]]),toast:text=>{hints.push(text);}},rayTargets());
  const family=new BladeMoves(whip,WHIP_CONTACT_MOVES,{hit:()=>null,fired:()=>undefined,struck:()=>undefined,
    aim:(from,dir)=>{from.set(0,1.68,0);dir.set(0,0,-1);return true;},caught:(_target,second)=>{caught.push(second);}});
  page.bindWorldTargets(family);
  family.swing(0);family.advance(.12);expect(hints).toEqual(['Pull']);expect(bucket.visible).toBe(false);
  family.cancel();family.cool(1);family.swing(1);family.advance(.12);
  expect(bucket.visible).toBe(false);expect(caught).toEqual([false,false]);
  family.advance(.2);expect(bucket.visible).toBe(true);expect(caught).toEqual([false,false,true]);
  expect(page.run('pull-visible')).toBe(false);
  family.land(1,1,new Vector3(0,1.68,0),new Vector3(0,0,-1));expect(caught).toHaveLength(3);
});

test('page binding refuses absent or ambiguously presented interactions before changing a view or installing contacts',()=>{
  const flags=new Flags('page-target-refusal',false), bucket={visible:false};
  const ports={flags,interactions:interactionRows(),visible:new Map([['bucket',bucket]]),toast:()=>undefined};
  const page=bindQuestPageInteractions(pageSource(),ports);
  const family=new BladeMoves(whip,WHIP_CONTACT_MOVES,{hit:()=>null,aim:()=>false,fired:()=>undefined,struck:()=>undefined,caught:()=>undefined});
  expect(()=>page.bindWorldTargets(family)).toThrow('Missing admitted world targets');
  expect(()=>bindQuestPageInteractions(pageSource(),ports,{targets:[],spots:[{id:'perch',at:[0,2,0],yaw:0}]}).bindWorldTargets(family)).toThrow('Missing admitted world targets');
  expect(()=>bindQuestPageInteractions({actions:[]},ports,rayTargets())).toThrow('Missing world target interaction');
  expect(()=>bindQuestPageInteractions({actions:[...pageSource().actions,{id:'second',interaction:'crank'}]},ports,rayTargets())).toThrow('Missing world target interaction');
  expect(bucket.visible).toBe(false);expect(flags.all).toEqual([]);
});

function nativeLash(host:SimHost,effects:NativeRuntimeEffect[],dispatch=true) {
  const rules=new InteractionRules(host.flags,interactionRows());
  const melee=installNativeMelee(host,{id:whip,contacts:WHIP_CONTACT_MOVES},SIGNAL_MELEE_HOST,{inputCommands:()=>[],worldActor:'quest',
    world:[{act:1,at:{x:0,y:1.68,z:-4},radius:.8,crack:'heavy'}]});
  installInteractionRows(host,rules,{actorId:'quest',stepId:'quest.targets',commands:()=>[],
    spots:{crank:{x:0,y:1.68,z:-4,radius:.8}},crack:{reach:{light:7,heavy:8},cracked:melee.cracked}});
  if(dispatch)bindNativeWorldTargets(host,melee,{rules,run:id=>rules.run(id)},rayTargets(),effect=>{effects.push(effect);});
  return {melee,rules};
}

test('native attachment resumes a legacy pending double contact on its original clock, without install replay',async()=>{
  const level={...SIM_LEVEL,entities:[]}, physics=await rapier, host=createSimHost(level,{rapier:physics}), effects:NativeRuntimeEffect[]=[];
  let resumed:SimHost|undefined;
  try {
    const live=nativeLash(host,effects,false);expect(effects).toEqual([]);
    live.melee.family.swing(1);for(let i=0;i<12;i++)host.step();
    expect(live.rules.has('raised')).toBe(false);const saved=snapshotSimHost(host);
    for(let i=0;i<12;i++)host.step();expect(live.rules.has('raised')).toBe(true);
    let restored:ReturnType<typeof nativeLash>|undefined;const resumedEffects:NativeRuntimeEffect[]=[];
    resumed=restoreSimHost(level,{rapier:physics},saved,fresh=>{restored=nativeLash(fresh,resumedEffects);});
    expect(resumedEffects).toEqual([]);expect(restored?.rules.has('raised')).toBe(false);
    for(let i=0;i<12;i++)resumed.step();expect(restored?.rules.has('raised')).toBe(true);
    expect(resumedEffects).toEqual(effects);
  } finally {host.dispose();resumed?.dispose();}
});

test('native hint effects carry real light-contact and fan flag outcomes through the bounded tick schema',async()=>{
  const host=createSimHost({...SIM_LEVEL,entities:[]},{rapier:await rapier}), effects:NativeRuntimeEffect[]=[];
  try {
    const lash=nativeLash(host,effects);lash.melee.family.swing(0);for(let i=0;i<9;i++)host.step();
    expect(effects).toEqual([{kind:'hint',text:'Pull'}]);expect(lash.rules.has('raised')).toBe(false);
    let commands:readonly NativeMeleeInput[]=[];
    const fanOwner=installNativeMelee(host,{id:fan,contacts:FAN_CONTACTS},SKY_MELEE_HOST,{inputCommands:()=>commands});
    const rules=new InteractionRules(host.flags,parseInteractionRows({marks:[],rows:[]}));
    host.flags.set('notes');
    bindNativeWorldTargets(host,fanOwner,{rules,run:id=>rules.run(id)},{targets:[{id:'vane',weapon:fan,at:[0,1.68,-5],radius:0,
      needs:{all:['notes'],none:['turned']},scan:{kind:'cone',reach:11,halfAngle:.75,selection:'all'},
      rules:[{move:'far.fan.gust',contact:0,effects:[{kind:'flag',id:'turned'},{kind:'hint',text:'A vane turns'}],caught:'if-applied'}]}],spots:[]},effect=>{effects.push(effect);});
    commands=[{kind:'script',actorId:'far.fan',value:2}];host.step();commands=[];
    expect(host.flags.has('turned')).toBe(true);expect(effects).toEqual([{kind:'hint',text:'Pull'},{kind:'hint',text:'A vane turns'}]);
    for(const effect of effects)expect(v.parse(TickEffectSchema,effect)).toEqual(effect);
    expect(v.parse(TickCommitSchema,{tick:host.state.tick,snapshot:serializeSimSnapshot(snapshotSimHost(host)),effects}).effects).toEqual(effects);
    expect(()=>v.parse(TickEffectSchema,{kind:'hint',text:'x'.repeat(4097)})).toThrow();
  } finally {host.dispose();}
});
