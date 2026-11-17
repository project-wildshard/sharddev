// Mode0 keeps a declared deck enabled; mode1 raises a winched deck after both locks.
import { reset, input, state, param, field } from './abi';
@external("env", "query") declare function query(kind: i32, request: i32, response: i32): i32;
export function on_tick(): void {
  reset();
  if (query(410, 4096, 8192) < 1) unreachable();
  if (param(0) === 0) { field(4,1); return; }
  let angle = state(0), raised = state(4), raising = state(5);
  const action = input(2), unlocked = input(4) === 3;
  if (action === 3) { angle = 0; raised = 1; raising = 0; }
  else if ((action === 1 && unlocked) || action === 2) { if (raised === 0) raising = 1; }
  if (raising === 1 && raised === 0) { angle = min(0, angle+input(1)*param(1)); if (angle >= 0) { raised = 1; raising = 0; } }
  field(1,angle); field(4,raised); field(5,raised); field(6,raising);
}
