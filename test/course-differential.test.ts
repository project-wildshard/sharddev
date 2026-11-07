// oxlint-disable-next-line import/no-nodejs-modules -- Compile frozen predecessor laws as independent differential oracles.
import { readFileSync } from 'node:fs';
import { NALATI_KOKPAR } from './fixtures/nalati-kokpar';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { Vector3 } from 'three';
import { compileDecisionScripts } from '../src/sharddev/buildDecisionScripts';
import { parseDecisionScripts } from '@wildshard/format/decisionScripts';
import { ProjectedState, ReturnProgram } from '../src/shared/game/population/returnProgram';
import { NumericCourse } from '../src/client/game/practice/numericCourse';
import { Scope } from '../src/shared/engine/app/scope';
import type { PlaygroundHost } from '../src/client/engine/practice/playground/Playground';
import { horseCourseRows } from '../src/shards/nalati-grasslands/generators/courseScene';
import { ninePracticeRows as hookProgram, ninePracticeBytes } from './fixtures/nine-practice-product';
import { lendNinePractice } from './fixtures/nine-practice-modules';
import hookRows from '../src/shards/nine-dragon-stack/data/grappleCourse.json' with { type:'json' };
import { practiceFrame } from '../src/shards/nine-dragon-stack/generators/practiceFrame';
import { legacyDouble } from '@wildshard/engine/test/FakeGame';

const initial={lap:0,started:0,running:0,half:0,best:-1,last:-1,prevX:0,phase:0,elapsed:0,checkpoint:0,visited:0};
const horse=horseCourseRows(NALATI_KOKPAR.course);
const owners:Scope[]=[];afterEach(()=>{for(const owner of owners.splice(0))owner.dispose();});
function checkpoints(scope?:Scope):ReturnProgram {const owner=scope??new Scope('checkpoint differential');if(scope===undefined)owners.push(owner);lendNinePractice(owner);return ReturnProgram.page(hookProgram,owner);}
let ovalOracle:ReturnProgram,checkpointOracle:ReturnProgram;
async function original(input:{script:unknown;bytes:string},kind:'oval'|'checkpoints'):Promise<ReturnProgram> {
  const script=parseDecisionScripts([input.script])[0];if(script===undefined)throw new Error('Missing course script');
  let source=readFileSync(`test/fixtures/course-laws/${kind}.as`,'utf8')
    .replace('./generated/nalatiKokpar','./generated/practiceCourse').replace('./generated/ninePractice','./generated/practiceCourse');
  if(kind==='oval')source+='\nexport function onSignal(signal:i32,value:f64,source:i32):void {courseSignal(signal);}\n';
  const registry=(rows:Readonly<Record<string,string>>):Map<string,number>=>new Map(Object.values(rows).sort().map((name,index)=>[name,index+1]));
  const built=await compileDecisionScripts([script],{fields:registry(script.fields),channels:registry(script.channels),signals:registry(script.signals)},new Map([[script.source,source]]),{asLineCeiling:256,singleSignal:true});
  const row=built.rows[0],blob=built.blobs[0];if(row===undefined||blob===undefined)throw new Error('Missing original guest');
  const bytes=Array.from(blob.bytes,value=>String.fromCodePoint(value)).join('');
  return ReturnProgram.page({script:row,bytes:btoa(bytes)});
}
beforeAll(async()=>{ovalOracle=await original(horse.program,'oval');checkpointOracle=await original(hookProgram,'checkpoints');});
function same(actual:Readonly<Record<string,number>>,expected:Readonly<Record<string,number>>):void {
  for(const [key,value]of Object.entries(expected))expect(Object.is(actual[key],value),key).toBe(true);
}

test('shared oval law preserves every predecessor scalar over laps, falls, resets and seeded boundary samples',()=>{
  const old=new ProjectedState({initial:{lap:0,started:0,running:0,half:0,best:-1,last:-1,prevX:0}},ovalOracle),next=new ProjectedState({initial:{...initial}},ReturnProgram.page(horse.program));
  const x=horse.lineX,r=horse.oval.radius,w=horse.oval.width;
  const event=(signal:string,time:number,px:number,y:number,z:number,mounted:number):void=>{
    const frame={courseTime:time,courseX:px,courseY:y,courseZ:z,courseMounted:mounted};
    const a=old.event(signal,frame),b=next.event(signal,frame);same(b,a);same(next.state,old.state);
  };
  event('courseReset',0,x-1,0,r,0);event('courseStep',1,x+1,0,r,1);event('courseStep',5,x-1,0,-r,1);event('courseStep',10,x+1,0,r,1);
  let seed=991;for(let index=0;index<400;index++) {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const z=[r,-r,r+w/2+2,r-w/2-2,-0][seed%5]??r;
    event(index%47===0?'courseReset':'courseStep',11+index*.1,x+(seed%3)-1,index%31===0?-13:0,z,Number(index%7!==0));
  }
});

test('shared checkpoint law preserves all original edges, grounded probes, falls, finish and restart state',()=>{
  const old=new ProjectedState({initial:{...initial}},checkpointOracle),next=new ProjectedState({initial:{...initial}},checkpoints()),fixed=practiceFrame(hookRows);
  const event=(signal:string,now:number,x:number,y:number,z:number,grounded:number):void=>{
    const frame={...fixed,now,x,y,z,grounded},a=old.event(signal,frame),b=next.event(signal,frame);
    same(b,a);
    // The shared protocol adds running; all predecessor continuation fields stay exact.
    for(const key of ['phase','started','elapsed','best','checkpoint','visited'])expect(Object.is(next.state[key as keyof typeof initial],old.state[key as keyof typeof initial]),key).toBe(true);
  };
  event('reset',0,0,0,0,0);
  let time=1;for(const pad of hookRows.pads) {
    event('step',time++,pad.x,pad.top,pad.z,1);event('step',time++,pad.x+pad.w/2,pad.top+.349,pad.z,1);
    event('step',time++,pad.x+pad.w/2+.001,pad.top+.351,pad.z,1);event('step',time++,pad.x,-200,pad.z,0);
  }
  let seed=417;for(let index=0;index<250;index++){
    seed=(Math.imul(seed,1103515245)+12345)>>>0;const pad=hookRows.pads[seed%hookRows.pads.length];if(pad===undefined)throw new Error('Missing pad');
    event(index%43===0?'reset':'step',time++,pad.x+(seed%3)-1,index%11===0?-200:pad.top,pad.z,Number(index%9!==0));
  }
});

test('numeric presenter keeps original native reset coordinates, velocity policy and both cadence tolerances',()=>{
  const position=new Vector3(5,3000,8),velocity=new Vector3(1,2,3),spawn=vi.fn<PlaygroundHost['player']['spawn']>();
  const player=legacyDouble<PlaygroundHost['player']>({position,velocity,onGround:true,pitch:0,spawn});
  const host=legacyDouble<PlaygroundHost>({player}),scope=new Scope('real course native presenter');
  try {
    const origin={...horse.fieldAt,y:3000},run=new NumericCourse(host,origin,horse,ReturnProgram.page(horse.program,scope),()=>0);
    run.reset();const px=origin.x+horse.riderStart.x,pz=origin.z+horse.riderStart.z;
    const yaw=Math.atan2(-((origin.x+horse.horseStart.x)+horse.shoulder-px),-((origin.z+horse.horseStart.z)-pz));
    const args=spawn.mock.calls[0];if(args===undefined)throw new Error('No native reset');
    [px,pz,yaw,3000].forEach((value,index)=>{expect(Object.is(args[index],value)).toBe(true);});
    expect(Object.is(player.pitch,horse.riderPitch)).toBe(true);expect(velocity.toArray()).toEqual([1,2,3]);
    const hook=new NumericCourse(host,{x:11,y:3000,z:-9},{frame:practiceFrame(hookRows),sampleEpsilon:1e-9},checkpoints(scope.child('checkpoint room')),()=>0);
    hook.reset();expect(velocity.toArray()).toEqual([0,0,0]);
    const project=vi.spyOn(ReturnProgram.prototype,'project');try {
      for(let index=0;index<60;index++)run.step(1/60,{now:index/60,mounted:0});expect(project).toHaveBeenCalledTimes(8);
      project.mockClear();for(let index=0;index<60;index++)hook.step(1/60,{now:index/60});expect(project).toHaveBeenCalledTimes(10);
    }finally{project.mockRestore();}
  }finally{scope.dispose();}
});


test('both real courses use identical compiled code with separately admitted parameters',()=>{
  expect(Uint8Array.from(atob(horse.program.bytes),value=>value.codePointAt(0)??0)).toEqual(ninePracticeBytes);
  const scope=new Scope('two admitted rooms'),position=new Vector3(0,3000,0),player=legacyDouble<PlaygroundHost['player']>({position,velocity:new Vector3(),onGround:true,pitch:0,spawn:()=>undefined});
  const host=legacyDouble<PlaygroundHost>({player});
  try{
    const a=new NumericCourse(host,{...horse.fieldAt,y:3000},horse,ReturnProgram.page(horse.program,scope.child('oval')),()=>0);
    const b=new NumericCourse(host,{x:0,y:3000,z:0},{frame:practiceFrame(hookRows),sampleEpsilon:1e-9},checkpoints(scope.child('checkpoints')),()=>0);
    a.reset();b.reset();expect(a.state.running).toBe(0);expect(b.state.phase).toBe(0);
    expect(a.step(.1,{now:1,mounted:0})).toHaveProperty('courseFell');expect(b.step(.1,{now:1})).toHaveProperty('pad');
  }finally{scope.dispose();}
});

test('numeric course samples its explicit clock before cadence and keeps explicit frame overrides', () => {
  const player = legacyDouble<PlaygroundHost['player']>({ position: new Vector3(), velocity: new Vector3(), onGround: true, pitch: 0, spawn: () => undefined });
  const host = legacyDouble<PlaygroundHost>({ player }), scope = new Scope('owned course clock');
  let seconds = 10;
  const now = vi.fn(() => seconds);
  const project = vi.spyOn(ReturnProgram.prototype, 'project');
  try {
    const run = new NumericCourse(host, { ...horse.fieldAt, y: 3000 }, horse, ReturnProgram.page(horse.program, scope), now);
    run.reset();
    expect(now).toHaveBeenCalledTimes(1);
    run.step(0.04);
    expect(now).toHaveBeenCalledTimes(2);
    seconds = 10.06;
    run.step(0.06);
    expect(now).toHaveBeenCalledTimes(3);
    expect(project.mock.calls.at(-1)?.[1]['now']).toBe(10.06);
    run.step(0.1, { now: 42 });
    expect(now).toHaveBeenCalledTimes(3);
    expect(project.mock.calls.at(-1)?.[1]['now']).toBe(42);
  } finally { project.mockRestore(); scope.dispose(); }
});
