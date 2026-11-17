import { Signal, Field, Channel, Read, Do, Params } from './generated/practiceCourse';
@inline function f(id:i32):f64 { return Read.field(0,id); }
@inline function pad(index:i32,field:i32):f64 { return f(Field.pad00Depth+index*10+field); }
const DEPTH:i32=0,ELIGIBLE:i32=1,PITCH:i32=2,START_PITCH:i32=3,START_YAW:i32=4,TOP:i32=5,WIDTH:i32=6,X:i32=7,YAW:i32=8,Z:i32=9;
function place(index:i32,atStart:bool):void {
  Do.channel(Channel.spawnX,pad(index,X));Do.channel(Channel.spawnZ,pad(index,Z)+(atStart?pad(index,DEPTH)/2-3:0));
  Do.channel(Channel.spawnY,pad(index,TOP));Do.channel(Channel.spawnYaw,pad(index,atStart?START_YAW:YAW));Do.channel(Channel.spawnPitch,pad(index,atStart?START_PITCH:PITCH));
}
@inline function onPad(i:i32,x:f64,y:f64,z:f64):bool {
  return Math.abs(x-pad(i,X))<=pad(i,WIDTH)/2&&Math.abs(z-pad(i,Z))<=pad(i,DEPTH)/2&&Math.abs(y-pad(i,TOP))<0.35;
}
function currentPad(count:i32,x:f64,y:f64,z:f64):i32 {
  for(let i:i32=0;i<count;i+=2) { if(onPad(i,x,y,z))return i;if(i+1<count&&onPad(i+1,x,y,z))return i+1; }
  return -1;
}
/** Stateless course observations and poses. Native owners keep bodies, UI and cadence. */
export function onSignal(signal:i32,value:f64,source:i32):void {
  const reset=signal==Signal.reset||signal==Signal.courseReset||signal==Signal.restart;
  if(!reset&&signal!=Signal.step&&signal!=Signal.courseStep)return;
  const oval=Params.courseKind==0,legacy=signal==Signal.courseReset||signal==Signal.courseStep;
  let started=f(Field.started),best=f(Field.best),elapsed=oval?0:f(Field.elapsed),running=oval?f(Field.running):0,phase=oval?running:f(Field.phase);
  const now=f(legacy?Field.courseTime:Field.now),x=f(legacy?Field.courseX:Field.x),y=f(legacy?Field.courseY:Field.y),z=f(legacy?Field.courseZ:Field.z);
  if(Params.courseKind==0) {
    let lap=f(Field.lap),half=f(Field.half),last=f(Field.last),previous=f(Field.prevX),event=0.0;
    // Legacy course aliases carry exactly their original observations.
    const px=x;
    const pz=z;
    const py=y;
    const time=now;
    const mounted=signal==Signal.courseReset||signal==Signal.courseStep?f(Field.courseMounted):f(Field.mounted);
    if(reset) { lap=0;started=0;running=0;half=0;last=-1; }
    else {
      if(Math.abs(pz-Params.courseRadius)<Params.courseWidth/2+2&&previous<Params.courseLine&&px>=Params.courseLine&&mounted!=0) {
        if(running!=0&&half!=0) { last=time-started;best=best<0?last:Math.min(best,last);event=1; }
        running=1;half=0;lap++;started=time;
      }
      if(Math.abs(pz+Params.courseRadius)<Params.courseWidth/2+2&&previous>Params.courseLine&&px<=Params.courseLine&&running!=0&&half==0) {half=1;event=2;}
    }
    if(signal==Signal.restart) {
      Do.channel(Channel.spawnX,Params.resetX);Do.channel(Channel.spawnZ,Params.resetZ);Do.channel(Channel.spawnY,0);
      Do.channel(Channel.spawnYaw,Params.resetYaw);Do.channel(Channel.spawnPitch,Params.resetPitch);
    }
    Do.channel(Channel.lap,lap);Do.channel(Channel.half,half);Do.channel(Channel.last,last);
    Do.channel(Channel.prevX,signal==Signal.restart?Params.resetPrevX:px);
    Do.channel(Channel.courseEvent,event);Do.channel(Channel.courseFell,py<-12?1:0);
    phase=running;elapsed=0;
  } else {
    let checkpoint=f(Field.checkpoint),visited=i32(f(Field.visited)),finish=0.0,visit=-1.0;
    const count=i32(f(Field.padCount)),start=i32(f(Field.startPad));
    const at=!reset&&f(Field.grounded)!=0?currentPad(count,x,y,z):-1;
    if(reset) {phase=0;elapsed=0;checkpoint=start;visited=0;place(start,true);}
    else {
      if(at>=0) {checkpoint=at;if(pad(at,ELIGIBLE)!=0) {visit=at;visited|=i32(pad(at,ELIGIBLE));}}
      if(phase==0&&z<pad(start,Z)-pad(start,DEPTH)/2&&x>pad(start,X)-pad(start,WIDTH)/2-1) {phase=1;started=now;}
      if(phase==1) {elapsed=now-started;if(at==i32(f(Field.finishPad))) {phase=2;best=best<0?elapsed:Math.min(best,elapsed);finish=1;}}
    }
    const fell=!reset&&y<f(Field.lowest)-f(Field.fallY);if(fell)place(i32(checkpoint),checkpoint==start);
    Do.channel(Channel.checkpoint,checkpoint);Do.channel(Channel.visited,visited);Do.channel(Channel.visit,visit);Do.channel(Channel.reached,i32.popcnt(visited));
    Do.channel(Channel.finish,finish);Do.channel(Channel.pad,at);Do.channel(Channel.fell,fell?1:0);running=phase==1?1:0;
  }
  Do.channel(Channel.phase,phase);Do.channel(Channel.elapsed,elapsed);Do.channel(Channel.running,running);
  Do.channel(Channel.started,started);Do.channel(Channel.best,best);
}
