/** Guest reads for the H4 ordered group-member columns. The native owner and
 * build declaration fix the shape; no guest pointer chooses a live object. */
export function groupStepSourceV2(columns: number, members: number): string {
  if (!Number.isInteger(columns) || columns < 0 || columns > 128 || !Number.isInteger(members) || members < 1 || members > 16)
    throw new Error('Invalid group member column shape');
  return `import * as core from './wsV2';
@inline export function memberCount():i32{const n=core.parameter(1);assert(n>=0&&n<=${members}&&n==Math.floor(n));return i32(n);}
@inline export function member(slot:i32,column:i32):f64{
  assert(slot>=0&&slot<memberCount()&&column>=0&&column<${columns});
  const index=slot*${columns}+column;assert(core.fieldId(index)==index+1);return core.field(index);
}
`;
}
