// ABI-v0 scene hook. Door and brazier ownership stays in declared shared state; the platform projects it to the panels/colliders.
// Shared fields arrive sorted by id after the state counts: 101 template.door.open, 102 to 104 template.brazier-a, -b, -c.
export function abi_version(): i32 { return 0; }
export function init(lo: i32, hi: i32): void {}
export function in_ptr(): i32 { return 16384; }
export function in_cap(): i32 { return 4096; }
export function out_ptr(): i32 { return 24576; }
export function out_cap(): i32 { return 4; }
let count: i32 = 0;
let ticks: i32 = 0;
export function out_count(): i32 { return count; }
@inline function setShared(field: f64, value: f64): void {
  const at = 24576 + count * 40;
  store<f64>(at, 5); store<f64>(at + 8, field); store<f64>(at + 16, value); store<f64>(at + 24, 0); store<f64>(at + 32, 0);
  count += 1;
}
export function on_tick(): void {
  count = 0; ticks += 1;
  let open = load<f64>(16384 + 64), toggled = false;
  // MH-2, MH-3: braziers A, B and C (fields 102 to 104, scene events 202 to 204) each light once, for good
  let lit = 0;
  const events = i32(load<f64>(16384 + 256));
  for (let i = 0; i < events; i++) {
    const type = load<f64>(16384 + (33 + i * 6) * 8);
    if (type === 201) { open = 1 - open; toggled = !toggled; }
    // E at a brazier: A's field opens the moss gate, B's raises the pond's stones, C's unlocks the arena
    for (let k = 0; k < 3; k++) if (type === <f64>(202 + k) && load<f64>(16384 + 72 + k * 8) < 0.5) lit |= 1 << k;
  }
  if (toggled) setShared(101, open);
  for (let k = 0; k < 3; k++) if (lit & (1 << k)) setShared(<f64>(102 + k), 1);
  store<i32>(30000, ticks); // continuation witness lives outside input/output regions
}
