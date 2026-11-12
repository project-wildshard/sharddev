// ABI-v0 scene hook. Door and brazier ownership stays in declared shared state; the platform projects it to the panels/colliders.
// Shared fields arrive sorted by id after the state counts: 101 template.door.open, 102 template.brazier-a.
export function abi_version(): i32 { return 0; }
export function init(lo: i32, hi: i32): void {}
export function in_ptr(): i32 { return 16384; }
export function in_cap(): i32 { return 4096; }
export function out_ptr(): i32 { return 24576; }
export function out_cap(): i32 { return 2; }
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
  const brazier = load<f64>(16384 + 72); let lit = false;
  const events = i32(load<f64>(16384 + 256));
  for (let i = 0; i < events; i++) {
    const type = load<f64>(16384 + (33 + i * 6) * 8);
    if (type === 201) { open = 1 - open; toggled = !toggled; }
    // MH-2: E at brazier A lights it for good (the moss gate's panel and collider follow the field)
    if (type === 202 && brazier < 0.5) lit = true;
  }
  if (toggled) setShared(101, open);
  if (lit) setShared(102, 1);
  store<i32>(30000, ticks); // continuation witness lives outside input/output regions
}
