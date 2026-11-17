/** H4 group-bank helpers over the SAME v2 state/candidate banks. A group call
 * lends one binding; its group state starts at offset and is host-bounded.
 * Claims use the original director's held-member mask, never a host import. */
export function groupBankSourceV2(offset: number, width: number): string {
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(width) || width < 1
    || offset + width > 4096) throw new Error('Invalid group bank span');
  return String.raw`
import * as core from './wsV2';
@inline function at(index:i32):usize {
  assert(index>=0&&index<${width});
  const binding=core.row(1,0);
  assert(core.count(1)==1&&core.handle()==load<i32>(binding));
  const base=load<u32>(binding+16),count=load<u32>(binding+20);
  assert(${offset}+u32(index)<count);
  return core.row(3,i32(base)+${offset}+index);
}
@inline export function value(index:i32):f64 { return load<f64>(at(index)); }
@inline export function write(index:i32,value:f64):void {
  assert(Math.abs(value)<Infinity);store<f64>(at(index),value);
}
@inline function mask(index:i32):u32 {
  const value=valueAt(index);assert(value>=0&&value<=65535&&Math.floor(value)==value);return u32(value);
}
@inline function valueAt(index:i32):f64 { return value(index); }
@inline export function claim(index:i32,slot:i32,capacity:i32):bool {
  assert(slot>=0&&slot<16&&capacity>=0&&capacity<=16);
  const held=mask(index),bit=u32(1)<<slot;assert(i32(popcnt<u32>(held))<=capacity);
  if((held&bit)!=0)return true;
  if(i32(popcnt<u32>(held))>=capacity)return false;
  write(index,f64(held|bit));return true;
}
@inline export function release(index:i32,slot:i32):void {
  assert(slot>=0&&slot<16);write(index,f64(mask(index)&~(u32(1)<<slot)));
}
`;
}
