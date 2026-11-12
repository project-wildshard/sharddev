// The Barrow Warden (MH-4): a slam with a ground-ring tell, then its core opens to the sword. Engine strike rows own the
// contact; this source only drives the tell and core shared fields and the encounter guard (TE-ENG1, engine 9e4bf0d6).
// The Warden never moves, so the ring and core particles at the arena's centre stay on it.
// guard: 0 every hit, 1 none, 2 melee only (the sword), 3 the rest only.
import { Actor, Strike, Field, Timer, State, Params, Do, Read, Event } from './generated/templateBossDecision';
function beatSeconds():f64 { return State.phase==2?Params.secondBeat:Params.firstBeat; }
function quiet():void { Do.field(0,Field.tell,0); Do.field(0,Field.core,0); Do.timer(Timer.arm,0); Do.timer(Timer.beat,0); Do.timer(Timer.open,0); Do.timer(Timer.shut,0); }
function slam():void {
  Do.field(0,Field.tell,1); Do.encounter(4,1);
  const target=Read.nearestPlayer(Actor.boss);
  if(target!=0) Do.strike(Actor.boss,Strike.slam,target);
  Do.timer(Timer.open,Params.windup);
}
// A phase change (the encounter's beat) stops and restarts the decision, and a retry restarts it at its checkpoint, so a
// start resumes from the Warden's health rather than from phase 0 (a reset to 0 replays the threshold beat forever).
export function onStart():void {
  if(State.phase==3) return;
  if(State.phase==0) Do.encounterPhase(0);
  State.phase=Read.hpShare(Actor.boss)>0.6?1:2; // 0.6: the second phase's `at` in encounters.json
  Do.timer(Timer.arm,0.1); Do.timer(Timer.beat,beatSeconds());
}
export function onStop():void {
  Do.stop(Actor.boss); quiet(); Do.encounter(4,0);
}
export function onThreshold(index:i32):void {
  if(i32(Event.subject)!=Actor.boss || index!=1 || State.phase!=1) return;
  State.phase=2; Do.encounterPhase(1);
}
export function onDeath(killer:i32):void {
  if(i32(Event.subject)!=Actor.boss || (State.phase!=1 && State.phase!=2)) return;
  Do.stop(Actor.boss); quiet(); State.phase=3; Do.encounterWin();
}
export function onTimer(timer:i32):void {
  if(State.phase!=1 && State.phase!=2) return;
  if(timer==Timer.arm) Do.encounter(4,1); // the fight's start resets the guard to open, so shut it a beat later
  else if(timer==Timer.beat) slam();
  else if(timer==Timer.open) { Do.field(0,Field.tell,0); Do.field(0,Field.core,1); Do.encounter(4,2); Do.timer(Timer.shut,Params.window); }
  else if(timer==Timer.shut) { Do.field(0,Field.core,0); Do.encounter(4,1); Do.timer(Timer.beat,beatSeconds()); }
}
