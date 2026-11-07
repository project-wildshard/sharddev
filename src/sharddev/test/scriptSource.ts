/** Data-only ABI fixture: input/effect storage is disjoint from the compiler's heap. */
export function scriptSource(body = '', extra = '', count = '0'): string {
  return `${extra}
export function abi_version():i32 { return 0; }
export function init(lo:i32, hi:i32):void {}
export function in_ptr():i32 { return 16384; }
export function in_cap():i32 { return 4096; }
export function out_ptr():i32 { return 24576; }
export function out_cap():i32 { return 32; }
export function out_count():i32 { return ${count}; }
export function on_tick():void { ${body} }`;
}
