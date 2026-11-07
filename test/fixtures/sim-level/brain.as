@external("env", "query") declare function query(kind: i32, request: i32, response: i32): i32;
let ticks: i32 = 0;
export function abi_version(): i32 { return 0; }
export function init(lo: i32, hi: i32): void {}
export function in_ptr(): i32 { return 16384; }
export function in_cap(): i32 { return 4096; }
export function out_ptr(): i32 { return 24576; }
export function out_cap(): i32 { return 32; }
let count: i32 = 0;
export function out_count(): i32 { return count; }
function emit(index: i32, op: f64, a: f64, b: f64, c: f64): void {
  const p = 24576 + index * 40;
  store<f64>(p, op); store<f64>(p + 8, a); store<f64>(p + 16, b); store<f64>(p + 24, c); store<f64>(p + 32, 0);
}
export function on_tick(): void {
  ticks++;
  for (let i = 0; i < 8; i++) store<f64>(31000 + i * 8, 0);
  query(410, 31000, 32000);
  const speed = load<f64>(32000);
  store<f64>(31000, load<f64>(16416)); store<f64>(31008, load<f64>(16424) + 1); store<f64>(31016, load<f64>(16432));
  store<f64>(31032, -1); store<f64>(31048, 4);
  query(1, 31000, 32000);
  const distance = load<f64>(16464);
  emit(0, 1, 1, 0, 0); emit(1, 1, 2, distance > 2 ? speed : 0, 0);
  emit(2, 1, 3, 0, 0); emit(3, 1, 4, 4, 0); count = 4;
  if (distance <= 2 && ticks % 60 == 0) { emit(4, 3, 101, load<f64>(16408), 0); count++; }
}
