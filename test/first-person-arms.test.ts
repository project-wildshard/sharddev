import {expect,it} from 'vitest';
import {armPalette,gloveFist,riderArm,riderArmSteps} from '../src/client/engine/player/firstPersonArms';
import base from '../src/shards/nalati-grasslands/data/armsStyle.json' with {type:'json'};
import {HUNTER_HANDS} from '../src/shards/pine-hollow/generators/handsLook';

it('keeps real shard styles independent across interleaved geometry builds',()=>{
 const hunter={...base,...HUNTER_HANDS.palette};
 const first=gloveFist(base,{R:.017}),other=gloveFist(hunter,{R:.017}),again=gloveFist(base,{R:.017});
 try{
  expect(again.geometry.getAttribute('color').array).toEqual(first.geometry.getAttribute('color').array);
  expect(other.geometry.getAttribute('color').array).not.toEqual(first.geometry.getAttribute('color').array);
  expect(other.geometry.getAttribute('position').array).toEqual(first.geometry.getAttribute('position').array);
 }finally{first.geometry.dispose();other.geometry.dispose();again.geometry.dispose();}
});

it('retains a stepped sleeve style when another bake runs between yields',()=>{
 const steps=riderArmSteps(base,.2,1);
 expect(steps.next().done).toBe(false);
 const other=armPalette({...base,...HUNTER_HANDS.palette});other.leather.setRGB(0,0,0);
 let step=steps.next();while(!step.done)step=steps.next();
 const direct=riderArm(base,.2,1);
 try{
  expect(step.value.getAttribute('position').array).toEqual(direct.getAttribute('position').array);
  expect(step.value.getAttribute('color').array).toEqual(direct.getAttribute('color').array);
 }finally{step.value.dispose();direct.dispose();}
});
