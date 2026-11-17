// ABI-v0 client script (SHARD-PLATFORM SF25, G66 "frozen, but alive-looking"): presentation-only idle motion for a
// visible frozen creature or prop. It reads only its copied inputs and its declared parameters and writes only the
// client lane's pose ops (101 offset, 102 rotation, 103 scale) and one particle op (104). A live entity gets the
// identity pose: its own sim pose and clips stay untouched.
//
// IN (f64 at 16384): [tick, divisor/60, frozen, self, x, y, z, readCount, ...values]
// parameters (query 410): [style, amplitude, rate, emitter]
//   style 0  breathe   a slow squash and stretch with a small bob (the grey blob)
//   style 1  graze     head-down nods with long rests, a slow drifting shuffle and a little yaw (the boar)
//   style 2  sway      a light two-axis rock about the base (foliage)
//   emitter  an admitted emitter id (0: none): one particle every rate-scaled interval while frozen
@external("env", "query") declare function query(kind: i32, input: i32, output: i32): i32;
export function abi_version(): i32 { return 0; }
export function init(lo: i32, hi: i32): void {}
export function in_ptr(): i32 { return 16384; }
export function in_cap(): i32 { return 4096; }
export function out_ptr(): i32 { return 24576; }
export function out_cap(): i32 { return 4; }
let count: i32 = 0;
export function out_count(): i32 { return count; }

@inline function emit(op: f64, a: f64, b: f64, c: f64): void {
  const at = 24576 + count * 40;
  store<f64>(at, op); store<f64>(at + 8, a); store<f64>(at + 16, b); store<f64>(at + 24, c); store<f64>(at + 32, 0);
  count += 1;
}
// Every call is metered by the module's size and NativeMath's range reduction is a call tree, so sine is a short
// polynomial over an argument wrapped with f64.floor (an instruction, not a call); a visual needs no more than 1e-2.
@inline function wave(a: f64): f64 {
  const x = a - Math.floor(a / 6.283185307179586 + 0.5) * 6.283185307179586, q = x * x;
  return x * (1 - q / 6 * (1 - q / 20 * (1 - q / 42 * (1 - q / 72))));
}
/** 0 → 1 → 0 over one unit, eased at both ends */
@inline function pulse(u: f64): f64 {
  if (u <= 0 || u >= 1) return 0;
  const s = wave(u * Math.PI);
  return s * s;
}

export function on_tick(): void {
  count = 0;
  const tick = load<f64>(16384), frozen = load<f64>(16384 + 16), self = load<f64>(16384 + 24);
  const x = load<f64>(16384 + 32), z = load<f64>(16384 + 48);
  query(410, 31000, 32000);
  const style = load<f64>(32000), amplitude = load<f64>(32008), rate = load<f64>(32016), emitter = load<f64>(32024);
  if (frozen < 0.5) { emit(101, 0, 0, 0); emit(102, 0, 0, 0); emit(103, 1, 1, 1); return; }
  const seconds = tick / 60;
  // each entity runs out of step with its neighbours (its id and where it stands)
  const phase = self * 1.37 + x * 0.113 + z * 0.071;
  if (style < 0.5) {
    const breath = wave(seconds * rate + phase);
    emit(101, 0, amplitude * 0.35 * (breath + 1), 0);
    emit(103, 1 - amplitude * 0.5 * breath, 1 + amplitude * breath, 1 - amplitude * 0.5 * breath);
  } else if (style < 1.5) {
    // a nod cycle of about 7 s: two quick bites, then a long look round
    const cycle = 7.0 / rate, w = (seconds + phase * 3) / cycle, u = w - Math.floor(w);
    const nod = pulse(u * 3.2) + 0.8 * pulse(u * 3.2 - 1.1);
    const drift = seconds * 0.07 + phase;
    emit(101, 0.35 * wave(drift), -0.04 * nod, 0.25 * wave(drift * 0.63 + 1.3));
    emit(102, amplitude * nod, 0.22 * wave(seconds * 0.19 + phase), 0.03 * wave(seconds * 1.1 + phase));
  } else {
    emit(102, amplitude * 0.6 * wave(seconds * rate * 0.71 + phase), 0, amplitude * wave(seconds * rate + phase));
  }
  if (emitter >= 1) {
    // once each time the lane's step (divisor ticks) crosses an interval boundary, whatever the divisor
    const every = Math.max(1, Math.floor(90 / rate + 0.5)), step = load<f64>(16384 + 8) * 60, at = tick + self * 7;
    if (Math.floor(at / every) != Math.floor((at - step) / every)) emit(104, emitter, 1, 0);
  }
}
