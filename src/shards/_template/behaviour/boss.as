// Engine move/strike rows own motion; this source only handles admitted decisions.
import { Actor, Move, Strike, Timer, State, Params, Do, Read, Event } from './generated/templateBossDecision';
function beatSeconds():f64 { return State.phase==2?Params.secondBeat:Params.firstBeat; }
function action(swing:bool):void {
  const target=Read.nearestPlayer(Actor.boss);
  if(target!=0) { if(swing) Do.strike(Actor.boss,Strike.bump,target); else Do.move(Actor.boss,Move.approach,target); }
}
export function onStart():void {
  if(State.phase!=0) return;
  State.phase=1; State.swingNext=true; Do.encounterPhase(0); action(false); Do.timer(Timer.beat,beatSeconds());
}
export function onStop():void {
  Do.stop(Actor.boss); Do.timer(Timer.beat,0); State.phase=0; State.swingNext=true;
}
export function onThreshold(index:i32):void {
  if(i32(Event.subject)!=Actor.boss || index!=1 || State.phase!=1) return;
  State.phase=2; Do.encounterPhase(1); Do.timer(Timer.beat,beatSeconds());
}
export function onDeath(killer:i32):void {
  if(i32(Event.subject)!=Actor.boss || (State.phase!=1 && State.phase!=2)) return;
  Do.stop(Actor.boss); Do.timer(Timer.beat,0); State.phase=3; Do.encounterWin();
}
export function onTimer(timer:i32):void {
  if(timer!=Timer.beat || (State.phase!=1 && State.phase!=2)) return;
  action(State.swingNext); State.swingNext=!State.swingNext; Do.timer(Timer.beat,beatSeconds());
}
