// The Barrow Warden (MH-4, TC-M3; on Mossgate since TEMPLATE-E2E TR-12b; three phases since MOSSGATE-ZONE MZ20). Each beat
// is one blow, told before it lands by its own shared field: the slam fills the ember ring round its feet, the sweep the
// wider dust ring, and the thrown stone (from phase 2) rises over its head while it turns to the nearest player. Then its
// core opens to the sword. Phase 2 (60% health) beats faster and throws; phase 3 (30%) faster still, and the encounter
// calls its four crawlers out (fights.ts lists them on the phase). Engine strike rows own the contact; this source only
// paces the beats, drives the tell and core fields and the encounter guard (TE-ENG1). The Warden never walks, so the
// rings and the core over the arena's centre (play.ts) stay on it.
// guard: 0 every hit, 1 none, 2 melee only (the sword), 3 the rest only.
// phase: 0 fresh, 1 to 3 the fight's phases, 4 fallen.
import { Actor, Strike, Field, Timer, State, Params, Do, Read, Event } from './generated/mossgateWardenDecision';
function beatSeconds():f64 { return State.phase==3?Params.thirdBeat:State.phase==2?Params.secondBeat:Params.firstBeat; }
function tellsDown():void { Do.field(0,Field.tell,0); Do.field(0,Field.sweep,0); Do.field(0,Field.stone,0); }
function quiet():void { tellsDown(); Do.field(0,Field.core,0); Do.timer(Timer.arm,0); Do.timer(Timer.beat,0); Do.timer(Timer.open,0); Do.timer(Timer.shut,0); }
function fighting():bool { return State.phase>=1 && State.phase<=3; }
// One blow at the nearest player, its tell raised, the core shut; the core opens once the windup is through.
function strike(which:i32, tell:i32):void {
  Do.field(0,tell,1); Do.encounter(4,1);
  const target=Read.nearestPlayer(Actor.boss);
  if(target!=0) Do.strike(Actor.boss,which,target);
  Do.timer(Timer.open,Params.windup);
}
// Strike on the current beat, then move on: a fight opens with the slam (the quest hint's tell), then the sweep; from
// phase 2 the stone follows them.
function next():void {
  const beat=State.beat;
  State.beat=(beat+1)%(State.phase>=2?3:2);
  if(beat==0) strike(Strike.slam,Field.tell); else if(beat==1) strike(Strike.sweep,Field.sweep); else strike(Strike.stone,Field.stone);
}
// A phase change (the encounter's beat) stops and restarts the decision, and a retry restarts it at its checkpoint, so a
// start resumes from the Warden's health rather than from phase 0 (a reset to 0 replays the threshold beat forever).
export function onStart():void {
  if(State.phase==4) return;
  // a fresh Warden (phase 0: re-armed after its respawn) puts the Hollow's relit glow out until it falls again (MZ31)
  if(State.phase==0) { Do.encounterPhase(0); Do.field(0,Field.relit,0); }
  // 0.6 and 0.3: the second and third phases' `at` (generators/fights.ts ENCOUNTER_ROWS)
  const share=Read.hpShare(Actor.boss);
  State.phase=share>0.6?1:share>0.3?2:3;
  if(State.beat>=(State.phase>=2?3:2)) State.beat=0;
  Do.timer(Timer.arm,0.1); Do.timer(Timer.beat,beatSeconds());
}
export function onStop():void {
  Do.stop(Actor.boss); quiet(); Do.encounter(4,0);
}
export function onThreshold(index:i32):void {
  if(i32(Event.subject)!=Actor.boss) return;
  if(index==1 && State.phase==1) { State.phase=2; Do.encounterPhase(1); }
  else if(index==2 && (State.phase==1 || State.phase==2)) { State.phase=3; Do.encounterPhase(2); }
}
export function onDeath(killer:i32):void {
  if(i32(Event.subject)!=Actor.boss || !fighting()) return;
  Do.stop(Actor.boss); quiet(); State.phase=4; Do.encounterWin();
  // MZ31: the chain's climax: the Hollow relights (play.ts `hollowRelit`), and its trail leads back to the Lamplighter
  Do.field(0,Field.relit,1);
}
export function onTimer(timer:i32):void {
  if(!fighting()) return;
  if(timer==Timer.arm) Do.encounter(4,1); // the fight's start resets the guard to open, so shut it a beat later
  else if(timer==Timer.beat) next();
  else if(timer==Timer.open) { tellsDown(); Do.field(0,Field.core,1); Do.encounter(4,2); Do.timer(Timer.shut,Params.window); }
  else if(timer==Timer.shut) { Do.field(0,Field.core,0); Do.encounter(4,1); Do.timer(Timer.beat,beatSeconds()); }
}
