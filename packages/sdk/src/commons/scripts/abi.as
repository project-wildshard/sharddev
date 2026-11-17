// Shared ABI-v0 setup: fixed request, parameter and four-effect buffers.
export function abi_version(): i32 { return 0; }
export function init(lo: i32, hi: i32): void {}
export function in_ptr(): i32 { return 16384; }
export function in_cap(): i32 { return 4096; }
export function out_ptr(): i32 { return 24576; }
export function out_cap(): i32 { return 4; }
let count: i32 = 0;
export function out_count(): i32 { return count; }
export function reset(): void { count = 0; }
@inline export function input(i: i32): f64 { return load<f64>(16384+i*8); }
@inline export function state(i: i32): f64 { return input(6+i); }
@inline export function param(i: i32): f64 { return load<f64>(8192+i*8); }
@inline export function field(id: f64, value: f64): void { const o = 24576+count*40; store<f64>(o,1); store<f64>(o+8,id); store<f64>(o+16,value); store<f64>(o+24,0); store<f64>(o+32,0); count++; }
