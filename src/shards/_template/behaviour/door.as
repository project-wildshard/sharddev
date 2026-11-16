// The Template's door and braziers (ABI v0, the sdk's `wildshard` prelude). Door and brazier ownership stays in declared
// shared state; the platform projects it to the panels and colliders. Shared fields in declared order: 0 template.door.open
// (id 101), then template.brazier-a, -b, -c (ids 102 to 104), TC-M4's south gate (105), then the Warden's two (110, 111),
// then TC-M4b's template.ledge.standing (112), which nothing sets.
import { begin, eventCount, eventType, setShared, shared } from './wildshard';
export { abi_version, init, in_ptr, in_cap, out_ptr, out_cap, out_count } from './wildshard';
const DOOR = 0, BRAZIERS = 1, SOUTH_GATE = 4;
const DOOR_FIELD: f64 = 101, BRAZIER_FIELD: f64 = 102;
const DOOR_TOGGLE: f64 = 201, BRAZIER_LIT: f64 = 202;
// TC-M4: the lever by the yard's south wall swings the south gate (field 105, scene event 205) open or shut
const GATE_FIELD: f64 = 105, LEVER_PULL: f64 = 205;
export function on_tick(): void {
  begin();
  let open = shared(DOOR), toggled = false, gate = shared(SOUTH_GATE), pulled = false;
  // MH-2, MH-3: braziers A, B and C (fields 102 to 104, scene events 202 to 204) each light once, for good
  let lit = 0;
  for (let i = 0; i < eventCount(); i++) {
    const type = eventType(i);
    if (type === DOOR_TOGGLE) { open = 1 - open; toggled = !toggled; }
    if (type === LEVER_PULL) { gate = 1 - gate; pulled = !pulled; }
    // E at a brazier: A's field opens the moss gate, B's raises the pond's stones, C's unlocks the arena
    for (let k = 0; k < 3; k++) if (type === BRAZIER_LIT + k && shared(BRAZIERS + k) < 0.5) lit |= 1 << k;
  }
  if (toggled) setShared(DOOR_FIELD, open);
  if (pulled) setShared(GATE_FIELD, gate);
  for (let k = 0; k < 3; k++) if (lit & (1 << k)) setShared(BRAZIER_FIELD + k, 1);
}
