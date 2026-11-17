/** The ABI-v0 script prelude (meta SHARD-SOURCE AP27): a behaviour script's input slots, events and commands by name, so
 * no script reads or writes a literal address. `compileScript` hands it to the compiler as `wildshard.ts` for every ABI-v0
 * script (a script that does not import it compiles to the same bytes), unless the shard supplies its own `wildshard.ts`.
 * It is a source string so guest globals never enter the host TypeScript program. */
export const SCRIPT_PRELUDE: string = String.raw`
// The sdk's script prelude for ABI v0 (SHARD-SOURCE AP27): a behaviour script's input, events and commands by name, so
// no script reads or writes a literal address. Import its helpers from './wildshard'; the entry file re-exports the ABI:
//   export { abi_version, init, in_ptr, in_cap, out_ptr, out_cap, out_count } from './wildshard';
// The sdk hands this file to the compiler as 'wildshard.ts'; a shard's own 'wildshard.ts' source replaces it.
const IN: i32 = 16384, IN_CAP: i32 = 4096, OUT: i32 = 24576, OUT_CAP: i32 = 4, RECORD: i32 = 40;
let count: i32 = 0;
export function abi_version(): i32 { return 0; }
export function init(lo: i32, hi: i32): void {}
export function in_ptr(): i32 { return IN; }
export function in_cap(): i32 { return IN_CAP; }
export function out_ptr(): i32 { return OUT; }
/** Commands one call may write: four. */
export function out_cap(): i32 { return OUT_CAP; }
export function out_count(): i32 { return count; }
/** Start a call's commands over: the first line of 'on_tick'. */
export function begin(): void { count = 0; }

/** Input slot 'i' (0 to 31) as the host wrote it. */
@inline export function input(i: i32): f64 { assert(i >= 0 && i < 32); return load<f64>(IN + i * 8); }
/** The fixed tick, the seconds it covers, the actor's command, this entity's content handle, the actor's token, and
 *  the role (0 server, 1 client). */
@inline export function tick(): f64 { return input(0); }
@inline export function dt(): f64 { return input(1); }
@inline export function command(): f64 { return input(2); }
@inline export function self(): f64 { return input(3); }
@inline export function actor(): f64 { return input(4); }
@inline export function role(): f64 { return input(5); }
/** How many shared and player fields the shard declares. */
@inline export function sharedCount(): i32 { return i32(input(6)); }
@inline export function playerCount(): i32 { return i32(input(7)); }
/** Shared field 'index' (0 first), in the order 'state.shared' declares them. */
@inline export function shared(index: i32): f64 { assert(index >= 0 && index < sharedCount()); return input(8 + index); }
/** The calling actor's player field 'index', in the order 'state.player' declares them. */
@inline export function player(index: i32): f64 { assert(index >= 0 && index < playerCount()); return input(8 + sharedCount() + index); }

/** The events delivered this call, each a type (a 'hooks.scenes' row's 'type'), its target and its value. */
@inline export function eventCount(): i32 { return i32(load<f64>(IN + 32 * 8)); }
@inline function eventSlot(i: i32, k: i32): f64 { assert(i >= 0 && i < eventCount()); return load<f64>(IN + (33 + i * 6 + k) * 8); }
@inline export function eventType(i: i32): f64 { return eventSlot(i, 0); }
@inline export function eventTarget(i: i32): f64 { return eventSlot(i, 1); }
@inline export function eventValue(i: i32): f64 { return eventSlot(i, 2); }

/** One command record; a fifth in one call traps (the host would refuse it). */
function write(op: f64, a: f64, b: f64, c: f64, d: f64): void {
  assert(count < OUT_CAP);
  const at = OUT + count * RECORD;
  store<f64>(at, op); store<f64>(at + 8, a); store<f64>(at + 16, b); store<f64>(at + 24, c); store<f64>(at + 32, d);
  count += 1;
}
/** Set this entity's field 'id' (a 'fields' row) to 'value'. */
export function setField(id: f64, value: f64): void { write(1, id, value, 0, 0); }
/** Spawn a declared archetype at a position. */
export function spawn(archetype: f64, x: f64, y: f64, z: f64): void { write(2, archetype, x, y, z); }
/** Send a declared event to an entity, delivered next tick. */
export function emit(type: f64, target: f64, value: f64): void { write(3, type, target, value, 0); }
/** Move this entity. */
export function moveTo(x: f64, y: f64, z: f64): void { write(4, x, y, z, 0); }
/** Set shared field 'id' (a 'state.shared' row's id) to 'value': every player sees it. */
export function setShared(id: f64, value: f64): void { write(5, id, value, 0, 0); }
/** Set the calling actor's player field 'id' to 'value'. */
export function setPlayer(id: f64, value: f64): void { write(6, id, value, 0, 0); }
`;
