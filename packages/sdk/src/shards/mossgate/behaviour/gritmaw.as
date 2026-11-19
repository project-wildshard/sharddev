// MOSSGATE-ZONE MZ15: Gritmaw, the Old Quarry's elite. Each beat its tell rises (the ring of grit round its feet, the
// `tell` shared field), it strikes the nearest player (the slam, then the quake round its feet, by turns), and the ring
// falls as the blow lands. Engine strike rows own the contact; this source only paces the beats and drives the tell.
import { Actor, Strike, Field, Timer, State, Params, Do, Read, Event } from './generated/mossgateGritmawDecision';
function quiet():void { Do.field(0,Field.tell,0); Do.timer(Timer.beat,0); Do.timer(Timer.land,0); }
export function onStart():void {
  State.awake=true; State.beat=0;
  Do.timer(Timer.beat,Params.firstBeat);
}
export function onStop():void {
  Do.stop(Actor.boss); quiet(); State.awake=false;
}
export function onDeath(killer:i32):void {
  if(i32(Event.subject)!=Actor.boss) return;
  Do.stop(Actor.boss); quiet(); State.awake=false;
}
export function onTimer(timer:i32):void {
  if(!State.awake) return;
  if(timer==Timer.beat) {
    Do.field(0,Field.tell,1);
    const target=Read.nearestPlayer(Actor.boss);
    if(target!=0) Do.strike(Actor.boss,State.beat==0?Strike.slam:Strike.quake,target);
    State.beat=(State.beat+1)%2;
    Do.timer(Timer.land,Params.windup);
  } else if(timer==Timer.land) {
    Do.field(0,Field.tell,0);
    Do.timer(Timer.beat,Params.rest);
  }
}
