// The commit lane's time budget (silent under soft, warn to hard, block over hard), read against the machine's load:
// on a loaded machine (1-minute load per core above 1) a wall-clock overrun says the machine is busy, not that a slow
// check crept in, so it warns with the load instead of blocking (FORMAT-PRUNE FP40, J381: two SKIP_BUDGET=1 commits
// at 9.2-9.3 s on a loaded MacBook that ran the same lane green in 6.3 s idle).
import { availableParallelism, loadavg } from 'node:os';

/** The 1-minute load; PRECOMMIT_LOAD pins it (the hook tests run on machines of any load). */
export function machineLoad() { return process.env.PRECOMMIT_LOAD === undefined ? loadavg()[0] : Number(process.env.PRECOMMIT_LOAD); }

/** 'ok', 'warn', 'block', or 'loaded' (over hard on a busy machine: warn, never block). */
export function budgetVerdict(seconds, { soft, hard, skip = false, load = machineLoad(), cores = availableParallelism() }) {
  if (seconds <= soft) return 'ok';
  if (seconds <= hard || skip) return 'warn';
  return load / cores > 1 ? 'loaded' : 'block';
}
