/** Build-only Mulberry32; permanent equality tests fence the engine counterpart. */
/** Mulberry32 continuation, including fork seed and the legacy scrambled-fork mode. */
export interface RngState { version: number; state: number; initial: number; scrambledFork: boolean }
const uint32 = (value: number): boolean => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
function validateRngState(state: RngState): void {
  if (state.version !== 1 || !uint32(state.state) || !uint32(state.initial) || typeof state.scrambledFork !== 'boolean') throw new RangeError('Invalid RNG snapshot');
}
// Keep the instance shape structural: an engine RNG can exercise the same authored builder in oracle tests.
const states = new WeakMap<Rng, RngState>();
function continuation(rng: Rng): RngState {
  const current = states.get(rng);
  if (current === undefined) throw new Error('Author RNG has no continuation');
  return current;
}
/** Build-only Mulberry32 with draws, forks and saved continuations identical to the engine RNG. */
export class Rng {
  constructor(seed: number) { const initial = seed >>> 0; states.set(this, { version: 1, state: initial, initial, scrambledFork: false }); }
  snapshot(): RngState { const current = continuation(this); return { version: 1, state: current.state, initial: current.initial, scrambledFork: current.scrambledFork }; }
  restore(state: RngState): void {
    validateRngState(state);
    states.set(this, { version: 1, state: state.state, initial: state.initial, scrambledFork: state.scrambledFork });
  }
  /** Preserve the facade grammar's multiplicative constructor and numeric forks. */
  static scrambled(seed: number): Rng {
    const rng = new Rng((seed * 2654435761) >>> 0);
    continuation(rng).scrambledFork = true;
    return rng;
  }
  next(): number {
    const current = continuation(this);
    current.state = (current.state + 0x6d2b79f5) >>> 0;
    let t = current.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
  int(a: number, b: number): number { return Math.floor(this.range(a, b + 1)); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)] as T; } // an empty list yields undefined, as it always did
  chance(p: number): boolean { return this.next() < p; }
  weighted<T>(pairs: readonly (readonly [T, number])[]): T {
    let sum = 0;
    for (const [, weight] of pairs) sum += weight;
    let r = this.next() * sum;
    for (const [item, weight] of pairs) { r -= weight; if (r <= 0) return item; }
    const last = pairs[pairs.length - 1];
    if (last === undefined) throw new Error('Rng.weighted on an empty list');
    return last[0];
  }
  fork(salt: number | string): Rng {
    if (typeof salt === 'string') return new Rng(fnv1a32(`${String(continuation(this).initial)}:${salt}`));
    const seed = (continuation(this).state ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
    return continuation(this).scrambledFork ? Rng.scrambled(seed) : new Rng(seed);
  }
}

function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ (text.codePointAt(i) ?? 0), 0x01000193);
  return hash >>> 0;
}
